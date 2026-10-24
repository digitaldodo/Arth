-- Migration 0009: People & Named Money Records Tracker
-- Establishes people, named money obligations, settlements, atomic settlement function, and RLS.

-- 1. Create Direction Enum
CREATE TYPE public.person_direction AS ENUM ('i_owe_them', 'they_owe_me');

-- 2. Create People Table
CREATE TABLE public.people (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  direction    public.person_direction NOT NULL,
  archived_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_people_name_non_empty CHECK (char_length(trim(name)) > 0 AND char_length(name) <= 100),
  CONSTRAINT uq_people_id_user_id UNIQUE (id, user_id)
);

-- 3. Create Person Money Records Table
CREATE TABLE public.person_money_records (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  person_id    UUID NOT NULL,
  name         TEXT NOT NULL,
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  direction    public.person_direction NOT NULL,
  record_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  notes        TEXT,
  archived_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_records_person_user FOREIGN KEY (person_id, user_id) REFERENCES public.people(id, user_id) ON DELETE CASCADE,
  CONSTRAINT uq_records_id_user_id UNIQUE (id, user_id),
  CONSTRAINT chk_records_name_non_empty CHECK (char_length(trim(name)) > 0 AND char_length(name) <= 100)
);

-- 4. Create Person Money Settlements Table
CREATE TABLE public.person_money_settlements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  record_id       UUID NOT NULL,
  amount_paise    BIGINT NOT NULL CHECK (amount_paise > 0),
  settlement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_settlements_record_user FOREIGN KEY (record_id, user_id) REFERENCES public.person_money_records(id, user_id) ON DELETE CASCADE
);

-- 5. Indexes
CREATE INDEX idx_people_user_active
  ON public.people (user_id, created_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX idx_people_user_name
  ON public.people (user_id, lower(name));

CREATE INDEX idx_records_person
  ON public.person_money_records (person_id, record_date DESC, created_at DESC);

CREATE INDEX idx_records_user_date
  ON public.person_money_records (user_id, record_date DESC);

CREATE INDEX idx_settlements_record
  ON public.person_money_settlements (record_id, settlement_date DESC);

-- 6. Atomic Settlement Stored Procedure
CREATE OR REPLACE FUNCTION public.fn_record_person_settlement(
  p_id UUID,
  p_record_id UUID,
  p_amount_paise BIGINT,
  p_settlement_date DATE DEFAULT CURRENT_DATE,
  p_notes TEXT DEFAULT NULL
)
RETURNS public.person_money_settlements
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_user_id UUID;
  v_record RECORD;
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

  -- Lock target record row for update to prevent concurrent over-settlement
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

  -- Calculate current settled sum
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

  -- Insert settlement
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

-- 7. Row-Level Security (RLS) Configuration
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.person_money_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.person_money_settlements ENABLE ROW LEVEL SECURITY;

-- People Policies
CREATE POLICY "people_select_own"
  ON public.people FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "people_insert_own"
  ON public.people FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "people_update_own"
  ON public.people FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "people_delete_own"
  ON public.people FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Person Money Records Policies
CREATE POLICY "records_select_own"
  ON public.person_money_records FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "records_insert_own"
  ON public.person_money_records FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "records_update_own"
  ON public.person_money_records FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "records_delete_own"
  ON public.person_money_records FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Person Money Settlements Policies
CREATE POLICY "settlements_select_own"
  ON public.person_money_settlements FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "settlements_insert_own"
  ON public.person_money_settlements FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "settlements_update_own"
  ON public.person_money_settlements FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "settlements_delete_own"
  ON public.person_money_settlements FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- 8. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.people TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.person_money_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.person_money_settlements TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_record_person_settlement TO authenticated;
