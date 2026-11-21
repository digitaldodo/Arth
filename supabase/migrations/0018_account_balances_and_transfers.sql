-- Migration 0018: Account Balances, Initial Balances, and Balance Movements (Transfers & Adjustments)
-- Schema: Adds starting balances to public.profiles, creates public.balance_movements,
-- and implements atomic function public.fn_account_balances() for exact integer paise balances.

-- 1. Extend public.profiles with starting balances
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS starting_cash_paise BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS starting_online_paise BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balances_configured BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS balances_configured_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.starting_cash_paise IS 'Initial cash balance in integer paise (1 INR = 100 paise).';
COMMENT ON COLUMN public.profiles.starting_online_paise IS 'Initial online balance in integer paise (1 INR = 100 paise).';
COMMENT ON COLUMN public.profiles.balances_configured IS 'Flag indicating if the user has explicitly configured starting balances.';
COMMENT ON COLUMN public.profiles.balances_configured_at IS 'Timestamp when starting balances were first configured.';

-- 2. Create public.balance_movements table
-- Used strictly for internal Cash <-> Online transfers and auditable balance adjustments.
-- Kept completely separate from income/expense transactions.
CREATE TABLE IF NOT EXISTS public.balance_movements (
  id                 UUID PRIMARY KEY, -- Client-generated UUID v7
  user_id            UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  movement_type      TEXT NOT NULL CHECK (movement_type IN ('transfer', 'adjustment')),
  
  -- For transfers between accounts
  from_method        public.payment_method,
  to_method          public.payment_method,
  amount_paise       BIGINT NOT NULL DEFAULT 0 CHECK (amount_paise >= 0),
  
  -- For auditable balance corrections
  payment_method     public.payment_method,
  adjustment_paise   BIGINT NOT NULL DEFAULT 0,
  reason             TEXT,
  
  movement_date      DATE NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ, -- Soft deletion support

  -- Check constraints
  CONSTRAINT chk_movement_transfer CHECK (
    movement_type <> 'transfer' OR (
      from_method IS NOT NULL AND
      to_method IS NOT NULL AND
      from_method <> to_method AND
      amount_paise > 0
    )
  ),
  CONSTRAINT chk_movement_adjustment CHECK (
    movement_type <> 'adjustment' OR (
      payment_method IS NOT NULL AND
      adjustment_paise <> 0 AND
      reason IS NOT NULL AND
      char_length(trim(reason)) > 0
    )
  )
);

COMMENT ON TABLE public.balance_movements IS 'Internal transfers and auditable reconciliation adjustments. Excluded from income/expense metrics.';

-- Trigger to maintain updated_at on balance_movements
CREATE OR REPLACE TRIGGER trg_balance_movements_updated_at
  BEFORE UPDATE ON public.balance_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_updated_at();

-- Index for efficient user queries
CREATE INDEX IF NOT EXISTS idx_balance_movements_user_date
  ON public.balance_movements (user_id, movement_date DESC, created_at DESC)
  WHERE deleted_at IS NULL;

-- 3. Row-Level Security on balance_movements
ALTER TABLE public.balance_movements ENABLE ROW LEVEL SECURITY;

-- Idempotent, guarded RLS policies for balance_movements
-- Safely creates policies if absent, skips if identical, and rejects conflicting definitions
DO $$
DECLARE
  v_pol RECORD;
BEGIN
  -- 1. SELECT policy: balance_movements_select_own
  SELECT * INTO v_pol
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'balance_movements'
    AND policyname = 'balance_movements_select_own';

  IF NOT FOUND THEN
    CREATE POLICY balance_movements_select_own
      ON public.balance_movements
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  ELSE
    IF v_pol.cmd <> 'SELECT'
       OR v_pol.permissive <> 'PERMISSIVE'
       OR NOT (v_pol.roles = '{authenticated}'::name[] OR v_pol.roles::text = '{authenticated}')
       OR v_pol.qual NOT IN ('(auth.uid() = user_id)', 'auth.uid() = user_id')
       OR v_pol.with_check IS NOT NULL THEN
      RAISE EXCEPTION 'Conflicting definition for policy balance_movements_select_own on public.balance_movements: cmd=%, roles=%, qual=%, with_check=%',
        v_pol.cmd, v_pol.roles, v_pol.qual, v_pol.with_check
        USING ERRCODE = '42710';
    END IF;
  END IF;

  -- 2. INSERT policy: balance_movements_insert_own
  SELECT * INTO v_pol
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'balance_movements'
    AND policyname = 'balance_movements_insert_own';

  IF NOT FOUND THEN
    CREATE POLICY balance_movements_insert_own
      ON public.balance_movements
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  ELSE
    IF v_pol.cmd <> 'INSERT'
       OR v_pol.permissive <> 'PERMISSIVE'
       OR NOT (v_pol.roles = '{authenticated}'::name[] OR v_pol.roles::text = '{authenticated}')
       OR v_pol.qual IS NOT NULL
       OR v_pol.with_check NOT IN ('(auth.uid() = user_id)', 'auth.uid() = user_id') THEN
      RAISE EXCEPTION 'Conflicting definition for policy balance_movements_insert_own on public.balance_movements: cmd=%, roles=%, qual=%, with_check=%',
        v_pol.cmd, v_pol.roles, v_pol.qual, v_pol.with_check
        USING ERRCODE = '42710';
    END IF;
  END IF;

  -- 3. UPDATE policy: balance_movements_update_own
  SELECT * INTO v_pol
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'balance_movements'
    AND policyname = 'balance_movements_update_own';

  IF NOT FOUND THEN
    CREATE POLICY balance_movements_update_own
      ON public.balance_movements
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  ELSE
    IF v_pol.cmd <> 'UPDATE'
       OR v_pol.permissive <> 'PERMISSIVE'
       OR NOT (v_pol.roles = '{authenticated}'::name[] OR v_pol.roles::text = '{authenticated}')
       OR v_pol.qual NOT IN ('(auth.uid() = user_id)', 'auth.uid() = user_id')
       OR v_pol.with_check NOT IN ('(auth.uid() = user_id)', 'auth.uid() = user_id') THEN
      RAISE EXCEPTION 'Conflicting definition for policy balance_movements_update_own on public.balance_movements: cmd=%, roles=%, qual=%, with_check=%',
        v_pol.cmd, v_pol.roles, v_pol.qual, v_pol.with_check
        USING ERRCODE = '42710';
    END IF;
  END IF;

  -- 4. DELETE policy: balance_movements_delete_own
  SELECT * INTO v_pol
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'balance_movements'
    AND policyname = 'balance_movements_delete_own';

  IF NOT FOUND THEN
    CREATE POLICY balance_movements_delete_own
      ON public.balance_movements
      FOR DELETE
      TO authenticated
      USING (auth.uid() = user_id);
  ELSE
    IF v_pol.cmd <> 'DELETE'
       OR v_pol.permissive <> 'PERMISSIVE'
       OR NOT (v_pol.roles = '{authenticated}'::name[] OR v_pol.roles::text = '{authenticated}')
       OR v_pol.qual NOT IN ('(auth.uid() = user_id)', 'auth.uid() = user_id')
       OR v_pol.with_check IS NOT NULL THEN
      RAISE EXCEPTION 'Conflicting definition for policy balance_movements_delete_own on public.balance_movements: cmd=%, roles=%, qual=%, with_check=%',
        v_pol.cmd, v_pol.roles, v_pol.qual, v_pol.with_check
        USING ERRCODE = '42710';
    END IF;
  END IF;
END $$;

-- Table grants for authenticated users and service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.balance_movements TO authenticated;
GRANT ALL ON public.balance_movements TO service_role;

-- 4. Atomic database function to compute account balances
CREATE OR REPLACE FUNCTION public.fn_account_balances()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_starting_cash BIGINT;
  v_starting_online BIGINT;
  v_configured BOOLEAN;
  v_configured_at TIMESTAMPTZ;

  -- Transaction totals
  v_cash_income BIGINT;
  v_cash_expense BIGINT;
  v_online_income BIGINT;
  v_online_expense BIGINT;

  -- Transfers totals
  v_transfers_cash_in BIGINT;   -- transfers where to_method = 'cash'
  v_transfers_cash_out BIGINT;  -- transfers where from_method = 'cash'
  v_transfers_online_in BIGINT; -- transfers where to_method = 'online'
  v_transfers_online_out BIGINT;-- transfers where from_method = 'online'

  -- Adjustments totals
  v_cash_adjustments BIGINT;
  v_online_adjustments BIGINT;

  -- Derived balances
  v_current_cash BIGINT;
  v_current_online BIGINT;
  v_total_available BIGINT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  -- 1. Fetch starting balances from profile
  SELECT
    coalesce(starting_cash_paise, 0),
    coalesce(starting_online_paise, 0),
    coalesce(balances_configured, FALSE),
    balances_configured_at
  INTO
    v_starting_cash,
    v_starting_online,
    v_configured,
    v_configured_at
  FROM public.profiles
  WHERE id = v_user_id;

  IF NOT FOUND THEN
    v_starting_cash := 0;
    v_starting_online := 0;
    v_configured := FALSE;
    v_configured_at := NULL;
  END IF;

  -- 2. Aggregate active transactions
  SELECT
    coalesce(sum(amount_paise) FILTER (WHERE type = 'income' AND payment_method = 'cash'), 0),
    coalesce(sum(amount_paise) FILTER (WHERE type = 'expense' AND payment_method = 'cash'), 0),
    coalesce(sum(amount_paise) FILTER (WHERE type = 'income' AND payment_method = 'online'), 0),
    coalesce(sum(amount_paise) FILTER (WHERE type = 'expense' AND payment_method = 'online'), 0)
  INTO
    v_cash_income,
    v_cash_expense,
    v_online_income,
    v_online_expense
  FROM public.transactions
  WHERE user_id = v_user_id
    AND deleted_at IS NULL;

  -- 3. Aggregate active balance movements
  SELECT
    coalesce(sum(amount_paise) FILTER (WHERE movement_type = 'transfer' AND to_method = 'cash'), 0),
    coalesce(sum(amount_paise) FILTER (WHERE movement_type = 'transfer' AND from_method = 'cash'), 0),
    coalesce(sum(amount_paise) FILTER (WHERE movement_type = 'transfer' AND to_method = 'online'), 0),
    coalesce(sum(amount_paise) FILTER (WHERE movement_type = 'transfer' AND from_method = 'online'), 0),
    coalesce(sum(adjustment_paise) FILTER (WHERE movement_type = 'adjustment' AND payment_method = 'cash'), 0),
    coalesce(sum(adjustment_paise) FILTER (WHERE movement_type = 'adjustment' AND payment_method = 'online'), 0)
  INTO
    v_transfers_cash_in,
    v_transfers_cash_out,
    v_transfers_online_in,
    v_transfers_online_out,
    v_cash_adjustments,
    v_online_adjustments
  FROM public.balance_movements
  WHERE user_id = v_user_id
    AND deleted_at IS NULL;

  -- 4. Calculate current balances
  v_current_cash := v_starting_cash + v_cash_income - v_cash_expense + (v_transfers_cash_in - v_transfers_cash_out) + v_cash_adjustments;
  v_current_online := v_starting_online + v_online_income - v_online_expense + (v_transfers_online_in - v_transfers_online_out) + v_online_adjustments;
  v_total_available := v_current_cash + v_current_online;

  RETURN jsonb_build_object(
    'starting_cash_paise', v_starting_cash,
    'starting_online_paise', v_starting_online,
    'starting_total_paise', v_starting_cash + v_starting_online,
    'current_cash_paise', v_current_cash,
    'current_online_paise', v_current_online,
    'total_available_paise', v_total_available,
    'balances_configured', v_configured,
    'balances_configured_at', v_configured_at
  );
END;
$$;
