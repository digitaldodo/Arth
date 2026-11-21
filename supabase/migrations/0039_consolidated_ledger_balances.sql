-- SpendSense Migration 0039: Consolidated Ledger Balances Hardening
-- Hardens balance functions to strictly align with SpendSense's consolidated personal
-- Ledger model (Physical Cash + Digital/UPI Funds). All balances are unified per user.

-- 1. Ensure atomic fn_account_balances strictly operates on consolidated ledger
CREATE OR REPLACE FUNCTION public.fn_account_balances()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_starting_cash BIGINT;
  v_starting_online BIGINT;
  v_starting_total BIGINT;
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
  -- 1. Resolve calling authenticated user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to calculate account balances';
  END IF;

  -- 2. Fetch user baseline configuration status from profiles
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

  -- 3. Aggregate transactions and balance movements
  IF v_configured IS TRUE AND v_configured_at IS NOT NULL THEN
    -- Configured baseline: evaluate movements recorded after baseline configuration
    SELECT
      coalesce(sum(amount_paise) FILTER (WHERE type = 'income' AND payment_method = 'cash'), 0),
      coalesce(sum(amount_paise) FILTER (WHERE type = 'expense' AND payment_method = 'cash'), 0),
      coalesce(sum(amount_paise) FILTER (WHERE type = 'income' AND payment_method IN ('online', 'upi')), 0),
      coalesce(sum(amount_paise) FILTER (WHERE type = 'expense' AND payment_method IN ('online', 'upi')), 0)
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
      coalesce(sum(amount_paise) FILTER (WHERE movement_type = 'transfer' AND to_method IN ('online', 'upi')), 0),
      coalesce(sum(amount_paise) FILTER (WHERE movement_type = 'transfer' AND from_method IN ('online', 'upi')), 0),
      coalesce(sum(adjustment_paise) FILTER (WHERE movement_type = 'adjustment' AND payment_method = 'cash'), 0),
      coalesce(sum(adjustment_paise) FILTER (WHERE movement_type = 'adjustment' AND payment_method IN ('online', 'upi')), 0)
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
    -- Unconfigured: zero starting baseline, evaluate all active transactions and movements
    v_starting_cash := 0;
    v_starting_online := 0;

    SELECT
      coalesce(sum(amount_paise) FILTER (WHERE type = 'income' AND payment_method = 'cash'), 0),
      coalesce(sum(amount_paise) FILTER (WHERE type = 'expense' AND payment_method = 'cash'), 0),
      coalesce(sum(amount_paise) FILTER (WHERE type = 'income' AND payment_method IN ('online', 'upi')), 0),
      coalesce(sum(amount_paise) FILTER (WHERE type = 'expense' AND payment_method IN ('online', 'upi')), 0)
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
      coalesce(sum(amount_paise) FILTER (WHERE movement_type = 'transfer' AND to_method IN ('online', 'upi')), 0),
      coalesce(sum(amount_paise) FILTER (WHERE movement_type = 'transfer' AND from_method IN ('online', 'upi')), 0),
      coalesce(sum(adjustment_paise) FILTER (WHERE movement_type = 'adjustment' AND payment_method = 'cash'), 0),
      coalesce(sum(adjustment_paise) FILTER (WHERE movement_type = 'adjustment' AND payment_method IN ('online', 'upi')), 0)
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

  -- 4. Calculate current net balances
  v_current_cash := v_starting_cash + v_cash_income - v_cash_expense + v_transfers_cash_in - v_transfers_cash_out + v_cash_adjustments;
  v_current_online := v_starting_online + v_online_income - v_online_expense + v_transfers_online_in - v_transfers_online_out + v_online_adjustments;
  v_starting_total := v_starting_cash + v_starting_online;
  v_total_available := v_current_cash + v_current_online;

  RETURN jsonb_build_object(
    'starting_cash_paise', v_starting_cash,
    'starting_online_paise', v_starting_online,
    'starting_total_paise', v_starting_total,
    'current_cash_paise', v_current_cash,
    'current_online_paise', v_current_online,
    'total_available_paise', v_total_available,
    'balances_configured', coalesce(v_configured, FALSE),
    'balances_configured_at', v_configured_at
  );
END;
$$;

-- 2. Update trigger validation for non-negative balances on consolidated ledger
CREATE OR REPLACE FUNCTION public.fn_validate_transaction_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_configured BOOLEAN;
  v_configured_at TIMESTAMPTZ;
  v_starting_cash BIGINT;
  v_starting_online BIGINT;

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
  -- 1. Extract target user identity
  v_user_id := coalesce(NEW.user_id, OLD.user_id);

  -- 2. Fetch user baseline configuration status
  SELECT
    coalesce(balances_configured, FALSE),
    balances_configured_at,
    coalesce(starting_cash_paise, 0),
    coalesce(starting_online_paise, 0)
  INTO
    v_configured,
    v_configured_at,
    v_starting_cash,
    v_starting_online
  FROM public.profiles
  WHERE id = v_user_id;

  -- 3. Invariant: Unconfigured accounts do NOT enforce non-negative floor
  IF v_configured IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- 4. Compute available balances from all OTHER active records
  SELECT
    coalesce(sum(amount_paise) FILTER (WHERE type = 'income' AND payment_method = 'cash'), 0),
    coalesce(sum(amount_paise) FILTER (WHERE type = 'expense' AND payment_method = 'cash'), 0),
    coalesce(sum(amount_paise) FILTER (WHERE type = 'income' AND payment_method IN ('online', 'upi')), 0),
    coalesce(sum(amount_paise) FILTER (WHERE type = 'expense' AND payment_method IN ('online', 'upi')), 0)
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
    coalesce(sum(amount_paise) FILTER (WHERE movement_type = 'transfer' AND to_method IN ('online', 'upi')), 0) -
    coalesce(sum(amount_paise) FILTER (WHERE movement_type = 'transfer' AND from_method IN ('online', 'upi')), 0),
    coalesce(sum(adjustment_paise) FILTER (WHERE movement_type = 'adjustment' AND payment_method = 'cash'), 0),
    coalesce(sum(adjustment_paise) FILTER (WHERE movement_type = 'adjustment' AND payment_method IN ('online', 'upi')), 0)
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

  -- 5. Test invariant against the new/updated transaction
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.deleted_at IS NULL THEN
    IF v_configured_at IS NULL OR NEW.recorded_at > v_configured_at THEN
      IF NEW.type = 'expense' THEN
        IF NEW.payment_method = 'cash' THEN
          IF (v_avail_cash - NEW.amount_paise) < 0 THEN
            RAISE EXCEPTION 'Insufficient cash balance (available: % paise, required: % paise)',
              v_avail_cash, NEW.amount_paise
              USING ERRCODE = 'check_violation';
          END IF;
        ELSIF NEW.payment_method IN ('online', 'upi') THEN
          IF (v_avail_online - NEW.amount_paise) < 0 THEN
            RAISE EXCEPTION 'Insufficient digital balance (available: % paise, required: % paise)',
              v_avail_online, NEW.amount_paise
              USING ERRCODE = 'check_violation';
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Grants and permissions
REVOKE ALL ON FUNCTION public.fn_account_balances() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_account_balances() FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_account_balances() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_account_balances() TO service_role;

REVOKE ALL ON FUNCTION public.fn_validate_transaction_balance() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_validate_transaction_balance() FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_validate_transaction_balance() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_validate_transaction_balance() TO service_role;

COMMENT ON FUNCTION public.fn_account_balances() IS 'Calculates atomic cash and digital funds balances for the consolidated personal Ledger.';

NOTIFY pgrst, 'reload schema';
