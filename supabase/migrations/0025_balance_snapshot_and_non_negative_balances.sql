-- Migration 0025: Starting Balance Snapshots, Dedicated recorded_at Timestamp, Non-Negative Balance Enforcement, and Atomic Validation
-- Schema & Integrity Rules:
-- 1. Adds dedicated immutable recorded_at timestamp column to transactions and balance_movements:
--    - recorded_at is captured when the transaction/movement is first created locally and preserved during sync and retries.
--    - created_at records when Supabase/server receives the record.
--    - The balance snapshot calculation strictly compares recorded_at against balances_configured_at.
-- 2. Redefines public.fn_account_balances() to treat starting balances as balance snapshots:
--    - If balances are unconfigured, all balances default to exact 0 integer paise.
--    - When configured, aggregates ONLY active transactions and movements with recorded_at strictly AFTER balances_configured_at.
--    - Guarantees non-negative balance floors (current_cash_paise >= 0, current_online_paise >= 0, total_available_paise >= 0).
-- 3. Redefines public.fn_configure_starting_balances() to atomically update starting balances and
--    establish balances_configured_at = now() as the new authoritative baseline snapshot boundary.
-- 4. Implements public.fn_validate_transaction_balance() trigger:
--    - Acquires row lock on public.profiles FOR UPDATE to guarantee atomic serialization and prevent concurrent race condition overspending.
--    - Enforces that no post-baseline expense (recorded_at > balances_configured_at) can exceed the available balance for its payment method.
--    - Enforces that soft-deleting a post-baseline income cannot cause the remaining balance to drop below zero.
-- 5. Implements public.fn_validate_movement_balance() trigger:
--    - Validates transfers and adjustments against available balances with FOR UPDATE row locks.
-- 6. Preserves historical transaction records, monthly spending, and analytics untouched.

-- 0. Ensure immutable recorded_at column exists on transactions and balance_movements
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ;
UPDATE public.transactions SET recorded_at = created_at WHERE recorded_at IS NULL;
ALTER TABLE public.transactions ALTER COLUMN recorded_at SET DEFAULT now();
ALTER TABLE public.transactions ALTER COLUMN recorded_at SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_user_recorded_at ON public.transactions(user_id, recorded_at);

ALTER TABLE public.balance_movements ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ;
UPDATE public.balance_movements SET recorded_at = created_at WHERE recorded_at IS NULL;
ALTER TABLE public.balance_movements ALTER COLUMN recorded_at SET DEFAULT now();
ALTER TABLE public.balance_movements ALTER COLUMN recorded_at SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_balance_movements_user_recorded_at ON public.balance_movements(user_id, recorded_at);

-- 1. Atomic database function to compute account balances from snapshot baseline
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

  -- Post-baseline transaction aggregates
  v_cash_income BIGINT;
  v_cash_expense BIGINT;
  v_online_income BIGINT;
  v_online_expense BIGINT;

  -- Post-baseline transfers aggregates
  v_transfers_cash_in BIGINT;   -- transfers where to_method = 'cash'
  v_transfers_cash_out BIGINT;  -- transfers where from_method = 'cash'
  v_transfers_online_in BIGINT; -- transfers where to_method = 'online'
  v_transfers_online_out BIGINT;-- transfers where from_method = 'online'

  -- Post-baseline adjustments aggregates
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

  -- 1. Fetch profile starting balances and snapshot boundary
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

  -- Default behavior: If starting balances have not been configured, all balances are exact 0
  IF NOT FOUND OR v_configured IS NOT TRUE OR v_configured_at IS NULL THEN
    RETURN jsonb_build_object(
      'starting_cash_paise', 0,
      'starting_online_paise', 0,
      'starting_total_paise', 0,
      'current_cash_paise', 0,
      'current_online_paise', 0,
      'total_available_paise', 0,
      'balances_configured', FALSE,
      'balances_configured_at', NULL
    );
  END IF;

  -- 2. Aggregate active transactions recorded strictly AFTER the baseline snapshot (using recorded_at)
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
    AND deleted_at IS NULL
    AND recorded_at > v_configured_at;

  -- 3. Aggregate active balance movements recorded strictly AFTER the baseline snapshot (using recorded_at)
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
    AND deleted_at IS NULL
    AND recorded_at > v_configured_at;

  -- 4. Calculate current balances from the snapshot baseline
  v_current_cash := v_starting_cash + v_cash_income - v_cash_expense + (v_transfers_cash_in - v_transfers_cash_out) + v_cash_adjustments;
  v_current_online := v_starting_online + v_online_income - v_online_expense + (v_transfers_online_in - v_transfers_online_out) + v_online_adjustments;

  -- Enforce non-negative floor
  IF v_current_cash < 0 THEN
    v_current_cash := 0;
  END IF;
  IF v_current_online < 0 THEN
    v_current_online := 0;
  END IF;
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

REVOKE ALL ON FUNCTION public.fn_account_balances() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_account_balances() FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_account_balances() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_account_balances() TO service_role;

-- 2. Atomic procedure to configure starting balances as a new balance snapshot
CREATE OR REPLACE FUNCTION public.fn_configure_starting_balances(
  p_starting_cash_paise BIGINT,
  p_starting_online_paise BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF p_starting_cash_paise < 0 OR p_starting_online_paise < 0 THEN
    RAISE EXCEPTION 'Starting balances cannot be negative' USING ERRCODE = '22003';
  END IF;

  -- Atomically set new starting balance snapshot and advance balances_configured_at to now()
  UPDATE public.profiles
  SET
    starting_cash_paise = p_starting_cash_paise,
    starting_online_paise = p_starting_online_paise,
    balances_configured = TRUE,
    balances_configured_at = now(),
    updated_at = now()
  WHERE id = v_user_id;

  RETURN public.fn_account_balances();
END;
$$;

REVOKE ALL ON FUNCTION public.fn_configure_starting_balances(BIGINT, BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_configure_starting_balances(BIGINT, BIGINT) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_configure_starting_balances(BIGINT, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_configure_starting_balances(BIGINT, BIGINT) TO service_role;

-- 3. Atomic transaction balance validation trigger function
CREATE OR REPLACE FUNCTION public.fn_validate_transaction_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_starting_cash BIGINT;
  v_starting_online BIGINT;
  v_configured BOOLEAN;
  v_configured_at TIMESTAMPTZ;

  v_cash_income BIGINT;
  v_cash_expense BIGINT;
  v_online_income BIGINT;
  v_online_expense BIGINT;

  v_transfers_cash_in BIGINT;
  v_transfers_cash_out BIGINT;
  v_transfers_online_in BIGINT;
  v_transfers_online_out BIGINT;

  v_cash_adjustments BIGINT;
  v_online_adjustments BIGINT;

  v_avail_cash BIGINT;
  v_avail_online BIGINT;
BEGIN
  v_user_id := coalesce(NEW.user_id, OLD.user_id);

  -- 1. Acquire exclusive row lock on the user profile to serialize concurrent expense checks
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
  WHERE id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found' USING ERRCODE = '28000';
  END IF;

  -- Ensure recorded_at and created_at are populated
  IF NEW.recorded_at IS NULL THEN
    NEW.recorded_at := coalesce(NEW.created_at, now());
  END IF;
  IF NEW.created_at IS NULL THEN
    NEW.created_at := now();
  END IF;

  -- Case A: Soft-deleting an existing transaction
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    -- Soft-deleting an expense RESTORES funds (increases balance), always safe.
    -- Soft-deleting an income REMOVES funds: check if remaining balance would become negative.
    IF OLD.type = 'income' AND v_configured IS TRUE AND v_configured_at IS NOT NULL AND OLD.recorded_at > v_configured_at THEN
      -- Calculate available balance of OLD.payment_method excluding this income
      IF OLD.payment_method = 'cash' THEN
        SELECT
          coalesce(sum(amount_paise) FILTER (WHERE type = 'income' AND payment_method = 'cash'), 0),
          coalesce(sum(amount_paise) FILTER (WHERE type = 'expense' AND payment_method = 'cash'), 0)
        INTO v_cash_income, v_cash_expense
        FROM public.transactions
        WHERE user_id = v_user_id AND deleted_at IS NULL AND recorded_at > v_configured_at AND id <> OLD.id;

        SELECT
          coalesce(sum(amount_paise) FILTER (WHERE movement_type = 'transfer' AND to_method = 'cash'), 0) -
          coalesce(sum(amount_paise) FILTER (WHERE movement_type = 'transfer' AND from_method = 'cash'), 0),
          coalesce(sum(adjustment_paise) FILTER (WHERE movement_type = 'adjustment' AND payment_method = 'cash'), 0)
        INTO v_transfers_cash_in, v_cash_adjustments
        FROM public.balance_movements
        WHERE user_id = v_user_id AND deleted_at IS NULL AND recorded_at > v_configured_at;

        v_avail_cash := v_starting_cash + v_cash_income - v_cash_expense + v_transfers_cash_in + v_cash_adjustments;
        IF v_avail_cash < 0 THEN
          RAISE EXCEPTION 'Cannot delete income: remaining cash balance would become negative.' USING ERRCODE = '22003';
        END IF;
      ELSIF OLD.payment_method = 'online' THEN
        SELECT
          coalesce(sum(amount_paise) FILTER (WHERE type = 'income' AND payment_method = 'online'), 0),
          coalesce(sum(amount_paise) FILTER (WHERE type = 'expense' AND payment_method = 'online'), 0)
        INTO v_online_income, v_online_expense
        FROM public.transactions
        WHERE user_id = v_user_id AND deleted_at IS NULL AND recorded_at > v_configured_at AND id <> OLD.id;

        SELECT
          coalesce(sum(amount_paise) FILTER (WHERE movement_type = 'transfer' AND to_method = 'online'), 0) -
          coalesce(sum(amount_paise) FILTER (WHERE movement_type = 'transfer' AND from_method = 'online'), 0),
          coalesce(sum(adjustment_paise) FILTER (WHERE movement_type = 'adjustment' AND payment_method = 'online'), 0)
        INTO v_transfers_online_in, v_online_adjustments
        FROM public.balance_movements
        WHERE user_id = v_user_id AND deleted_at IS NULL AND recorded_at > v_configured_at;

        v_avail_online := v_starting_online + v_online_income - v_online_expense + v_transfers_online_in + v_online_adjustments;
        IF v_avail_online < 0 THEN
          RAISE EXCEPTION 'Cannot delete income: remaining online balance would become negative.' USING ERRCODE = '22003';
        END IF;
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  -- Case B: Active income transactions always increase balance, non-negative
  IF NEW.type = 'income' THEN
    RETURN NEW;
  END IF;

  -- Case C: Active expense transaction
  IF NEW.type = 'expense' THEN
    -- If starting balances are not configured yet, transactions are pre-baseline
    IF v_configured IS NOT TRUE OR v_configured_at IS NULL THEN
      RETURN NEW;
    END IF;

    -- If recorded before or on the baseline snapshot, it does not affect post-baseline snapshot
    IF NEW.recorded_at <= v_configured_at THEN
      RETURN NEW;
    END IF;

    -- Compute available balance strictly for the target payment method
    IF NEW.payment_method = 'cash' THEN
      SELECT
        coalesce(sum(amount_paise) FILTER (WHERE type = 'income' AND payment_method = 'cash'), 0),
        coalesce(sum(amount_paise) FILTER (WHERE type = 'expense' AND payment_method = 'cash'), 0)
      INTO v_cash_income, v_cash_expense
      FROM public.transactions
      WHERE user_id = v_user_id
        AND deleted_at IS NULL
        AND recorded_at > v_configured_at
        AND (TG_OP <> 'UPDATE' OR id <> NEW.id);

      SELECT
        coalesce(sum(amount_paise) FILTER (WHERE movement_type = 'transfer' AND to_method = 'cash'), 0) -
        coalesce(sum(amount_paise) FILTER (WHERE movement_type = 'transfer' AND from_method = 'cash'), 0),
        coalesce(sum(adjustment_paise) FILTER (WHERE movement_type = 'adjustment' AND payment_method = 'cash'), 0)
      INTO v_transfers_cash_in, v_cash_adjustments
      FROM public.balance_movements
      WHERE user_id = v_user_id
        AND deleted_at IS NULL
        AND recorded_at > v_configured_at;

      v_avail_cash := v_starting_cash + v_cash_income - v_cash_expense + v_transfers_cash_in + v_cash_adjustments;
      IF v_avail_cash - NEW.amount_paise < 0 THEN
        RAISE EXCEPTION 'Insufficient cash balance. Available balance is % paise, but attempted expense is % paise.', v_avail_cash, NEW.amount_paise USING ERRCODE = '22003';
      END IF;

    ELSIF NEW.payment_method = 'online' THEN
      SELECT
        coalesce(sum(amount_paise) FILTER (WHERE type = 'income' AND payment_method = 'online'), 0),
        coalesce(sum(amount_paise) FILTER (WHERE type = 'expense' AND payment_method = 'online'), 0)
      INTO v_online_income, v_online_expense
      FROM public.transactions
      WHERE user_id = v_user_id
        AND deleted_at IS NULL
        AND recorded_at > v_configured_at
        AND (TG_OP <> 'UPDATE' OR id <> NEW.id);

      SELECT
        coalesce(sum(amount_paise) FILTER (WHERE movement_type = 'transfer' AND to_method = 'online'), 0) -
        coalesce(sum(amount_paise) FILTER (WHERE movement_type = 'transfer' AND from_method = 'online'), 0),
        coalesce(sum(adjustment_paise) FILTER (WHERE movement_type = 'adjustment' AND payment_method = 'online'), 0)
      INTO v_transfers_online_in, v_online_adjustments
      FROM public.balance_movements
      WHERE user_id = v_user_id
        AND deleted_at IS NULL
        AND recorded_at > v_configured_at;

      v_avail_online := v_starting_online + v_online_income - v_online_expense + v_transfers_online_in + v_online_adjustments;
      IF v_avail_online - NEW.amount_paise < 0 THEN
        RAISE EXCEPTION 'Insufficient online balance. Available balance is % paise, but attempted expense is % paise.', v_avail_online, NEW.amount_paise USING ERRCODE = '22003';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Atomic balance movement validation trigger function (Transfers & Adjustments)
CREATE OR REPLACE FUNCTION public.fn_validate_movement_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_starting_cash BIGINT;
  v_starting_online BIGINT;
  v_configured BOOLEAN;
  v_configured_at TIMESTAMPTZ;

  v_cash_income BIGINT;
  v_cash_expense BIGINT;
  v_online_income BIGINT;
  v_online_expense BIGINT;

  v_transfers_cash_in BIGINT;
  v_transfers_online_in BIGINT;

  v_cash_adjustments BIGINT;
  v_online_adjustments BIGINT;

  v_avail_from BIGINT;
BEGIN
  v_user_id := coalesce(NEW.user_id, OLD.user_id);

  -- 1. Acquire exclusive lock on user profile
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
  WHERE id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found' USING ERRCODE = '28000';
  END IF;

  IF NEW.recorded_at IS NULL THEN
    NEW.recorded_at := coalesce(NEW.created_at, now());
  END IF;
  IF NEW.created_at IS NULL THEN
    NEW.created_at := now();
  END IF;

  -- Only validate active operations
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF v_configured IS NOT TRUE OR v_configured_at IS NULL THEN
    RAISE EXCEPTION 'Starting balances have not been configured yet.' USING ERRCODE = '22003';
  END IF;

  IF NEW.recorded_at <= v_configured_at THEN
    RETURN NEW;
  END IF;

  -- Validate transfer: from_method balance must be sufficient
  IF NEW.movement_type = 'transfer' THEN
    IF NEW.from_method = 'cash' THEN
      SELECT
        coalesce(sum(amount_paise) FILTER (WHERE type = 'income' AND payment_method = 'cash'), 0),
        coalesce(sum(amount_paise) FILTER (WHERE type = 'expense' AND payment_method = 'cash'), 0)
      INTO v_cash_income, v_cash_expense
      FROM public.transactions
      WHERE user_id = v_user_id AND deleted_at IS NULL AND recorded_at > v_configured_at;

      SELECT
        coalesce(sum(amount_paise) FILTER (WHERE movement_type = 'transfer' AND to_method = 'cash'), 0) -
        coalesce(sum(amount_paise) FILTER (WHERE movement_type = 'transfer' AND from_method = 'cash'), 0),
        coalesce(sum(adjustment_paise) FILTER (WHERE movement_type = 'adjustment' AND payment_method = 'cash'), 0)
      INTO v_transfers_cash_in, v_cash_adjustments
      FROM public.balance_movements
      WHERE user_id = v_user_id AND deleted_at IS NULL AND recorded_at > v_configured_at AND (TG_OP <> 'UPDATE' OR id <> NEW.id);

      v_avail_from := v_starting_cash + v_cash_income - v_cash_expense + v_transfers_cash_in + v_cash_adjustments;
    ELSE
      SELECT
        coalesce(sum(amount_paise) FILTER (WHERE type = 'income' AND payment_method = 'online'), 0),
        coalesce(sum(amount_paise) FILTER (WHERE type = 'expense' AND payment_method = 'online'), 0)
      INTO v_online_income, v_online_expense
      FROM public.transactions
      WHERE user_id = v_user_id AND deleted_at IS NULL AND recorded_at > v_configured_at;

      SELECT
        coalesce(sum(amount_paise) FILTER (WHERE movement_type = 'transfer' AND to_method = 'online'), 0) -
        coalesce(sum(amount_paise) FILTER (WHERE movement_type = 'transfer' AND from_method = 'online'), 0),
        coalesce(sum(adjustment_paise) FILTER (WHERE movement_type = 'adjustment' AND payment_method = 'online'), 0)
      INTO v_transfers_online_in, v_online_adjustments
      FROM public.balance_movements
      WHERE user_id = v_user_id AND deleted_at IS NULL AND recorded_at > v_configured_at AND (TG_OP <> 'UPDATE' OR id <> NEW.id);

      v_avail_from := v_starting_online + v_online_income - v_online_expense + v_transfers_online_in + v_online_adjustments;
    END IF;

    IF v_avail_from - NEW.amount_paise < 0 THEN
      RAISE EXCEPTION 'Insufficient % balance for transfer. Available balance is % paise, attempted transfer is % paise.', NEW.from_method, v_avail_from, NEW.amount_paise USING ERRCODE = '22003';
    END IF;

  -- Validate adjustment: negative adjustment must not make balance negative
  ELSIF NEW.movement_type = 'adjustment' AND NEW.adjustment_paise < 0 THEN
    IF NEW.payment_method = 'cash' THEN
      SELECT
        coalesce(sum(amount_paise) FILTER (WHERE type = 'income' AND payment_method = 'cash'), 0),
        coalesce(sum(amount_paise) FILTER (WHERE type = 'expense' AND payment_method = 'cash'), 0)
      INTO v_cash_income, v_cash_expense
      FROM public.transactions
      WHERE user_id = v_user_id AND deleted_at IS NULL AND recorded_at > v_configured_at;

      SELECT
        coalesce(sum(amount_paise) FILTER (WHERE movement_type = 'transfer' AND to_method = 'cash'), 0) -
        coalesce(sum(amount_paise) FILTER (WHERE movement_type = 'transfer' AND from_method = 'cash'), 0),
        coalesce(sum(adjustment_paise) FILTER (WHERE movement_type = 'adjustment' AND payment_method = 'cash'), 0)
      INTO v_transfers_cash_in, v_cash_adjustments
      FROM public.balance_movements
      WHERE user_id = v_user_id AND deleted_at IS NULL AND recorded_at > v_configured_at AND (TG_OP <> 'UPDATE' OR id <> NEW.id);

      v_avail_from := v_starting_cash + v_cash_income - v_cash_expense + v_transfers_cash_in + v_cash_adjustments;
    ELSE
      SELECT
        coalesce(sum(amount_paise) FILTER (WHERE type = 'income' AND payment_method = 'online'), 0),
        coalesce(sum(amount_paise) FILTER (WHERE type = 'expense' AND payment_method = 'online'), 0)
      INTO v_online_income, v_online_expense
      FROM public.transactions
      WHERE user_id = v_user_id AND deleted_at IS NULL AND recorded_at > v_configured_at;

      SELECT
        coalesce(sum(amount_paise) FILTER (WHERE movement_type = 'transfer' AND to_method = 'online'), 0) -
        coalesce(sum(amount_paise) FILTER (WHERE movement_type = 'transfer' AND from_method = 'online'), 0),
        coalesce(sum(adjustment_paise) FILTER (WHERE movement_type = 'adjustment' AND payment_method = 'online'), 0)
      INTO v_transfers_online_in, v_online_adjustments
      FROM public.balance_movements
      WHERE user_id = v_user_id AND deleted_at IS NULL AND recorded_at > v_configured_at AND (TG_OP <> 'UPDATE' OR id <> NEW.id);

      v_avail_from := v_starting_online + v_online_income - v_online_expense + v_transfers_online_in + v_online_adjustments;
    END IF;

    IF v_avail_from + NEW.adjustment_paise < 0 THEN
      RAISE EXCEPTION 'Insufficient % balance for adjustment. Available balance is % paise, attempted reduction is % paise.', NEW.payment_method, v_avail_from, abs(NEW.adjustment_paise) USING ERRCODE = '22003';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 5. Attach validation triggers
DROP TRIGGER IF EXISTS trg_validate_transaction_balance ON public.transactions;
CREATE TRIGGER trg_validate_transaction_balance
  BEFORE INSERT OR UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_validate_transaction_balance();

DROP TRIGGER IF EXISTS trg_validate_movement_balance ON public.balance_movements;
CREATE TRIGGER trg_validate_movement_balance
  BEFORE INSERT OR UPDATE ON public.balance_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_validate_movement_balance();

-- 6. Reload schema cache for PostgREST
NOTIFY pgrst, 'reload schema';
