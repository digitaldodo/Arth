import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Database Schema & Migration Integrity Audit', () => {
  const migrationsDir = path.resolve(process.cwd(), '../supabase/migrations');

  test('All 12 numbered migration files exist in sequential order', () => {
    assert.ok(fs.existsSync(migrationsDir), 'supabase/migrations directory must exist');
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

    const expectedFiles = [
      '0001_create_profiles.sql',
      '0002_create_categories.sql',
      '0003_create_transactions.sql',
      '0004_create_outbox_events.sql',
      '0005_rls_policies.sql',
      '0006_auth_trigger.sql',
      '0007_indexes.sql',
      '0008_category_reorder.sql',
      '0009_people_tracker.sql',
      '0010_database_hardening.sql',
      '0011_history_protection_and_settlement_hardening.sql',
      '0012_dashboard_summary.sql',
      '0013_auth_username_support.sql',
      '0014_username_authentication_and_lookup.sql',
      '0015_category_reorder_hardening.sql',
      '0016_account_deletion_support.sql'
    ];

    assert.deepEqual(files, expectedFiles, 'Migrations must strictly follow documented numbered sequence');
  });

  test('0001_create_profiles.sql enforces user relation and timezone defaults', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, '0001_create_profiles.sql'), 'utf-8');
    assert.ok(sql.includes('REFERENCES auth.users(id) ON DELETE CASCADE'), 'Profile must reference auth.users(id)');
    assert.ok(sql.includes("'Asia/Kolkata'"), 'Timezone default must be Asia/Kolkata');
    assert.ok(sql.includes("'INR'"), 'Currency default must be INR');
    assert.ok(sql.includes('trg_profiles_updated_at'), 'updated_at trigger must be registered');
  });

  test('0002_create_categories.sql enforces income/expense type and composite uniqueness', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, '0002_create_categories.sql'), 'utf-8');
    assert.ok(sql.includes('type         public.transaction_type NOT NULL'), 'Category must distinguish transaction_type');
    assert.ok(sql.includes('archived_at  TIMESTAMPTZ'), 'Category must support non-destructive soft archiving');
    assert.ok(sql.includes('uq_categories_id_user_type UNIQUE (id, user_id, type)'), 'Composite unique constraint must be present for FK validation');
    assert.ok(sql.includes('WHERE archived_at IS NULL'), 'Case-insensitive unique index must filter active categories');
  });

  test('0003_create_transactions.sql enforces paise BIGINT, necessity constraint, and composite category FK', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, '0003_create_transactions.sql'), 'utf-8');
    assert.ok(sql.includes('amount_paise       BIGINT NOT NULL CHECK (amount_paise > 0)'), 'Amount must be strictly positive BIGINT paise');
    assert.ok(sql.includes('FOREIGN KEY (category_id, user_id, type)'), 'Transaction must link category, user, and type via composite foreign key');
    assert.ok(sql.includes('chk_transactions_necessity'), 'Necessity rule must be enforced: required for expense, null for income');
    assert.ok(sql.includes('deleted_at         TIMESTAMPTZ'), 'Transaction must support reversible soft deletion');
  });

  test('0004_create_outbox_events.sql establishes transactional outbox and trigger', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, '0004_create_outbox_events.sql'), 'utf-8');
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.outbox_events'), 'Outbox table must be declared');
    assert.ok(sql.includes('fn_transactions_outbox_event'), 'Trigger function for outbox events must exist');
    assert.ok(sql.includes('trg_transactions_outbox'), 'AFTER INSERT OR UPDATE trigger must be attached to transactions');
    assert.ok(sql.includes('transaction.created') && sql.includes('transaction.deleted'), 'Outbox must record create and soft-delete event types');
  });

  test('0005_rls_policies.sql enables RLS and enforces least privilege grants', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, '0005_rls_policies.sql'), 'utf-8');
    assert.ok(sql.includes('ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;'), 'RLS must be enabled on profiles');
    assert.ok(sql.includes('ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;'), 'RLS must be enabled on categories');
    assert.ok(sql.includes('ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;'), 'RLS must be enabled on transactions');
    assert.ok(sql.includes('ALTER TABLE public.outbox_events ENABLE ROW LEVEL SECURITY;'), 'RLS must be enabled on outbox_events');
    assert.ok(sql.includes('REVOKE ALL ON SCHEMA public FROM public;'), 'Public privileges must be revoked');
    assert.ok(!sql.includes('GRANT SELECT ON public.outbox_events TO authenticated;'), 'Authenticated users must NOT be granted SELECT on outbox_events');
  });

  test('0006_auth_trigger.sql provides automatic provisioning and seed taxonomy', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, '0006_auth_trigger.sql'), 'utf-8');
    assert.ok(sql.includes('fn_seed_default_categories'), 'Seed function must exist');
    assert.ok(sql.includes("'Food & Dining'") && sql.includes("'Travel'"), 'Expense taxonomy must include approved categories');
    assert.ok(sql.includes("'Salary'") && sql.includes("'Investments'"), 'Income taxonomy must include approved categories');
    assert.ok(sql.includes('fn_handle_new_user'), 'Auth hook trigger function must be present');
  });

  test('0007_indexes.sql defines optimal covering indexes', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, '0007_indexes.sql'), 'utf-8');
    assert.ok(sql.includes('idx_transactions_user_date_active'), 'Active transactions date index must be present');
    assert.ok(sql.includes('idx_categories_user_type_sort'), 'Category sorting index must be present');
    assert.ok(sql.includes('idx_outbox_status_pending_created'), 'Pending outbox index must be present');
  });

  test('0008_category_reorder.sql enforces atomic category reordering with SECURITY INVOKER', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, '0008_category_reorder.sql'), 'utf-8');
    assert.ok(sql.includes('fn_reorder_categories'), 'Reorder function must exist');
    assert.ok(sql.includes('SECURITY INVOKER'), 'Function must execute with caller permissions and RLS');
    assert.ok(sql.includes('auth.uid()'), 'Function must verify user context');
    assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.fn_reorder_categories'), 'Execution grant to authenticated role must be present');
  });

  test('0009_people_tracker.sql defines people, records, settlements, and atomic settlement function', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, '0009_people_tracker.sql'), 'utf-8');
    assert.ok(sql.includes('CREATE TYPE public.person_direction AS ENUM'), 'person_direction ENUM must be defined');
    assert.ok(sql.includes('CREATE TABLE public.people'), 'people table must be declared');
    assert.ok(sql.includes('CREATE TABLE public.person_money_records'), 'person_money_records table must be declared');
    assert.ok(sql.includes('CREATE TABLE public.person_money_settlements'), 'person_money_settlements table must be declared');
    assert.ok(sql.includes('amount_paise BIGINT NOT NULL CHECK (amount_paise > 0)'), 'Amounts must be positive BIGINT paise');
    assert.ok(sql.includes('fn_record_person_settlement'), 'Atomic settlement function must exist');
    assert.ok(sql.includes('FOR UPDATE'), 'Settlement function must lock record for update against concurrent over-settlement');
    assert.ok(sql.includes('ENABLE ROW LEVEL SECURITY'), 'RLS must be enabled on people tables');
    assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.fn_record_person_settlement'), 'Execution grant to authenticated must be present');
  });

  test('0010_database_hardening.sql enforces idempotency, history protection, row locking, and covering indexes', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, '0010_database_hardening.sql'), 'utf-8');
    assert.ok(sql.includes('ON DELETE RESTRICT'), 'Cascade deletion must be replaced with ON DELETE RESTRICT for financial history protection');
    assert.ok(sql.includes('REVOKE INSERT, UPDATE, DELETE ON public.person_money_settlements FROM authenticated;'), 'Direct mutations on settlements must be revoked from authenticated users');
    assert.ok(sql.includes('SECURITY DEFINER') && sql.includes('SET search_path = public, auth'), 'fn_record_person_settlement must be SECURITY DEFINER with fixed search_path');
    assert.ok(sql.includes('23505'), 'fn_record_person_settlement must reject conflicting ID replay with 23505');
    assert.ok(sql.includes('PERFORM 1') && sql.includes('FOR UPDATE'), 'fn_reorder_categories must lock active category rows against concurrent race conditions');
    assert.ok(sql.includes('idx_transactions_user_type_date'), 'Composite type-date index must exist for transactions');
    assert.ok(sql.includes('idx_people_user_direction_active'), 'Direction index must exist for people');
    assert.ok(sql.includes('idx_records_person_active'), 'Active records index must exist for person_money_records');
    assert.ok(sql.includes('idx_settlements_record_amount'), 'Covering amount index must exist for person_money_settlements');
  });

  test('0011_history_protection_and_settlement_hardening.sql revokes direct deletes and hardens settlement concurrency', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, '0011_history_protection_and_settlement_hardening.sql'), 'utf-8');
    assert.ok(sql.includes('REVOKE DELETE ON public.people FROM authenticated;'), 'Direct DELETE on people must be revoked');
    assert.ok(sql.includes('REVOKE DELETE ON public.person_money_records FROM authenticated;'), 'Direct DELETE on person_money_records must be revoked');
    assert.ok(sql.includes('DROP POLICY IF EXISTS "people_delete_own" ON public.people;'), 'people_delete_own policy must be dropped');
    assert.ok(sql.includes('DROP POLICY IF EXISTS "records_delete_own" ON public.person_money_records;'), 'records_delete_own policy must be dropped');
    assert.ok(sql.includes('v_existing_settlement.notes IS NULL AND p_notes IS NULL'), 'Settlement idempotency must strictly compare notes');
    assert.ok(sql.includes('Post-Lock Re-check for Concurrent Identical Retries'), 'Settlement function must re-check ID after acquiring FOR UPDATE lock');
    assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.fn_record_person_settlement(UUID, UUID, BIGINT, DATE, TEXT) FROM PUBLIC;'), 'Revoke from PUBLIC');
    assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.fn_record_person_settlement(UUID, UUID, BIGINT, DATE, TEXT) FROM anon;'), 'Revoke from anon');
    assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.fn_record_person_settlement(UUID, UUID, BIGINT, DATE, TEXT) TO authenticated;'), 'Grant only to authenticated');
  });

  test('0012_dashboard_summary.sql enforces SECURITY INVOKER, date range validation, and authenticated-only grant', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, '0012_dashboard_summary.sql'), 'utf-8');
    assert.ok(sql.includes('fn_dashboard_summary'), 'Dashboard summary function must exist');
    assert.ok(sql.includes('SECURITY INVOKER'), 'Function must execute with caller permissions for RLS compliance');
    assert.ok(sql.includes('SET search_path = public, auth'), 'Fixed search_path must be configured');
    assert.ok(sql.includes('p_start_date > p_end_date'), 'Reversed date range must be rejected');
    assert.ok(sql.includes("FILTER (WHERE type = 'income')"), 'Income aggregation must filter on income type');
    assert.ok(sql.includes("FILTER (WHERE type = 'expense')"), 'Expense aggregation must filter on expense type');
    assert.ok(!sql.includes('person_money'), 'People records and settlements must NOT be referenced');
    assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.fn_dashboard_summary(DATE, DATE) FROM PUBLIC;'), 'Revoke from PUBLIC');
    assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.fn_dashboard_summary(DATE, DATE) FROM anon;'), 'Revoke from anon');
    assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.fn_dashboard_summary(DATE, DATE) TO authenticated;'), 'Grant to authenticated');
  });

  test('0013_auth_username_support.sql prioritizes username from raw_user_meta_data', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, '0013_auth_username_support.sql'), 'utf-8');
    assert.ok(sql.includes('fn_handle_new_user'), 'Auth trigger function must be updated');
    assert.ok(sql.includes("NEW.raw_user_meta_data->>'username'"), 'Username must be extracted from metadata');
    assert.ok(sql.includes('ON CONFLICT (id) DO UPDATE'), 'Must handle conflict and update display name');
  });

  test('0014_username_authentication_and_lookup.sql enforces case-insensitive uniqueness, format check, and service_role isolation', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, '0014_username_authentication_and_lookup.sql'), 'utf-8');
    assert.ok(sql.includes('ALTER TABLE public.profiles'), 'Must alter public.profiles to add username');
    assert.ok(sql.includes('chk_profiles_username_format'), 'Check constraint for username format must exist');
    assert.ok(sql.includes('uq_profiles_lower_username'), 'Case-insensitive unique index must exist');
    assert.ok(sql.includes('fn_get_email_by_username'), 'Lookup function must exist');
    assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.fn_get_email_by_username(TEXT) FROM anon;'), 'Lookup must be revoked from anon');
    assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.fn_get_email_by_username(TEXT) FROM authenticated;'), 'Lookup must be revoked from authenticated');
    assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.fn_get_email_by_username(TEXT) TO service_role;'), 'Lookup must only be granted to service_role');
    assert.ok(sql.includes('fn_check_username_available'), 'Public availability check function must exist');
    assert.ok(sql.includes('fn_set_own_username'), 'Self-service username assignment function must exist');
  });

  test('0015_category_reorder_hardening.sql resolves ambiguous column references and enforces SECURITY INVOKER with row locking', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, '0015_category_reorder_hardening.sql'), 'utf-8');
    assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.fn_reorder_categories'), 'Must define fn_reorder_categories');
    assert.ok(sql.includes('#variable_conflict use_column'), 'Must set variable_conflict to use_column');
    assert.ok(sql.includes('FROM public.categories c'), 'Must qualify categories table alias');
    assert.ok(sql.includes('c.type = p_type'), 'Must qualify type column to prevent 42702 ambiguity');
    assert.ok(sql.includes('c.user_id = v_user_id'), 'Must qualify user_id column');
    assert.ok(sql.includes('FOR UPDATE'), 'Must maintain FOR UPDATE row lock');
    assert.ok(sql.includes('SECURITY INVOKER'), 'Must remain SECURITY INVOKER');
    assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.fn_reorder_categories'), 'Must grant execute to authenticated');
  });

  test('0016_account_deletion_support.sql defines atomic purge in reverse-dependency order with SECURITY DEFINER', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, '0016_account_deletion_support.sql'), 'utf-8');
    assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.fn_delete_own_account'), 'Must define fn_delete_own_account');
    assert.ok(sql.includes('SECURITY DEFINER'), 'Must execute with SECURITY DEFINER to purge restricted records');
    assert.ok(sql.includes('v_user_id UUID := auth.uid();'), 'Must isolate to auth.uid()');
    assert.ok(sql.includes('DELETE FROM public.person_money_settlements'), 'Must purge settlements first');
    assert.ok(sql.includes('DELETE FROM public.person_money_records'), 'Must purge money records second');
    assert.ok(sql.includes('DELETE FROM public.people'), 'Must purge people third');
    assert.ok(sql.includes('DELETE FROM public.transactions'), 'Must purge transactions fourth');
    assert.ok(sql.includes('DELETE FROM public.categories'), 'Must purge categories fifth');
    assert.ok(sql.includes('DELETE FROM public.outbox_events'), 'Must purge outbox events sixth');
    assert.ok(sql.includes('DELETE FROM public.profiles'), 'Must purge profile seventh');
    assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.fn_delete_own_account() FROM anon'), 'Must revoke from anon');
    assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.fn_delete_own_account() TO authenticated'), 'Must grant execute to authenticated');
  });
});
