-- Migration 0027: Dashboard Lifetime Summary and Nullable Date Support
-- Updates fn_dashboard_summary to support optional start_date and end_date (Lifetime queries)
-- When both parameters are NULL, all historical transactions for the user are aggregated.
-- When start_date and/or end_date are provided, filters transactions within the inclusive bounds.
-- Always computes total_active_transaction_count across all time for accurate empty-state classification.

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
  FROM public.transactions
  WHERE user_id = v_user_id
    AND deleted_at IS NULL
    AND (p_start_date IS NULL OR transaction_date >= p_start_date)
    AND (p_end_date IS NULL OR transaction_date <= p_end_date);

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
