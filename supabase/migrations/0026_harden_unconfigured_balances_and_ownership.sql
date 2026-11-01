-- Migration 0026: Harden Unconfigured Balances Zero-Baseline Accounting, Movement Update Validation, and User Ownership Immutability
-- Audit & Integrity Enhancements:
-- 1. Explicit Zero-Baseline Accounting for Unconfigured Accounts:
--    - An account without configured starting balances starts at exact 0 Cash and 0 Online.
--    - Income recorded while unconfigured increases available balance.
--    - Expenses recorded while unconfigured are evaluated against available income; expenses that produce a negative balance are rejected.
--    - When starting balances are later configured at balances_configured_at, historical pre-baseline transactions do not deduct from the snapshot.
-- 2. Comprehensive Balance Movement Update & Soft-Deletion Validation:
--    - fn_validate_movement_balance() calculates resulting balances by excluding the row being updated and applying the proposed NEW movement exactly once.
--    - Handles transfer in/out reversal, amount increase/decrease, method changes, soft deletion, and restoration without double counting.
-- 3. Strict User Ownership Immutability:
--    - Prohibits changing user_id on UPDATE for both public.transactions and public.balance_movements (SQLSTATE 42501).
-- 4. Consistent Concurrency Serialization:
--    - Enforces uniform profile-row lock acquisition (SELECT ... FROM public.profiles WHERE id = v_user_id FOR UPDATE) across all balance mutations.

-- 1. Redefine fn_account_balances to implement zero-baseline calculation when unconfigured
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

  IF NOT FOUND THEN
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

  -- 2. Aggregate active transactions based on baseline configuration state
  IF v_configured IS TRUE AND v_configured_at IS NOT NULL THEN
    -- Configured baseline snapshot: aggregate only post-baseline transactions
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
  ELSE
    -- Unconfigured account: zero starting baseline, evaluate all active transactions and movements
    v_starting_cash := 0;
    v_starting_online := 0;

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
  END IF;

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
    'balances_configured', coalesce(v_configured, FALSE),
    'balances_configured_at', v_configured_at
  );
END;
$$;

-- 2. Hardened fn_validate_transaction_balance trigger function
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
  v_transfers_online_in BIGINT;

  v_cash_adjustments BIGINT;
  v_online_adjustments BIGINT;

  v_avail_cash BIGINT;
  v_avail_online BIGINT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Physical deletion is not permitted. Use soft deletion (deleted_at).' USING ERRCODE = '0A000';
  END IF;

  -- 1. Prohibit user ownership modification
  IF TG_OP = 'UPDATE' AND NEW.user_id <> OLD.user_id THEN
    RAISE EXCEPTION 'Cannot change user ownership of a transaction' USING ERRCODE = '42501';
  END IF;

  v_user_id := coalesce(NEW.user_id, OLD.user_id);

  -- 2. Acquire exclusive row lock on the user profile to serialize concurrent balance checks
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

  -- 3. Enforce immutability of recorded_at and created_at on UPDATE
  IF TG_OP = 'UPDATE' THEN
    NEW.recorded_at := OLD.recorded_at;
    NEW.created_at := OLD.created_at;
  ELSE
    IF NEW.recorded_at IS NULL THEN
      NEW.recorded_at := coalesce(NEW.created_at, now());
    END IF;
    IF NEW.created_at IS NULL THEN
      NEW.created_at := now();
    END IF;
  END IF;

  -- 4. Check snapshot baseline policy
  IF v_configured IS TRUE AND v_configured_at IS NOT NULL THEN
    -- Pre-baseline transactions do not affect the post-baseline balance snapshot
    IF NEW.recorded_at <= v_configured_at THEN
      RETURN NEW;
    END IF;
  ELSE
    -- Unconfigured account has 0 starting cash and 0 starting online
    v_starting_cash := 0;
    v_starting_online := 0;
  END IF;

  -- 5. Compute available balances from all OTHER active records
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
    AND (v_configured_at IS NULL OR recorded_at > v_configured_at)
    AND (TG_OP <> 'UPDATE' OR id <> NEW.id);

  SELECT
    coalesce(sum(amount_paise) FILTER (WHERE movement_type = 'transfer' AND to_method = 'cash'), 0) -
    coalesce(sum(amount_paise) FILTER (WHERE movement_type = 'transfer' AND from_method = 'cash'), 0),
    coalesce(sum(amount_paise) FILTER (WHERE movement_type = 'transfer' AND to_method = 'online'), 0) -
    coalesce(sum(amount_paise) FILTER (WHERE movement_type = 'transfer' AND from_method = 'online'), 0),
    coalesce(sum(adjustment_paise) FILTER (WHERE movement_type = 'adjustment' AND payment_method = 'cash'), 0),
    coalesce(sum(adjustment_paise) FILTER (WHERE movement_type = 'adjustment' AND payment_method = 'online'), 0)
  INTO
    v_transfers_cash_in,
    v_transfers_online_in,
    v_cash_adjustments,
    v_online_adjustments
  FROM public.balance_movements
  WHERE user_id = v_user_id
    AND deleted_at IS NULL
    AND (v_configured_at IS NULL OR recorded_at > v_configured_at);

  v_avail_cash := v_starting_cash + v_cash_income - v_cash_expense + v_transfers_cash_in + v_cash_adjustments;
  v_avail_online := v_starting_online + v_online_income - v_online_expense + v_transfers_online_in + v_online_adjustments;

  -- 6. Apply NEW proposed transaction state if active
  IF NEW.deleted_at IS NULL AND (v_configured_at IS NULL OR NEW.recorded_at > v_configured_at) THEN
    IF NEW.payment_method = 'cash' THEN
      IF NEW.type = 'income' THEN
        v_avail_cash := v_avail_cash + NEW.amount_paise;
      ELSIF NEW.type = 'expense' THEN
        v_avail_cash := v_avail_cash - NEW.amount_paise;
      END IF;
    ELSIF NEW.payment_method = 'online' THEN
      IF NEW.type = 'income' THEN
        v_avail_online := v_avail_online + NEW.amount_paise;
      ELSIF NEW.type = 'expense' THEN
        v_avail_online := v_avail_online - NEW.amount_paise;
      END IF;
    END IF;
  END IF;

  -- 7. Reject operations resulting in negative balances
  IF v_avail_cash < 0 THEN
    RAISE EXCEPTION 'Insufficient cash balance. Available balance would become % paise.', v_avail_cash USING ERRCODE = '22003';
  END IF;

  IF v_avail_online < 0 THEN
    RAISE EXCEPTION 'Insufficient online balance. Available balance would become % paise.', v_avail_online USING ERRCODE = '22003';
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Hardened fn_validate_movement_balance trigger function
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

  v_avail_cash BIGINT;
  v_avail_online BIGINT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Physical deletion is not permitted. Use soft deletion (deleted_at).' USING ERRCODE = '0A000';
  END IF;

  -- 1. Prohibit user ownership modification
  IF TG_OP = 'UPDATE' AND NEW.user_id <> OLD.user_id THEN
    RAISE EXCEPTION 'Cannot change user ownership of a balance movement' USING ERRCODE = '42501';
  END IF;

  v_user_id := coalesce(NEW.user_id, OLD.user_id);

  -- 2. Acquire exclusive lock on user profile
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

  -- 3. Enforce immutability on UPDATE
  IF TG_OP = 'UPDATE' THEN
    NEW.recorded_at := OLD.recorded_at;
    NEW.created_at := OLD.created_at;
  ELSE
    IF NEW.recorded_at IS NULL THEN
      NEW.recorded_at := coalesce(NEW.created_at, now());
    END IF;
    IF NEW.created_at IS NULL THEN
      NEW.created_at := now();
    END IF;
  END IF;

  -- 4. Check snapshot baseline policy
  IF v_configured IS TRUE AND v_configured_at IS NOT NULL THEN
    IF NEW.recorded_at <= v_configured_at THEN
      RETURN NEW;
    END IF;
  ELSE
    v_starting_cash := 0;
    v_starting_online := 0;
  END IF;

  -- 5. Compute available cash and online balances from all OTHER active records
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
    AND (v_configured_at IS NULL OR recorded_at > v_configured_at);

  SELECT
    coalesce(sum(amount_paise) FILTER (WHERE movement_type = 'transfer' AND to_method = 'cash'), 0) -
    coalesce(sum(amount_paise) FILTER (WHERE movement_type = 'transfer' AND from_method = 'cash'), 0),
    coalesce(sum(amount_paise) FILTER (WHERE movement_type = 'transfer' AND to_method = 'online'), 0) -
    coalesce(sum(amount_paise) FILTER (WHERE movement_type = 'transfer' AND from_method = 'online'), 0),
    coalesce(sum(adjustment_paise) FILTER (WHERE movement_type = 'adjustment' AND payment_method = 'cash'), 0),
    coalesce(sum(adjustment_paise) FILTER (WHERE movement_type = 'adjustment' AND payment_method = 'online'), 0)
  INTO
    v_transfers_cash_in,
    v_transfers_online_in,
    v_cash_adjustments,
    v_online_adjustments
  FROM public.balance_movements
  WHERE user_id = v_user_id
    AND deleted_at IS NULL
    AND (v_configured_at IS NULL OR recorded_at > v_configured_at)
    AND (TG_OP <> 'UPDATE' OR id <> NEW.id);

  v_avail_cash := v_starting_cash + v_cash_income - v_cash_expense + v_transfers_cash_in + v_cash_adjustments;
  v_avail_online := v_starting_online + v_online_income - v_online_expense + v_transfers_online_in + v_online_adjustments;

  -- 6. Apply NEW proposed movement if active
  IF NEW.deleted_at IS NULL AND (v_configured_at IS NULL OR NEW.recorded_at > v_configured_at) THEN
    IF NEW.movement_type = 'transfer' THEN
      IF NEW.from_method = 'cash' THEN
        v_avail_cash := v_avail_cash - NEW.amount_paise;
      ELSIF NEW.from_method = 'online' THEN
        v_avail_online := v_avail_online - NEW.amount_paise;
      END IF;

      IF NEW.to_method = 'cash' THEN
        v_avail_cash := v_avail_cash + NEW.amount_paise;
      ELSIF NEW.to_method = 'online' THEN
        v_avail_online := v_avail_online + NEW.amount_paise;
      END IF;
    ELSIF NEW.movement_type = 'adjustment' THEN
      IF NEW.payment_method = 'cash' THEN
        v_avail_cash := v_avail_cash + NEW.adjustment_paise;
      ELSIF NEW.payment_method = 'online' THEN
        v_avail_online := v_avail_online + NEW.adjustment_paise;
      END IF;
    END IF;
  END IF;

  -- 7. Reject operations resulting in negative balances
  IF v_avail_cash < 0 THEN
    RAISE EXCEPTION 'Insufficient cash balance for movement. Resulting balance would be % paise.', v_avail_cash USING ERRCODE = '22003';
  END IF;

  IF v_avail_online < 0 THEN
    RAISE EXCEPTION 'Insufficient online balance for movement. Resulting balance would be % paise.', v_avail_online USING ERRCODE = '22003';
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Re-attach validation triggers
DROP TRIGGER IF EXISTS trg_validate_transaction_balance ON public.transactions;
CREATE TRIGGER trg_validate_transaction_balance
  BEFORE INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_validate_transaction_balance();

DROP TRIGGER IF EXISTS trg_validate_movement_balance ON public.balance_movements;
CREATE TRIGGER trg_validate_movement_balance
  BEFORE INSERT OR UPDATE OR DELETE ON public.balance_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_validate_movement_balance();

-- 5. Reload schema cache for PostgREST
NOTIFY pgrst, 'reload schema';
