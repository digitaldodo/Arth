-- Migration 0010: Database Reliability, ACID, and Performance Hardening
-- Hardens settlement idempotency, history protection, row locking, and high-performance query indexes.

-- 1. History Protection: Prevent accidental cascade destruction of financial records and settlements
ALTER TABLE public.person_money_records
  DROP CONSTRAINT IF EXISTS fk_records_person_user,
  ADD CONSTRAINT fk_records_person_user
    FOREIGN KEY (person_id, user_id)
    REFERENCES public.people(id, user_id)
    ON DELETE RESTRICT;

ALTER TABLE public.person_money_settlements
  DROP CONSTRAINT IF EXISTS fk_settlements_record_user,
  ADD CONSTRAINT fk_settlements_record_user
    FOREIGN KEY (record_id, user_id)
    REFERENCES public.person_money_records(id, user_id)
    ON DELETE RESTRICT;

-- 2. Settlement Direct Mutation Lockdown: Prevent bypassing settlement limits
-- Revoke direct table mutations from authenticated users so all settlements must go through fn_record_person_settlement
REVOKE INSERT, UPDATE, DELETE ON public.person_money_settlements FROM authenticated;

DROP POLICY IF EXISTS "settlements_insert_own" ON public.person_money_settlements;
DROP POLICY IF EXISTS "settlements_update_own" ON public.person_money_settlements;
DROP POLICY IF EXISTS "settlements_delete_own" ON public.person_money_settlements;

-- 3. Idempotent & Concurrency-Safe Settlement Stored Procedure
CREATE OR REPLACE FUNCTION public.fn_record_person_settlement(
  p_id UUID,
  p_record_id UUID,
  p_amount_paise BIGINT,
  p_settlement_date DATE DEFAULT CURRENT_DATE,
  p_notes TEXT DEFAULT NULL
)
RETURNS public.person_money_settlements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_record RECORD;
  v_existing_settlement public.person_money_settlements;
  v_already_settled BIGINT;
  v_remaining BIGINT;
  v_settlement public.person_money_settlements;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF p_amount_paise IS NULL OR p_amount_paise <= 0 THEN
    RAISE EXCEPTION 'Settlement amount must be positive' USING ERRCODE = '22003';
  END IF;

  -- Idempotency check: If an explicit settlement ID is provided, verify whether it already exists
  IF p_id IS NOT NULL THEN
    SELECT * INTO v_existing_settlement
      FROM public.person_money_settlements
     WHERE id = p_id AND user_id = v_user_id;

    IF FOUND THEN
      -- Identical payload replay: return existing settlement without side effects
      IF v_existing_settlement.record_id = p_record_id
         AND v_existing_settlement.amount_paise = p_amount_paise
         AND v_existing_settlement.settlement_date = coalesce(p_settlement_date, CURRENT_DATE) THEN
        RETURN v_existing_settlement;
      ELSE
        -- Conflicting payload replay with same ID: fail with conflict code 23505
        RAISE EXCEPTION 'A settlement with this ID already exists with different attributes'
          USING ERRCODE = '23505';
      END IF;
    END IF;
  END IF;

  -- Lock target record row for update to prevent concurrent over-settlement race conditions
  SELECT id, user_id, person_id, amount_paise, archived_at
    INTO v_record
    FROM public.person_money_records
   WHERE id = p_record_id
     AND user_id = v_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Record not found or access denied' USING ERRCODE = 'P0002';
  END IF;

  IF v_record.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot record settlement for an archived record' USING ERRCODE = '22000';
  END IF;

  -- Calculate current settled sum under record lock
  SELECT coalesce(sum(amount_paise), 0)
    INTO v_already_settled
    FROM public.person_money_settlements
   WHERE record_id = p_record_id
     AND user_id = v_user_id;

  v_remaining := v_record.amount_paise - v_already_settled;

  IF p_amount_paise > v_remaining THEN
    RAISE EXCEPTION 'Settlement amount (% paise) exceeds remaining outstanding balance (% paise)',
      p_amount_paise, v_remaining USING ERRCODE = '22000';
  END IF;

  -- Insert settlement atomically
  INSERT INTO public.person_money_settlements (
    id,
    user_id,
    record_id,
    amount_paise,
    settlement_date,
    notes,
    created_at
  ) VALUES (
    coalesce(p_id, gen_random_uuid()),
    v_user_id,
    p_record_id,
    p_amount_paise,
    coalesce(p_settlement_date, CURRENT_DATE),
    p_notes,
    now()
  )
  RETURNING * INTO v_settlement;

  -- Update timestamp on record and parent person
  UPDATE public.person_money_records
     SET updated_at = now()
   WHERE id = p_record_id;

  UPDATE public.people
     SET updated_at = now()
   WHERE id = v_record.person_id;

  RETURN v_settlement;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_record_person_settlement(UUID, UUID, BIGINT, DATE, TEXT) TO authenticated;

-- 4. Category Reordering Concurrency Hardening: Row-lock active categories
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
  FROM public.categories
  WHERE user_id = v_user_id
    AND type = p_type
    AND archived_at IS NULL
  FOR UPDATE;

  -- 3. Count active categories of this type for this user
  SELECT count(*) INTO v_expected_count
  FROM public.categories
  WHERE user_id = v_user_id
    AND type = p_type
    AND archived_at IS NULL;

  -- 4. Verify count matches exactly
  IF array_length(p_category_ids, 1) != v_expected_count THEN
    RAISE EXCEPTION 'Category IDs list must contain all active categories of the specified type' USING ERRCODE = '22023';
  END IF;

  -- 5. Verify all IDs belong to this user, are active, and match the type
  SELECT count(*) INTO v_actual_count
  FROM public.categories
  WHERE user_id = v_user_id
    AND type = p_type
    AND archived_at IS NULL
    AND id = ANY(p_category_ids);

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

-- 5. Performance & Covering Indexes for CRUD Operations
-- Speed up type-filtered ledger queries: (user_id, type, date)
CREATE INDEX IF NOT EXISTS idx_transactions_user_type_date
  ON public.transactions (user_id, type, transaction_date DESC)
  WHERE deleted_at IS NULL;

-- Speed up People direction filtering: (user_id, direction, created_at)
CREATE INDEX IF NOT EXISTS idx_people_user_direction_active
  ON public.people (user_id, direction, created_at DESC)
  WHERE archived_at IS NULL;

-- Speed up non-archived money records lookup per person
CREATE INDEX IF NOT EXISTS idx_records_person_active
  ON public.person_money_records (person_id, user_id, record_date DESC)
  WHERE archived_at IS NULL;

-- Covering index on settlements for sub-millisecond sum aggregation
CREATE INDEX IF NOT EXISTS idx_settlements_record_amount
  ON public.person_money_settlements (record_id, amount_paise);
