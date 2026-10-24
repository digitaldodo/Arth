import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Database Schema & Migration Integrity Audit', () => {
  const migrationsDir = path.resolve(process.cwd(), '../supabase/migrations');

  test('All 8 numbered migration files exist in sequential order', () => {
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
      '0009_people_tracker.sql'
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
});
