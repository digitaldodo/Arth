-- Migration 0031: explicitly confirmed cross-account transfer/card-payment reconciliation.
-- Replaces dashboard aggregation so confirmed pairs are excluded from income and spending.

-- Establish the relationship columns and constraints before defining the RPC that uses them.
ALTER TABLE public.transaction_links ADD CONSTRAINT uq_transaction_links_id_user UNIQUE (id, user_id);
ALTER TABLE public.account_movements ADD COLUMN transaction_link_id UUID;
ALTER TABLE public.account_movements
  ADD CONSTRAINT uq_account_movements_transaction_link UNIQUE (transaction_link_id),
  ADD CONSTRAINT fk_account_movement_transaction_link_owner FOREIGN KEY (transaction_link_id, user_id)
    REFERENCES public.transaction_links(id, user_id) ON DELETE RESTRICT;

-- Confirm only exact, opposite-sign transactions in different owned financial accounts.
CREATE OR REPLACE FUNCTION public.confirm_transaction_reconciliation(
  p_link_id UUID,
  p_movement_id UUID,
  p_source_transaction_id UUID,
  p_target_transaction_id UUID,
  p_relationship TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_first public.transactions%ROWTYPE;
  v_second public.transactions%ROWTYPE;
  v_first_account_type TEXT;
  v_second_account_type TEXT;
  v_existing public.transaction_links%ROWTYPE;
  v_result public.transaction_links%ROWTYPE;
  v_existing_movement public.account_movements%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  IF p_link_id IS NULL OR p_movement_id IS NULL OR p_source_transaction_id IS NULL OR p_target_transaction_id IS NULL
     OR p_source_transaction_id = p_target_transaction_id
     OR p_relationship NOT IN ('transfer_pair', 'card_settlement') THEN
    RAISE EXCEPTION 'Invalid reconciliation request' USING ERRCODE = '22000';
  END IF;
  IF substring(p_link_id::text FROM 15 FOR 1) <> '7' OR substring(p_movement_id::text FROM 15 FOR 1) <> '7' THEN
    RAISE EXCEPTION 'Reconciliation identifiers must be UUID version 7' USING ERRCODE = '22000';
  END IF;

  -- Stable lock order serializes competing attempts to pair either transaction.
  PERFORM 1 FROM public.transactions
  WHERE user_id = v_user AND id IN (p_source_transaction_id, p_target_transaction_id)
  ORDER BY id FOR UPDATE;
  SELECT * INTO v_first FROM public.transactions
  WHERE user_id = v_user AND id = p_source_transaction_id AND deleted_at IS NULL;
  SELECT * INTO v_second FROM public.transactions
  WHERE user_id = v_user AND id = p_target_transaction_id AND deleted_at IS NULL;
  IF NOT FOUND OR v_first.id IS NULL OR v_second.id IS NULL THEN
    RAISE EXCEPTION 'Both active transactions must belong to your account' USING ERRCODE = 'P0002';
  END IF;
  IF v_first.account_id IS NULL OR v_second.account_id IS NULL OR v_first.account_id = v_second.account_id
     OR v_first.type = v_second.type OR v_first.amount_paise <> v_second.amount_paise
     OR abs(v_first.transaction_date - v_second.transaction_date) > 2 THEN
    RAISE EXCEPTION 'Pair must have equal amounts, opposite directions, distinct accounts and dates within two days' USING ERRCODE = '22000';
  END IF;
  SELECT account_type INTO v_first_account_type FROM public.financial_accounts
  WHERE id = v_first.account_id AND user_id = v_user;
  SELECT account_type INTO v_second_account_type FROM public.financial_accounts
  WHERE id = v_second.account_id AND user_id = v_user;
  IF p_relationship = 'card_settlement'
     AND NOT ((v_first_account_type = 'credit_card') <> (v_second_account_type = 'credit_card')) THEN
    RAISE EXCEPTION 'Card settlement requires exactly one credit-card account' USING ERRCODE = '22000';
  END IF;
  IF p_relationship = 'transfer_pair' AND (v_first_account_type = 'credit_card' OR v_second_account_type = 'credit_card') THEN
    RAISE EXCEPTION 'Credit-card payments must use the card settlement relationship' USING ERRCODE = '22000';
  END IF;

  SELECT * INTO v_existing FROM public.transaction_links
  WHERE user_id = v_user AND status = 'confirmed'
    AND (source_transaction_id IN (p_source_transaction_id, p_target_transaction_id)
      OR target_transaction_id IN (p_source_transaction_id, p_target_transaction_id))
  LIMIT 1;
  IF FOUND THEN
    IF v_existing.relationship = p_relationship
       AND ((v_existing.source_transaction_id = p_source_transaction_id AND v_existing.target_transaction_id = p_target_transaction_id)
         OR (v_existing.source_transaction_id = p_target_transaction_id AND v_existing.target_transaction_id = p_source_transaction_id)) THEN
      RETURN to_jsonb(v_existing);
    END IF;
    RAISE EXCEPTION 'A transaction can belong to only one confirmed reconciliation pair' USING ERRCODE = '23505';
  END IF;

  -- Reuse an earlier rejected pair to preserve the table's pair-level idempotency constraint.
  SELECT * INTO v_existing FROM public.transaction_links
  WHERE user_id = v_user AND status = 'rejected'
    AND relationship = p_relationship
    AND ((source_transaction_id = p_source_transaction_id AND target_transaction_id = p_target_transaction_id)
      OR (source_transaction_id = p_target_transaction_id AND target_transaction_id = p_source_transaction_id))
  LIMIT 1;
  IF FOUND THEN
    UPDATE public.transaction_links SET status = 'confirmed', created_by_user = TRUE,
      explanation = 'Confirmed again by the account owner after reviewing both statement entries.'
    WHERE id = v_existing.id RETURNING * INTO v_result;
    SELECT * INTO v_existing_movement FROM public.account_movements
    WHERE transaction_link_id = v_result.id AND user_id = v_user;
    IF FOUND THEN
      UPDATE public.account_movements SET
        from_account_id = CASE WHEN v_first.type = 'expense' THEN v_first.account_id ELSE v_second.account_id END,
        to_account_id = CASE WHEN v_first.type = 'income' THEN v_first.account_id ELSE v_second.account_id END,
        amount_paise = v_first.amount_paise,
        movement_date = LEAST(v_first.transaction_date, v_second.transaction_date),
        reference = coalesce(v_first.statement_reference, v_second.statement_reference),
        deleted_at = NULL
      WHERE id = v_existing_movement.id;
    ELSE
      INSERT INTO public.account_movements(id, user_id, from_account_id, to_account_id, amount_paise,
        movement_date, reference, notes, transaction_link_id)
      VALUES (p_movement_id, v_user,
        CASE WHEN v_first.type = 'expense' THEN v_first.account_id ELSE v_second.account_id END,
        CASE WHEN v_first.type = 'income' THEN v_first.account_id ELSE v_second.account_id END,
        v_first.amount_paise, LEAST(v_first.transaction_date, v_second.transaction_date),
        coalesce(v_first.statement_reference, v_second.statement_reference),
        'Cross-account movement reconciled from two user-confirmed ledger entries.', v_result.id);
    END IF;
    RETURN to_jsonb(v_result);
  END IF;

  INSERT INTO public.transaction_links(id, user_id, source_transaction_id, target_transaction_id,
    relationship, confidence, explanation, status, created_by_user)
  VALUES (p_link_id, v_user, p_source_transaction_id, p_target_transaction_id,
    p_relationship, 1, 'Confirmed by the account owner after reviewing both statement entries.', 'confirmed', TRUE)
  RETURNING * INTO v_result;
  INSERT INTO public.account_movements(id, user_id, from_account_id, to_account_id, amount_paise,
    movement_date, reference, notes, transaction_link_id)
  VALUES (p_movement_id, v_user,
    CASE WHEN v_first.type = 'expense' THEN v_first.account_id ELSE v_second.account_id END,
    CASE WHEN v_first.type = 'income' THEN v_first.account_id ELSE v_second.account_id END,
    v_first.amount_paise, LEAST(v_first.transaction_date, v_second.transaction_date),
    coalesce(v_first.statement_reference, v_second.statement_reference),
    'Cross-account movement reconciled from two user-confirmed ledger entries.', v_result.id);
  RETURN to_jsonb(v_result);
END;
$$;
REVOKE ALL ON FUNCTION public.confirm_transaction_reconciliation(UUID, UUID, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_transaction_reconciliation(UUID, UUID, UUID, UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_transaction_reconciliation(p_link_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE v_user UUID := auth.uid(); v_count INTEGER;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  UPDATE public.transaction_links SET status = 'rejected'
  WHERE id = p_link_id AND user_id = v_user AND status = 'confirmed';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 1 THEN
    UPDATE public.account_movements SET deleted_at = now()
    WHERE transaction_link_id = p_link_id AND user_id = v_user AND deleted_at IS NULL;
  END IF;
  RETURN v_count = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.reject_transaction_reconciliation(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reject_transaction_reconciliation(UUID) TO authenticated;

-- Require all confirmed writes to pass through the validation RPCs.
REVOKE INSERT, UPDATE, DELETE ON public.transaction_links FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.account_movements FROM authenticated;
DROP POLICY IF EXISTS transaction_links_insert_own ON public.transaction_links;
DROP POLICY IF EXISTS transaction_links_update_own ON public.transaction_links;
DROP POLICY IF EXISTS transaction_links_delete_own ON public.transaction_links;
DROP POLICY IF EXISTS account_movements_insert_own ON public.account_movements;
DROP POLICY IF EXISTS account_movements_update_own ON public.account_movements;
DROP POLICY IF EXISTS account_movements_delete_own ON public.account_movements;

CREATE OR REPLACE FUNCTION public.fn_protect_confirmed_reconciliation_pair()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF (NEW.amount_paise IS DISTINCT FROM OLD.amount_paise
      OR NEW.type IS DISTINCT FROM OLD.type
      OR NEW.transaction_date IS DISTINCT FROM OLD.transaction_date
      OR NEW.account_id IS DISTINCT FROM OLD.account_id
      OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at)
     AND EXISTS (
       SELECT 1 FROM public.transaction_links l
       WHERE l.user_id = OLD.user_id AND l.status = 'confirmed'
         AND (l.source_transaction_id = OLD.id OR l.target_transaction_id = OLD.id)
     ) THEN
    RAISE EXCEPTION 'Remove the confirmed account reconciliation before changing or deleting this transaction' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_protect_confirmed_reconciliation_pair() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_protect_confirmed_reconciliation_pair ON public.transactions;
CREATE TRIGGER trg_protect_confirmed_reconciliation_pair
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.fn_protect_confirmed_reconciliation_pair();

NOTIFY pgrst, 'reload schema';

CREATE OR REPLACE FUNCTION public.fn_dashboard_summary(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_income_paise BIGINT;
  v_expenses_paise BIGINT;
  v_net_cash_flow_paise BIGINT;
  v_spending_json JSONB;
  v_necessity_json JSONB;
  v_recent_json JSONB;
  v_has_activity BOOLEAN;
  v_total_active_count BIGINT;
BEGIN
  -- Strict caller authentication check
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  -- Validate date range bounds when both are provided
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL AND p_start_date > p_end_date THEN
    RAISE EXCEPTION 'Start date cannot be after end date' USING ERRCODE = '22000';
  END IF;

  -- 1. Compute aggregate income and expense totals for the date range (or lifetime if unbounded)
  SELECT
    coalesce(sum(amount_paise) FILTER (WHERE type = 'income'), 0),
    coalesce(sum(amount_paise) FILTER (WHERE type = 'expense'), 0)
  INTO
    v_income_paise,
    v_expenses_paise
  FROM public.transactions t
  WHERE t.user_id = v_user_id
    AND t.deleted_at IS NULL
    AND (p_start_date IS NULL OR t.transaction_date >= p_start_date)
    AND (p_end_date IS NULL OR t.transaction_date <= p_end_date)
    AND NOT EXISTS (
      SELECT 1 FROM public.transaction_links l
      WHERE l.user_id = v_user_id AND l.status = 'confirmed'
        AND l.relationship IN ('transfer_pair', 'card_settlement')
        AND (l.source_transaction_id = t.id OR l.target_transaction_id = t.id)
    );

  v_net_cash_flow_paise := v_income_paise - v_expenses_paise;

  -- 2. Compute spending composition by category (expenses only)
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'category_id', cat_summary.category_id,
        'category_name', c.name,
        'category_color', c.color,
        'category_icon', c.icon,
        'amount_paise', cat_summary.cat_amount,
        'share_percentage', CASE
          WHEN v_expenses_paise > 0 THEN
            round((cat_summary.cat_amount::numeric / v_expenses_paise::numeric) * 100, 1)
          ELSE 0
        END
      )
      ORDER BY cat_summary.cat_amount DESC
    ),
    '[]'::jsonb
  )
  INTO v_spending_json
  FROM (
    SELECT
      t.category_id,
      sum(t.amount_paise) AS cat_amount
    FROM public.transactions t
    WHERE t.user_id = v_user_id
      AND t.deleted_at IS NULL
      AND t.type = 'expense'
      AND (p_start_date IS NULL OR t.transaction_date >= p_start_date)
      AND (p_end_date IS NULL OR t.transaction_date <= p_end_date)
      AND NOT EXISTS (
        SELECT 1 FROM public.transaction_links l
        WHERE l.user_id = v_user_id AND l.status = 'confirmed'
          AND l.relationship IN ('transfer_pair', 'card_settlement')
          AND (l.source_transaction_id = t.id OR l.target_transaction_id = t.id)
      )
    GROUP BY t.category_id
  ) cat_summary
  JOIN public.categories c ON c.id = cat_summary.category_id;

  -- 2b. Compute spending composition by necessity (expenses only)
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'necessity', nec.necessity,
        'label', nec.label,
        'amount_paise', coalesce(nec_summary.nec_amount, 0),
        'formatted_inr', '₹' || to_char((coalesce(nec_summary.nec_amount, 0)::numeric / 100), 'FM999,999,990.00'),
        'share_percentage', CASE
          WHEN v_expenses_paise > 0 THEN
            round((coalesce(nec_summary.nec_amount, 0)::numeric / v_expenses_paise::numeric) * 100, 1)
          ELSE 0
        END
      )
      ORDER BY nec.sort_order
    ),
    '[]'::jsonb
  )
  INTO v_necessity_json
  FROM (
    VALUES
      ('essential'::necessity_class, 'Essential', 1),
      ('optional'::necessity_class, 'Optional', 2),
      ('luxury'::necessity_class, 'Luxury', 3)
  ) AS nec(necessity, label, sort_order)
  LEFT JOIN (
    SELECT
      t.necessity,
      sum(t.amount_paise) AS nec_amount
    FROM public.transactions t
    WHERE t.user_id = v_user_id
      AND t.deleted_at IS NULL
      AND t.type = 'expense'
      AND (p_start_date IS NULL OR t.transaction_date >= p_start_date)
      AND (p_end_date IS NULL OR t.transaction_date <= p_end_date)
      AND NOT EXISTS (
        SELECT 1 FROM public.transaction_links l
        WHERE l.user_id = v_user_id AND l.status = 'confirmed'
          AND l.relationship IN ('transfer_pair', 'card_settlement')
          AND (l.source_transaction_id = t.id OR l.target_transaction_id = t.id)
      )
    GROUP BY t.necessity
  ) nec_summary ON nec_summary.necessity = nec.necessity;

  -- 3. Fetch recent transactions for dashboard preview (max 10)
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'amount_paise', t.amount_paise,
        'type', t.type,
        'category_id', t.category_id,
        'category_name', c.name,
        'transaction_date', t.transaction_date,
        'payment_method', t.payment_method,
        'necessity', t.necessity,
        'description', t.description,
        'notes', t.notes,
        'created_at', t.created_at,
        'updated_at', t.updated_at
      )
      ORDER BY t.transaction_date DESC, t.created_at DESC, t.id DESC
    ),
    '[]'::jsonb
  )
  INTO v_recent_json
  FROM (
    SELECT t.*
    FROM public.transactions t
    WHERE t.user_id = v_user_id
      AND t.deleted_at IS NULL
      AND (p_start_date IS NULL OR t.transaction_date >= p_start_date)
      AND (p_end_date IS NULL OR t.transaction_date <= p_end_date)
    ORDER BY t.transaction_date DESC, t.created_at DESC, t.id DESC
    LIMIT 10
  ) t
  LEFT JOIN public.categories c ON c.id = t.category_id;

  -- 4. Count total active transactions across all time for empty-ledger differentiation
  SELECT count(*)
  INTO v_total_active_count
  FROM public.transactions
  WHERE user_id = v_user_id
    AND deleted_at IS NULL;

  v_has_activity := (jsonb_array_length(v_recent_json) > 0);

  RETURN jsonb_build_object(
    'start_date', p_start_date,
    'end_date', p_end_date,
    'income_paise', v_income_paise,
    'expenses_paise', v_expenses_paise,
    'net_cash_flow_paise', v_net_cash_flow_paise,
    'spending_composition', v_spending_json,
    'spending_by_necessity', v_necessity_json,
    'recent_transactions', v_recent_json,
    'has_activity_in_range', v_has_activity,
    'total_active_transaction_count', v_total_active_count
  );
END;
$$;

-- Revoke from PUBLIC and anon; grant exclusively to authenticated
REVOKE ALL ON FUNCTION public.fn_dashboard_summary(DATE, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_dashboard_summary(DATE, DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_dashboard_summary(DATE, DATE) TO authenticated;
