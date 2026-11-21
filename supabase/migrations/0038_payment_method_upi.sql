-- Migration 0038: First-class 'upi' Payment Method Support
-- Extends public.payment_method enum to include 'upi' alongside 'online' and 'cash'
-- Updates fn_account_balances and fn_validate_transaction_balance to integrate UPI funds with digital balance invariants

-- 1. Safely add 'upi' to payment_method enum if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'payment_method' AND e.enumlabel = 'upi'
  ) THEN
    ALTER TYPE public.payment_method ADD VALUE 'upi';
  END IF;
END $$;

-- 2. Update fn_account_balances to treat 'upi' as digital funds alongside 'online'
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
    -- Unconfigured account: zero starting baseline, evaluate all active transactions and movements
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

  -- 3. Calculate current net balances
  v_current_cash := v_starting_cash + v_cash_income - v_cash_expense + v_transfers_cash_in - v_transfers_cash_out + v_cash_adjustments;
  v_current_online := v_starting_online + v_online_income - v_online_expense + v_transfers_online_in - v_transfers_online_out + v_online_adjustments;
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

-- 3. Update fn_validate_transaction_balance to integrate 'upi' alongside 'online'
CREATE OR REPLACE FUNCTION public.fn_validate_transaction_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, auth
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

  -- 6. Apply NEW proposed transaction state if active
  IF NEW.deleted_at IS NULL AND (v_configured_at IS NULL OR NEW.recorded_at > v_configured_at) THEN
    IF NEW.payment_method = 'cash' THEN
      IF NEW.type = 'income' THEN
        v_avail_cash := v_avail_cash + NEW.amount_paise;
      ELSIF NEW.type = 'expense' THEN
        v_avail_cash := v_avail_cash - NEW.amount_paise;
      END IF;
    ELSIF NEW.payment_method IN ('online', 'upi') THEN
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
