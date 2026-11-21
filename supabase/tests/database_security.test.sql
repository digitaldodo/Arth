-- Database Security & Constraint Verification Test Suite
-- Executes with pgTAP on PostgreSQL / Supabase CLI

BEGIN;
SELECT plan(25);

-- -----------------------------------------------------------------------------
-- Mock Setup: Authenticated Test Users
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_user_a UUID := '11111111-1111-4111-a111-111111111111'::UUID;
  v_user_b UUID := '22222222-2222-4222-a222-222222222222'::UUID;
BEGIN
  -- Insert into auth.users if schema exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    INSERT INTO auth.users (id, email)
    VALUES 
      (v_user_a, 'user_a@example.com'),
      (v_user_b, 'user_b@example.com')
    ON CONFLICT (id) DO NOTHING;
  ELSE
    -- Standalone test fallback
    INSERT INTO public.profiles (id, display_name)
    VALUES 
      (v_user_a, 'User A'),
      (v_user_b, 'User B')
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 1. Test Profiles Creation & Defaults
-- -----------------------------------------------------------------------------
SELECT has_table('public', 'profiles', 'public.profiles table must exist');
SELECT results_eq(
  $$ SELECT currency, timezone FROM public.profiles WHERE id = '11111111-1111-4111-a111-111111111111'::UUID $$,
  $$ VALUES ('INR', 'Asia/Kolkata') $$,
  'Profiles must default to INR currency and Asia/Kolkata timezone'
);

-- -----------------------------------------------------------------------------
-- 2. Test Category Setup & Predefined Taxonomy
-- -----------------------------------------------------------------------------
SELECT has_table('public', 'categories', 'public.categories table must exist');
SELECT ok(
  (SELECT count(*) >= 15 FROM public.categories WHERE user_id = '11111111-1111-4111-a111-111111111111'::UUID),
  'Default categories (expense and income) must be seeded for User A'
);

-- -----------------------------------------------------------------------------
-- 3. Test Transactions Table & Columns
-- -----------------------------------------------------------------------------
SELECT has_table('public', 'transactions', 'public.transactions table must exist');

-- -----------------------------------------------------------------------------
-- 4. Constraint Check: Rejection of zero or negative amounts
-- -----------------------------------------------------------------------------
SELECT throws_ok(
  $$ INSERT INTO public.transactions (
       id, user_id, amount_paise, type, category_id, payment_method, necessity, transaction_date
     ) VALUES (
       '0192e456-789a-7bc1-8def-123456789001'::UUID,
       '11111111-1111-4111-a111-111111111111'::UUID,
       0,
       'expense',
       (SELECT id FROM public.categories WHERE user_id = '11111111-1111-4111-a111-111111111111'::UUID AND type = 'expense' LIMIT 1),
       'online',
       'essential',
       '2026-10-25'
     ) $$,
  '23514', -- check_violation
  NULL,
  'Zero amount transactions must be rejected by check constraint'
);

SELECT throws_ok(
  $$ INSERT INTO public.transactions (
       id, user_id, amount_paise, type, category_id, payment_method, necessity, transaction_date
     ) VALUES (
       '0192e456-789a-7bc1-8def-123456789002'::UUID,
       '11111111-1111-4111-a111-111111111111'::UUID,
       -50000,
       'expense',
       (SELECT id FROM public.categories WHERE user_id = '11111111-1111-4111-a111-111111111111'::UUID AND type = 'expense' LIMIT 1),
       'online',
       'essential',
       '2026-10-25'
     ) $$,
  '23514',
  NULL,
  'Negative amount transactions must be rejected by check constraint'
);

-- -----------------------------------------------------------------------------
-- 5. Constraint Check: Necessity Rules
-- Expense requires necessity; Income requires NULL necessity
-- -----------------------------------------------------------------------------
SELECT throws_ok(
  $$ INSERT INTO public.transactions (
       id, user_id, amount_paise, type, category_id, payment_method, necessity, transaction_date
     ) VALUES (
       '0192e456-789a-7bc1-8def-123456789003'::UUID,
       '11111111-1111-4111-a111-111111111111'::UUID,
       15000,
       'expense',
       (SELECT id FROM public.categories WHERE user_id = '11111111-1111-4111-a111-111111111111'::UUID AND type = 'expense' LIMIT 1),
       'online',
       NULL,
       '2026-10-25'
     ) $$,
  '23514',
  NULL,
  'Expense transactions must require a non-null necessity classification'
);

SELECT throws_ok(
  $$ INSERT INTO public.transactions (
       id, user_id, amount_paise, type, category_id, payment_method, necessity, transaction_date
     ) VALUES (
       '0192e456-789a-7bc1-8def-123456789004'::UUID,
       '11111111-1111-4111-a111-111111111111'::UUID,
       500000,
       'income',
       (SELECT id FROM public.categories WHERE user_id = '11111111-1111-4111-a111-111111111111'::UUID AND type = 'income' LIMIT 1),
       'online',
       'essential',
       '2026-10-25'
     ) $$,
  '23514',
  NULL,
  'Income transactions must reject any necessity classification'
);

-- -----------------------------------------------------------------------------
-- 6. Constraint Check: Cross-User Category Assignment Rejection
-- -----------------------------------------------------------------------------
SELECT throws_ok(
  $$ INSERT INTO public.transactions (
       id, user_id, amount_paise, type, category_id, payment_method, necessity, transaction_date
     ) VALUES (
       '0192e456-789a-7bc1-8def-123456789005'::UUID,
       '11111111-1111-4111-a111-111111111111'::UUID, -- User A
       25000,
       'expense',
       (SELECT id FROM public.categories WHERE user_id = '22222222-2222-4222-a222-222222222222'::UUID AND type = 'expense' LIMIT 1), -- User B category
       'cash',
       'optional',
       '2026-10-25'
     ) $$,
  '23503', -- foreign_key_violation
  NULL,
  'Transactions must reject referencing a category belonging to another user'
);

-- -----------------------------------------------------------------------------
-- 7. Constraint Check: Category & Transaction Type Mismatch Rejection
-- -----------------------------------------------------------------------------
SELECT throws_ok(
  $$ INSERT INTO public.transactions (
       id, user_id, amount_paise, type, category_id, payment_method, necessity, transaction_date
     ) VALUES (
       '0192e456-789a-7bc1-8def-123456789006'::UUID,
       '11111111-1111-4111-a111-111111111111'::UUID,
       10000,
       'expense',
       (SELECT id FROM public.categories WHERE user_id = '11111111-1111-4111-a111-111111111111'::UUID AND type = 'income' LIMIT 1), -- Income category for Expense
       'online',
       'essential',
       '2026-10-25'
     ) $$,
  '23503',
  NULL,
  'Transactions must reject assigning an income category to an expense'
);

-- -----------------------------------------------------------------------------
-- 8. Test Valid Transaction Insertion & Atomic Outbox Generation
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_cat_id UUID;
BEGIN
  SELECT id INTO v_cat_id
  FROM public.categories
  WHERE user_id = '11111111-1111-4111-a111-111111111111'::UUID AND type = 'expense'
  LIMIT 1;

  INSERT INTO public.transactions (
    id, user_id, amount_paise, type, category_id, payment_method, necessity, transaction_date, description
  ) VALUES (
    '0192e456-789a-7bc1-8def-123456789007'::UUID,
    '11111111-1111-4111-a111-111111111111'::UUID,
    145000,
    'expense',
    v_cat_id,
    'online',
    'essential',
    '2026-10-25',
    'Groceries'
  );
END $$;

SELECT results_eq(
  $$ SELECT event_type, status, entity_id FROM public.outbox_events WHERE entity_id = '0192e456-789a-7bc1-8def-123456789007'::UUID $$,
  $$ VALUES ('transaction.created', 'pending'::public.outbox_status, '0192e456-789a-7bc1-8def-123456789007'::UUID) $$,
  'Inserting a transaction must atomically record an outbox event with status pending'
);

-- -----------------------------------------------------------------------------
-- 9. Test Reversible Soft Deletion & Outbox Emission
-- -----------------------------------------------------------------------------
UPDATE public.transactions
SET deleted_at = now()
WHERE id = '0192e456-789a-7bc1-8def-123456789007'::UUID;

SELECT results_eq(
  $$ SELECT event_type FROM public.outbox_events WHERE entity_id = '0192e456-789a-7bc1-8def-123456789007'::UUID ORDER BY created_at DESC LIMIT 1 $$,
  $$ VALUES ('transaction.deleted') $$,
  'Soft deleting a transaction must record an atomic transaction.deleted outbox event'
);

-- -----------------------------------------------------------------------------
-- 10. Test Category Archival Preserving Historical Transaction Integrity
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_cat_id UUID;
BEGIN
  SELECT category_id INTO v_cat_id FROM public.transactions WHERE id = '0192e456-789a-7bc1-8def-123456789007'::UUID;
  UPDATE public.categories SET archived_at = now() WHERE id = v_cat_id;
END $$;

SELECT ok(
  (SELECT category_id IS NOT NULL FROM public.transactions WHERE id = '0192e456-789a-7bc1-8def-123456789007'::UUID),
  'Archiving a category must preserve foreign key reference on historical transactions'
);

-- -----------------------------------------------------------------------------
-- 11. Test Row-Level Security: User Isolation
-- -----------------------------------------------------------------------------
-- Simulate User B context
SET LOCAL role = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '22222222-2222-4222-a222-222222222222';
SET LOCAL "request.jwt.claims" = '{"sub":"22222222-2222-4222-a222-222222222222","role":"authenticated"}';

SELECT is_empty(
  $$ SELECT * FROM public.transactions WHERE user_id = '11111111-1111-4111-a111-111111111111'::UUID $$,
  'User B must not be able to read User A transactions under RLS'
);

SELECT is_empty(
  $$ SELECT * FROM public.categories WHERE user_id = '11111111-1111-4111-a111-111111111111'::UUID $$,
  'User B must not be able to read User A categories under RLS'
);

-- -----------------------------------------------------------------------------
-- 12. Test Outbox Tamper Resistance: Authenticated Users Denied Access
-- -----------------------------------------------------------------------------
SELECT throws_ok(
  $$ SELECT * FROM public.outbox_events $$,
  '42501', -- insufficient_privilege
  NULL,
  'Authenticated users must be denied direct SELECT on public.outbox_events'
);

-- -----------------------------------------------------------------------------
-- 13. Test Settlement Direct Mutation Lockdown: Authenticated Users Denied INSERT/UPDATE/DELETE
-- -----------------------------------------------------------------------------
SELECT throws_ok(
  $$ INSERT INTO public.person_money_settlements (record_id, amount_paise) VALUES ('0192e456-789a-7bc1-8def-123456789099'::UUID, 50000) $$,
  '42501',
  NULL,
  'Authenticated users must be denied direct INSERT on public.person_money_settlements'
);

SELECT throws_ok(
  $$ UPDATE public.person_money_settlements SET amount_paise = 99999 WHERE id = '0192e456-789a-7bc1-8def-123456789099'::UUID $$,
  '42501',
  NULL,
  'Authenticated users must be denied direct UPDATE on public.person_money_settlements'
);

SELECT throws_ok(
  $$ DELETE FROM public.person_money_settlements WHERE id = '0192e456-789a-7bc1-8def-123456789099'::UUID $$,
  '42501',
  NULL,
  'Authenticated users must be denied direct DELETE on public.person_money_settlements'
);

-- -----------------------------------------------------------------------------
-- 14. Test Balance Movements RLS: Cross-User Isolation and Ownership
-- -----------------------------------------------------------------------------
-- Insert movement as User A (mock setup context or bypass for fixture)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'balance_movements') THEN
    INSERT INTO public.balance_movements (
      id, user_id, movement_type, from_method, to_method, amount_paise, movement_date
    ) VALUES (
      '0192e456-789a-7bc1-8def-123456789088'::UUID,
      '11111111-1111-4111-a111-111111111111'::UUID, -- User A
      'transfer',
      'online',
      'cash',
      100000,
      '2026-10-25'
    ) ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- Switch to User B context
SET LOCAL role = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '22222222-2222-4222-a222-222222222222';
SET LOCAL "request.jwt.claims" = '{"sub":"22222222-2222-4222-a222-222222222222","role":"authenticated"}';

SELECT is_empty(
  $$ SELECT * FROM public.balance_movements WHERE user_id = '11111111-1111-4111-a111-111111111111'::UUID $$,
  'User B must not be able to read User A balance movements under RLS'
);

SELECT throws_ok(
  $$ INSERT INTO public.balance_movements (
       id, user_id, movement_type, from_method, to_method, amount_paise, movement_date
     ) VALUES (
       '0192e456-789a-7bc1-8def-123456789089'::UUID,
       '11111111-1111-4111-a111-111111111111'::UUID, -- Attempting to spoof User A
       'transfer',
       'online',
       'cash',
       50000,
       '2026-10-25'
     ) $$,
  '42501', -- rls_check_violation
  NULL,
  'User B must not be able to insert balance movement with User A user_id under RLS'
);

SELECT is_empty(
  $$ UPDATE public.balance_movements SET amount_paise = 999999 WHERE id = '0192e456-789a-7bc1-8def-123456789088'::UUID RETURNING * $$,
  'User B must not be able to update User A balance movements under RLS'
);

SELECT is_empty(
  $$ DELETE FROM public.balance_movements WHERE id = '0192e456-789a-7bc1-8def-123456789088'::UUID RETURNING * $$,
  'User B must not be able to delete User A balance movements under RLS'
);

-- Switch back to User A context
SET LOCAL "request.jwt.claim.sub" = '11111111-1111-4111-a111-111111111111';
SET LOCAL "request.jwt.claims" = '{"sub":"11111111-1111-4111-a111-111111111111","role":"authenticated"}';

SELECT isnt_empty(
  $$ SELECT * FROM public.balance_movements WHERE id = '0192e456-789a-7bc1-8def-123456789088'::UUID $$,
  'User A must be able to read own balance movements under RLS'
);

SELECT * FROM finish();
ROLLBACK;
