-- Migration 0011: Financial History Protection and Settlement Idempotency Hardening
-- 1. Revoke hard-delete permissions on people and money records from authenticated users.
-- 2. Drop direct DELETE policies so archiving is the sole supported lifecycle.
-- 3. Harden fn_record_person_settlement with strict payload equality (including notes),
--    post-lock re-check for concurrent identical retries, and explicit role grants.

-- 1. History Protection: Remove hard DELETE privileges from authenticated users
REVOKE DELETE ON public.people FROM authenticated;
REVOKE DELETE ON public.person_money_records FROM authenticated;

DROP POLICY IF EXISTS "people_delete_own" ON public.people;
DROP POLICY IF EXISTS "records_delete_own" ON public.person_money_records;

-- 2. Harden Settlement Idempotency and Concurrent Replay Handling
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
  v_target_date DATE;
BEGIN
  -- Strict caller authentication check
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  -- Validate amount
  IF p_amount_paise IS NULL OR p_amount_paise <= 0 THEN
    RAISE EXCEPTION 'Settlement amount must be positive' USING ERRCODE = '22003';
  END IF;

  v_target_date := coalesce(p_settlement_date, CURRENT_DATE);

  -- 1. Pre-lock Idempotency Check:
  -- If settlement ID is provided, check if it already exists for this authenticated user
  IF p_id IS NOT NULL THEN
    SELECT * INTO v_existing_settlement
      FROM public.person_money_settlements
     WHERE id = p_id AND user_id = v_user_id;

    IF FOUND THEN
      -- Check if ALL attributes match identically: record_id, amount_paise, settlement_date, notes
      IF v_existing_settlement.record_id = p_record_id
         AND v_existing_settlement.amount_paise = p_amount_paise
         AND v_existing_settlement.settlement_date = v_target_date
         AND (
           (v_existing_settlement.notes IS NULL AND p_notes IS NULL)
           OR (v_existing_settlement.notes = p_notes)
         ) THEN
        RETURN v_existing_settlement;
      ELSE
        -- Conflicting payload with existing ID raises 23505
        RAISE EXCEPTION 'A settlement with this ID already exists with different attributes'
          USING ERRCODE = '23505';
      END IF;
    END IF;
  END IF;

  -- 2. Lock target record row for update to serialize balance calculations
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

  -- 3. Post-Lock Re-check for Concurrent Identical Retries:
  -- If a competing concurrent request with the same p_id acquired the lock first and inserted,
  -- re-checking here allows this request to cleanly return the committed settlement instead
  -- of hitting a primary key collision.
  IF p_id IS NOT NULL THEN
    SELECT * INTO v_existing_settlement
      FROM public.person_money_settlements
     WHERE id = p_id AND user_id = v_user_id;

    IF FOUND THEN
      IF v_existing_settlement.record_id = p_record_id
         AND v_existing_settlement.amount_paise = p_amount_paise
         AND v_existing_settlement.settlement_date = v_target_date
         AND (
           (v_existing_settlement.notes IS NULL AND p_notes IS NULL)
           OR (v_existing_settlement.notes = p_notes)
         ) THEN
        RETURN v_existing_settlement;
      ELSE
        RAISE EXCEPTION 'A settlement with this ID already exists with different attributes'
          USING ERRCODE = '23505';
      END IF;
    END IF;
  END IF;

  -- 4. Calculate current settled sum under record row lock
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

  -- 5. Insert settlement atomically
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
    v_target_date,
    p_notes,
    now()
  )
  RETURNING * INTO v_settlement;

  -- 6. Touch timestamps atomically
  UPDATE public.person_money_records
     SET updated_at = now()
   WHERE id = p_record_id;

  UPDATE public.people
     SET updated_at = now()
   WHERE id = v_record.person_id;

  RETURN v_settlement;
END;
$$;

-- 3. Security: Revoke from PUBLIC and anon; grant exclusively to authenticated
REVOKE ALL ON FUNCTION public.fn_record_person_settlement(UUID, UUID, BIGINT, DATE, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_record_person_settlement(UUID, UUID, BIGINT, DATE, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_record_person_settlement(UUID, UUID, BIGINT, DATE, TEXT) TO authenticated;
