-- Migration 0015: Category Reordering Column Disambiguation and Concurrency Hardening
-- Resolves PostgreSQL error 42702 (ambiguous column reference "type", "id", "archived_at"
-- between RETURNS TABLE output variables and table columns in PL/pgSQL).
-- Fully qualifies all column references with table alias "c" and sets variable conflict resolution.
-- Preserves strict SECURITY INVOKER, user-isolation (auth.uid()), duplicate checks, count checks,
-- and FOR UPDATE concurrency locks.

CREATE OR REPLACE FUNCTION public.fn_reorder_categories(
  p_type public.transaction_type,
  p_category_ids UUID[]
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  type public.transaction_type,
  icon TEXT,
  color TEXT,
  sort_order INTEGER,
  is_default BOOLEAN,
  archived_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, auth
AS $$
#variable_conflict use_column
DECLARE
  v_user_id UUID := auth.uid();
  v_expected_count INTEGER;
  v_actual_count INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF array_length(p_category_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Category IDs list cannot be empty' USING ERRCODE = '22023';
  END IF;

  -- 1. Check for duplicates in p_category_ids
  IF array_length(p_category_ids, 1) != (SELECT count(DISTINCT x) FROM unnest(p_category_ids) x) THEN
    RAISE EXCEPTION 'Category IDs list must not contain duplicates' USING ERRCODE = '22023';
  END IF;

  -- 2. Lock all active categories of this type for this user to prevent concurrent mutation race conditions
  PERFORM 1
  FROM public.categories c
  WHERE c.user_id = v_user_id
    AND c.type = p_type
    AND c.archived_at IS NULL
  FOR UPDATE;

  -- 3. Count active categories of this type for this user
  SELECT count(*) INTO v_expected_count
  FROM public.categories c
  WHERE c.user_id = v_user_id
    AND c.type = p_type
    AND c.archived_at IS NULL;

  -- 4. Verify count matches exactly
  IF array_length(p_category_ids, 1) != v_expected_count THEN
    RAISE EXCEPTION 'Category IDs list must contain all active categories of the specified type' USING ERRCODE = '22023';
  END IF;

  -- 5. Verify all IDs belong to this user, are active, and match the type
  SELECT count(*) INTO v_actual_count
  FROM public.categories c
  WHERE c.user_id = v_user_id
    AND c.type = p_type
    AND c.archived_at IS NULL
    AND c.id = ANY(p_category_ids);

  IF v_actual_count != v_expected_count THEN
    RAISE EXCEPTION 'One or more category IDs are invalid, archived, or belong to another user/type' USING ERRCODE = '22023';
  END IF;

  -- 6. Atomically update sort_order according to 1-based array ordinal position
  WITH new_orders AS (
    SELECT id AS cat_id, ord::INTEGER AS new_sort_order
    FROM unnest(p_category_ids) WITH ORDINALITY AS t(id, ord)
  )
  UPDATE public.categories c
  SET sort_order = no.new_sort_order,
      updated_at = now()
  FROM new_orders no
  WHERE c.id = no.cat_id
    AND c.user_id = v_user_id;

  -- 7. Return the updated categories in order
  RETURN QUERY
  SELECT c.id, c.name, c.type, c.icon, c.color, c.sort_order, c.is_default, c.archived_at
  FROM public.categories c
  WHERE c.user_id = v_user_id
    AND c.type = p_type
    AND c.archived_at IS NULL
  ORDER BY c.sort_order ASC, c.name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_reorder_categories(public.transaction_type, UUID[]) TO authenticated;
