import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Database Schema & Migration Integrity Audit', () => {
  const migrationsDir = fs.existsSync(path.resolve(process.cwd(), '../supabase/migrations'))
    ? path.resolve(process.cwd(), '../supabase/migrations')
    : path.resolve(process.cwd(), 'supabase/migrations');

  test('All numbered migration files exist in sequential order', () => {
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
      '0016_account_deletion_support.sql',
      '0017_google_sheets_sync.sql',
      '0018_account_balances_and_transfers.sql',
      '0019_username_system_enhancements.sql',
      '0020_supabase_cron_schedules.sql',
      '0021_dashboard_necessity_spending.sql',
      '0022_app_lock_webauthn.sql',
      '0023_fix_profiles_balances_configured.sql',
      '0024_account_balances_rpc_hardening.sql',
      '0025_balance_snapshot_and_non_negative_balances.sql',
      '0026_harden_unconfigured_balances_and_ownership.sql',
      '0027_dashboard_lifetime_and_empty_state.sql',
      '0028_financial_documents_accounts_and_tax.sql',
      '0029_statement_transaction_references.sql',
      '0030_statement_import_snapshots_and_atomic_undo.sql',
      '0031_account_reconciliation.sql',
      '0032_statement_account_balances.sql',
      '0033_statement_skipped_rows.sql',
      '0034_username_uniqueness_and_identity_hardening.sql',
      '0035_transaction_ingestion_provenance.sql',
      '0036_expand_ingestion_sources.sql'
    ];

    assert.deepEqual(files, expectedFiles, 'Migrations must strictly follow documented numbered sequence');
  });

  test('0028 financial records migration is additive, owner scoped, and requires private retention expiry', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, '0028_financial_documents_accounts_and_tax.sql'), 'utf-8');
    assert.ok(sql.includes('CREATE TABLE public.financial_accounts'), 'Must add financial accounts');
    assert.ok(sql.includes('ALTER TABLE public.transactions\n  ADD COLUMN account_id UUID'), 'Must add account links without replacing transactions');
    assert.ok(sql.includes('ENABLE ROW LEVEL SECURITY'), 'New records must have RLS enabled');
    assert.ok(sql.includes("'arth-private-documents'"), 'Retained documents must use the private bucket');
    assert.ok(sql.includes("retention_mode = 'retain_until' AND storage_path IS NOT NULL AND retained_until IS NOT NULL"), 'Retained documents require path and expiry');
    assert.ok(!/DROP\s+(TABLE|COLUMN)\b/i.test(sql), 'Migration must not contain destructive table or column drops');
  });

  test('0033 stores only an array of privacy-minimized statement skip reasons', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, '0033_statement_skipped_rows.sql'), 'utf-8');
    assert.match(sql, /ALTER TABLE public\.statement_import_batches\s+ADD COLUMN skipped_rows JSONB NOT NULL DEFAULT '\[\]'::jsonb/i);
    assert.match(sql, /CHECK \(jsonb_typeof\(skipped_rows\) = 'array'\)/i);
    assert.doesNotMatch(sql, /DROP\s+(TABLE|COLUMN)|TRUNCATE/i, 'Migration must not remove existing financial history');
  });

  test('0029 adds a bounded statement reference for transaction-level matching', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, '0029_statement_transaction_references.sql'), 'utf-8');
    assert.ok(sql.includes('ADD COLUMN statement_reference TEXT'), 'Must store bank reference/UTR on the transaction');
    assert.ok(sql.includes('char_length(statement_reference) <= 120'), 'Must bound user-provided references');
    assert.ok(!/DROP\s+(TABLE|COLUMN)\b/i.test(sql), 'Migration must be additive');
  });

  test('0030 snapshots imported rows and atomically refuses unsafe batch undo', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, '0030_statement_import_snapshots_and_atomic_undo.sql'), 'utf-8');
    assert.ok(sql.includes('CREATE TABLE public.statement_import_batch_items'), 'Must persist per-transaction undo evidence');
    assert.ok(sql.includes('SECURITY DEFINER'), 'Snapshot trigger must write its immutable evidence without authenticated insert access');
    assert.ok(sql.includes("v_batch.status NOT IN ('completed', 'partial')"), 'Undo must require a finished batch');
    assert.ok(sql.includes('source_snapshot IS DISTINCT FROM'), 'Undo must reject modified transactions');
    assert.ok(sql.includes('ORDER BY id FOR UPDATE'), 'Undo must lock imported rows before checking snapshots');
    assert.ok(sql.includes('One or more imported transactions are linked to reconciliation records'), 'Undo must preserve linked records');
    assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.undo_statement_import_batch(UUID) TO authenticated'), 'Authenticated users must be able to invoke their own RLS-scoped undo');
    assert.ok(!/DROP\s+(TABLE|COLUMN)\b/i.test(sql), 'Migration must be additive');
  });

  test('0031 validates explicitly confirmed transfer pairs and removes them from dashboard totals', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, '0031_account_reconciliation.sql'), 'utf-8');
    assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.confirm_transaction_reconciliation'));
    assert.ok(sql.indexOf('ADD COLUMN transaction_link_id UUID') < sql.indexOf('CREATE OR REPLACE FUNCTION public.confirm_transaction_reconciliation'), 'Relationship columns must exist before the RPC is defined');
    assert.ok(sql.includes('ORDER BY id FOR UPDATE'));
    assert.ok(sql.includes('v_first.amount_paise <> v_second.amount_paise'));
    assert.ok(sql.includes('v_first.type = v_second.type'));
    assert.ok(sql.includes("l.status = 'confirmed'"));
    assert.ok(sql.includes("l.relationship IN ('transfer_pair', 'card_settlement')"));
    assert.ok(sql.includes('REVOKE INSERT, UPDATE, DELETE ON public.transaction_links FROM authenticated'));
    assert.ok(sql.includes('REVOKE INSERT, UPDATE, DELETE ON public.account_movements FROM authenticated'));
    assert.ok(sql.includes('UUID version 7'));
    assert.ok(sql.includes('fn_protect_confirmed_reconciliation_pair'));
    assert.ok(sql.includes('INSERT INTO public.account_movements'));
    assert.ok(sql.includes("WHERE user_id = v_user AND status = 'rejected'"), 'Retrying a previously rejected pair must reuse its historical link');
    assert.ok(sql.includes('deleted_at = NULL'), 'Reconfirming a pair must reactivate its linked movement');
    assert.ok(sql.includes('UPDATE public.account_movements SET deleted_at = now()'));
  });

  test('0032 keeps account-linked statement rows outside legacy balances and exposes exact account balances', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, '0032_statement_account_balances.sql'), 'utf-8');
    assert.ok(sql.includes('AND account_id IS NULL'), 'Legacy cash and online balances must ignore account-linked entries');
    assert.ok(/IF NEW\.account_id IS NOT NULL THEN[\s\S]{0,250}RETURN NEW;/.test(sql), 'Account-linked transactions must bypass legacy balance validation');
    assert.ok(sql.includes('fn_financial_account_balances()'), 'Must expose per-account balances');
    assert.ok(sql.includes('current_balance_paise TEXT'), 'Balances must cross JSON/API boundaries as exact decimal strings');
    assert.ok(sql.includes('a.opening_balance_paise + coalesce(sum(t.amount_paise)'), 'Balance aggregation must use integer paise');
    assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.fn_financial_account_balances() FROM PUBLIC, anon;'));
    assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.fn_financial_account_balances() TO authenticated;'));
    assert.ok(!/DROP\s+(TABLE|COLUMN)\b/i.test(sql), 'Migration must be additive');
  });

  
  test('0027_dashboard_lifetime_and_empty_state.sql supports lifetime summary and nullable date range', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, '0027_dashboard_lifetime_and_empty_state.sql'), 'utf-8');
    assert.ok(sql.includes('p_start_date DATE DEFAULT NULL'), 'Must define nullable p_start_date');
    assert.ok(sql.includes('p_end_date DATE DEFAULT NULL'), 'Must define nullable p_end_date');
    assert.ok(sql.includes('p_start_date IS NULL OR transaction_date >= p_start_date'), 'Must allow unbounded start date');
    assert.ok(sql.includes('p_end_date IS NULL OR transaction_date <= p_end_date'), 'Must allow unbounded end date');
    assert.ok(sql.includes('v_total_active_count'), 'Must track total active transactions across all time');
  });

  test('0026_harden_unconfigured_balances_and_ownership.sql enforces zero-baseline unconfigured balance model, movement updates, and user ownership immutability', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, '0026_harden_unconfigured_balances_and_ownership.sql'), 'utf-8');
    assert.ok(sql.includes('Cannot change user ownership of a transaction'), 'Must prohibit changing user_id on transactions');
    assert.ok(sql.includes('Cannot change user ownership of a balance movement'), 'Must prohibit changing user_id on movements');
    assert.ok(sql.includes('Physical deletion is not permitted'), 'Must prohibit physical deletion');
    assert.ok(sql.includes('v_starting_cash := 0'), 'Must enforce zero-baseline cash when unconfigured');
    assert.ok(sql.includes('v_starting_online := 0'), 'Must enforce zero-baseline online when unconfigured');
    assert.ok(sql.includes('FOR UPDATE'), 'Must serialize on user profile row lock');
    assert.ok(sql.includes("TG_OP <> 'UPDATE' OR id <> NEW.id"), 'Must exclude updating row during balance recalculation');
  });

  test('0025_balance_snapshot_and_non_negative_balances.sql enforces snapshot boundary, non-negative balance triggers, and FOR UPDATE locking', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, '0025_balance_snapshot_and_non_negative_balances.sql'), 'utf-8');
    assert.ok(sql.includes('fn_validate_transaction_balance'), 'Must define fn_validate_transaction_balance trigger function');
    assert.ok(sql.includes('fn_validate_movement_balance'), 'Must define fn_validate_movement_balance trigger function');
    assert.ok(sql.includes('FOR UPDATE'), 'Must acquire row lock on profiles for concurrency safety');
    assert.ok(sql.includes('balances_configured_at'), 'Must filter transactions by balances_configured_at snapshot timestamp');
    assert.ok(sql.includes('recorded_at'), 'Must define and use recorded_at immutable timestamp');
    assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.fn_account_balances() FROM PUBLIC;'), 'Must revoke from PUBLIC');
    assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.fn_account_balances() TO authenticated;'), 'Must grant execute to authenticated role');
    assert.ok(sql.includes('chk_profiles_starting_cash_non_negative'), 'Must enforce non-negative check on starting_cash_paise');
    assert.ok(sql.includes('chk_profiles_starting_online_non_negative'), 'Must enforce non-negative check on starting_online_paise');
    assert.ok(sql.includes('NEW.recorded_at := OLD.recorded_at;'), 'Must enforce recorded_at immutability on update');
    assert.ok(sql.includes('Physical deletion is not permitted'), 'Must forbid physical deletion');
  });


  test('0024_account_balances_rpc_hardening.sql ensures fn_account_balances, execute grants, balance_movements, and schema reload', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, '0024_account_balances_rpc_hardening.sql'), 'utf-8');
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.balance_movements'), 'Must ensure balance_movements table exists');
    assert.ok(sql.includes('ENABLE ROW LEVEL SECURITY'), 'Must enable RLS on balance_movements');
    assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.fn_account_balances()'), 'Must define fn_account_balances function');
    assert.ok(sql.includes('SECURITY INVOKER'), 'Must execute with SECURITY INVOKER');
    assert.ok(sql.includes('SET search_path = public, auth'), 'Must restrict search_path');
    assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.fn_account_balances() FROM PUBLIC;'), 'Must revoke from PUBLIC');
    assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.fn_account_balances() FROM anon;'), 'Must revoke from anon');
    assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.fn_account_balances() TO authenticated;'), 'Must grant execute to authenticated role');
    assert.ok(sql.includes("NOTIFY pgrst, 'reload schema'"), 'Must notify PostgREST to reload schema cache');
  });
  test('0023_fix_profiles_balances_configured.sql ensures starting balance columns and atomic RPC', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, '0023_fix_profiles_balances_configured.sql'), 'utf-8');
    assert.ok(sql.includes('ALTER TABLE public.profiles'), 'Must alter public.profiles');
    assert.ok(sql.includes('ADD COLUMN IF NOT EXISTS balances_configured BOOLEAN'), 'Must ensure balances_configured column');
    assert.ok(sql.includes('fn_configure_starting_balances'), 'Must create fn_configure_starting_balances function');
    assert.ok(sql.includes("NOTIFY pgrst, 'reload schema'"), 'Must reload PostgREST schema cache');
  });

  test('0022_app_lock_webauthn.sql keeps WebAuthn credentials and challenges server-only', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, '0022_app_lock_webauthn.sql'), 'utf-8');
    assert.ok(sql.includes('CREATE TABLE public.app_lock_credentials'), 'Must store app lock credentials');
    assert.ok(sql.includes('CREATE TABLE public.app_lock_challenges'), 'Must store expiring ceremony challenges');
    assert.ok(sql.includes('ENABLE ROW LEVEL SECURITY'), 'Both tables must enable RLS');
    assert.ok(sql.includes('REVOKE ALL ON public.app_lock_credentials FROM anon, authenticated'), 'Browser roles must not access credentials');
    assert.ok(sql.includes('REVOKE ALL ON public.app_lock_challenges FROM anon, authenticated'), 'Browser roles must not access challenges');
  });

  test('0020_supabase_cron_schedules.sql configures pg_cron, outbox recovery and idempotent schedules', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, '0020_supabase_cron_schedules.sql'), 'utf-8');
    assert.ok(sql.includes('CREATE EXTENSION IF NOT EXISTS pg_cron'), 'Must safely create pg_cron extension');
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.cron_job_runs'), 'Must create cron_job_runs audit table');
    assert.ok(sql.includes('fn_recover_stale_outbox_events'), 'Must define outbox lease recovery function');
    assert.ok(sql.includes('cron.unschedule'), 'Must unschedule existing jobs before scheduling to prevent duplicates');
    assert.ok(sql.includes('*/5 * * * *'), 'Must register 5-minute recovery cron');
    assert.ok(sql.includes('30 21 * * *'), 'Must register daily reconciliation cron');
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

  test('0017_google_sheets_sync.sql defines user_sheet_connections and atomic fn_claim_outbox_events', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, '0017_google_sheets_sync.sql'), 'utf-8');
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.user_sheet_connections'), 'Must create user_sheet_connections table');
    assert.ok(sql.includes('ENABLE ROW LEVEL SECURITY'), 'Must enable RLS on user_sheet_connections');
    assert.ok(sql.includes('auth.uid() = user_id'), 'Must isolate sheet connections to auth.uid()');
    assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.fn_claim_outbox_events'), 'Must define fn_claim_outbox_events');
    assert.ok(sql.includes('FOR UPDATE SKIP LOCKED'), 'Must use SKIP LOCKED for concurrent-safe outbox claiming');
    assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.fn_claim_outbox_events(INT, TEXT, INT) TO service_role'), 'Must grant claiming to service_role');
  });

  test('0018_account_balances_and_transfers.sql defines starting balances, balance_movements, and fn_account_balances', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, '0018_account_balances_and_transfers.sql'), 'utf-8');
    assert.ok(sql.includes('starting_cash_paise BIGINT NOT NULL DEFAULT 0'), 'Must add starting_cash_paise to profiles');
    assert.ok(sql.includes('starting_online_paise BIGINT NOT NULL DEFAULT 0'), 'Must add starting_online_paise to profiles');
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.balance_movements'), 'Must create balance_movements table');
    assert.ok(sql.includes('ENABLE ROW LEVEL SECURITY'), 'Must enable RLS on balance_movements');
    assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.fn_account_balances'), 'Must define fn_account_balances function');
    assert.ok(sql.includes('SECURITY INVOKER'), 'Must execute with SECURITY INVOKER for caller security');
  });

  test('0019_username_system_enhancements.sql enforces NOT NULL, format regex, reserved names rejection, unique generation and atomic updates', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, '0019_username_system_enhancements.sql'), 'utf-8');
    assert.ok(sql.includes('ALTER COLUMN username SET NOT NULL'), 'Must enforce NOT NULL on username');
    assert.ok(sql.includes("username ~ '^[a-z0-9_]{3,20}$'"), 'Must enforce strict 3-20 lowercase alphanumeric + underscore regex');
    assert.ok(sql.includes("'admin'") && sql.includes("'support'") && sql.includes("'superuser'"), 'Must reject reserved usernames');
    assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.fn_generate_unique_username'), 'Must define fn_generate_unique_username function');
    assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.fn_check_username_available'), 'Must define fn_check_username_available function');
    assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.fn_set_own_username'), 'Must define fn_set_own_username function');
    assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.fn_handle_new_user'), 'Must update fn_handle_new_user trigger function');
    assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.fn_generate_unique_username() TO authenticated'), 'Must grant execute to authenticated');
    assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.fn_set_own_username(TEXT) TO authenticated'), 'Must grant execute to authenticated');
  });

  test('0021_dashboard_necessity_spending.sql computes spending by necessity with SECURITY INVOKER', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, '0021_dashboard_necessity_spending.sql'), 'utf-8');
    assert.ok(sql.includes('fn_dashboard_summary'), 'Dashboard summary function must exist');
    assert.ok(sql.includes('SECURITY INVOKER'), 'Function must execute with caller permissions for RLS compliance');
    assert.ok(sql.includes('spending_by_necessity'), 'Function must aggregate spending by necessity');
    assert.ok(sql.includes("'essential'::necessity_class"), 'Must aggregate essential tier');
    assert.ok(sql.includes("'optional'::necessity_class"), 'Must aggregate optional tier');
    assert.ok(sql.includes("'luxury'::necessity_class"), 'Must aggregate luxury tier');
    assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.fn_dashboard_summary(DATE, DATE) FROM PUBLIC;'), 'Revoke from PUBLIC');
    assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.fn_dashboard_summary(DATE, DATE) FROM anon;'), 'Revoke from anon');
    assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.fn_dashboard_summary(DATE, DATE) TO authenticated;'), 'Grant to authenticated');
  });
});
