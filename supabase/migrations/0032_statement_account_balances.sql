-- Migration 0032: keep statement-linked account balances separate from the legacy cash/online snapshot.
-- Account balances are calculated from exact BIGINT transaction amounts and returned as decimal text.
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
      AND account_id IS NULL
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
      AND account_id IS NULL
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
      AND deleted_at IS NULL
      AND account_id IS NULL;

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
      AND account_id IS NULL;
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

  -- Account-linked rows are validated by their owned account FK and tracked against that account's statement balance.
  -- They must not be rejected by the unrelated legacy cash/online snapshot.
  IF NEW.account_id IS NOT NULL THEN
    RETURN NEW;
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
    AND account_id IS NULL
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
CREATE OR REPLACE FUNCTION public.fn_financial_account_balances()
RETURNS TABLE(account_id UUID, current_balance_paise TEXT, transaction_count BIGINT, as_of_date DATE)
LANGUAGE SQL
SECURITY INVOKER
SET search_path = public, auth
AS $$
  SELECT a.id,
    (CASE WHEN a.account_type = 'credit_card'
      THEN a.opening_balance_paise + coalesce(sum(t.amount_paise) FILTER (WHERE t.type = 'expense'), 0)
        - coalesce(sum(t.amount_paise) FILTER (WHERE t.type = 'income'), 0)
      ELSE a.opening_balance_paise + coalesce(sum(t.amount_paise) FILTER (WHERE t.type = 'income'), 0)
        - coalesce(sum(t.amount_paise) FILTER (WHERE t.type = 'expense'), 0)
    END)::TEXT,
    count(t.id)::BIGINT,
    coalesce(max(t.transaction_date), a.opening_balance_date)
  FROM public.financial_accounts a
  LEFT JOIN public.transactions t ON t.account_id = a.id AND t.user_id = a.user_id
    AND t.deleted_at IS NULL
    AND (a.opening_balance_date IS NULL OR t.transaction_date > a.opening_balance_date)
  WHERE a.user_id = auth.uid()
  GROUP BY a.id
$$;
REVOKE ALL ON FUNCTION public.fn_financial_account_balances() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_financial_account_balances() TO authenticated;
NOTIFY pgrst, 'reload schema';
