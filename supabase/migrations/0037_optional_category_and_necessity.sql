-- Migration 0037: Optional Category and Necessity for Frictionless Ingestion & Bank Statement Import
-- Allows transactions to be saved with category_id = NULL and necessity = NULL (unclassified expenses)
-- Preserves relational integrity when category is supplied, and updates fn_dashboard_summary to handle uncategorized records.

-- 1. Make category_id nullable on transactions
ALTER TABLE public.transactions
  ALTER COLUMN category_id DROP NOT NULL;

-- 2. Relax necessity constraint to allow NULL necessity on expense transactions (unclassified)
-- Income transactions strictly require necessity IS NULL; expense transactions may have necessity NULL or valid enum value
ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS chk_transactions_necessity;

ALTER TABLE public.transactions
  ADD CONSTRAINT chk_transactions_necessity
  CHECK (
    (type = 'income' AND necessity IS NULL) OR
    (type = 'expense')
  );

COMMENT ON CONSTRAINT chk_transactions_necessity ON public.transactions
  IS 'Enforces necessity strictly NULL for income, and either NULL (unclassified) or valid necessity tier for expenses.';

-- 3. Update fn_dashboard_summary to handle nullable category_id and unclassified necessity seamlessly
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

  -- 2. Compute spending composition by category (expenses only) using LEFT JOIN for uncategorized rows
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'category_id', cat_summary.category_id,
        'category_name', coalesce(c.name, 'Uncategorized'),
        'category_color', coalesce(c.color, '#64748B'),
        'category_icon', coalesce(c.icon, 'help-circle'),
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
  LEFT JOIN public.categories c ON c.id = cat_summary.category_id;

  -- 2b. Compute spending composition by necessity (expenses only)
  -- Unclassified expenses (necessity IS NULL) are excluded from essential/optional/luxury buckets
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

  -- 3. Fetch recent transactions for dashboard preview (max 10) with LEFT JOIN for category
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'amount_paise', t.amount_paise,
        'type', t.type,
        'category_id', t.category_id,
        'category_name', coalesce(c.name, 'Uncategorized'),
        'category_color', c.color,
        'category_icon', c.icon,
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

  -- 4. Check if there are any active records in the filtered period
  v_has_activity := (v_income_paise > 0 OR v_expenses_paise > 0);

  -- 5. Always compute total active transactions across all time for accurate empty state classification
  SELECT count(*)
  INTO v_total_active_count
  FROM public.transactions
  WHERE user_id = v_user_id
    AND deleted_at IS NULL;

  -- Return unified JSON snapshot matching frontend DashboardSummaryResponse contract
  RETURN jsonb_build_object(
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

COMMENT ON FUNCTION public.fn_dashboard_summary(DATE, DATE) IS
  'Computes dashboard summary metrics with support for lifetime queries, uncategorized transactions, and unclassified necessity spending.';

GRANT EXECUTE ON FUNCTION public.fn_dashboard_summary(DATE, DATE) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_dashboard_summary(DATE, DATE) FROM public, anon;
