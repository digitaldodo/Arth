-- Migration 0017: Google Sheets Synchronization & Durable Outbox Hardening
-- Creates public.user_sheet_connections table for per-user Google Sheets pairing.
-- Hardens public.outbox_events with atomic worker lease locking (locked_at, claim_id).
-- Adds public.fn_claim_outbox_events for concurrent-safe SKIP LOCKED batch claiming.

CREATE TABLE IF NOT EXISTS public.user_sheet_connections (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  spreadsheet_id   TEXT NOT NULL,
  spreadsheet_url  TEXT NOT NULL,
  sheet_name       TEXT NOT NULL DEFAULT 'Transactions',
  sync_status      TEXT NOT NULL DEFAULT 'idle',
  last_synced_at   TIMESTAMPTZ,
  last_error       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_user_sheet_sync_status CHECK (
    sync_status IN ('idle', 'syncing', 'connected', 'error')
  )
);

COMMENT ON TABLE public.user_sheet_connections IS 'Stores per-user Google Sheet configuration and synchronization metadata.';

-- Indexes for user lookups
CREATE INDEX IF NOT EXISTS idx_user_sheet_connections_user_id
  ON public.user_sheet_connections(user_id);

-- Enable Row Level Security
ALTER TABLE public.user_sheet_connections ENABLE ROW LEVEL SECURITY;

-- RLS Policies: strictly bound to authenticated user
CREATE POLICY "Users can view own sheet connection"
  ON public.user_sheet_connections
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sheet connection"
  ON public.user_sheet_connections
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sheet connection"
  ON public.user_sheet_connections
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own sheet connection"
  ON public.user_sheet_connections
  FOR DELETE
  USING (auth.uid() = user_id);

-- Extend outbox_events with atomic lease-locking columns
ALTER TABLE public.outbox_events
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claim_id TEXT;

-- Composite index to fast-scan pending events for claiming
CREATE INDEX IF NOT EXISTS idx_outbox_events_pending_claim
  ON public.outbox_events (status, retry_count, created_at ASC);

-- Privileged atomic worker claiming function
-- Uses FOR UPDATE SKIP LOCKED to guarantee zero duplicate claiming across concurrent workers
CREATE OR REPLACE FUNCTION public.fn_claim_outbox_events(
  p_batch_size INT DEFAULT 50,
  p_claim_id TEXT DEFAULT gen_random_uuid()::text,
  p_stale_seconds INT DEFAULT 300
)
RETURNS SETOF public.outbox_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- 1. Recover stale in-flight claims from aborted or died workers
  UPDATE public.outbox_events
  SET status = 'pending',
      locked_at = NULL,
      claim_id = NULL
  WHERE status = 'processing'
    AND locked_at < (now() - (p_stale_seconds || ' seconds')::interval);

  -- 2. Atomically claim next pending batch without blocking other workers
  RETURN QUERY
  WITH pending_batch AS (
    SELECT id
    FROM public.outbox_events
    WHERE status = 'pending'
      AND retry_count < 5
    ORDER BY created_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.outbox_events o
  SET status = 'processing',
      locked_at = now(),
      claim_id = p_claim_id
  FROM pending_batch p
  WHERE o.id = p.id
  RETURNING o.*;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_claim_outbox_events(INT, TEXT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_claim_outbox_events(INT, TEXT, INT) FROM anon;
REVOKE ALL ON FUNCTION public.fn_claim_outbox_events(INT, TEXT, INT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_claim_outbox_events(INT, TEXT, INT) TO service_role;

-- Update fn_delete_own_account to cleanly remove user sheet connection upon account deletion
CREATE OR REPLACE FUNCTION public.fn_delete_own_account()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  -- 1. Delete user sheet connection if any
  DELETE FROM public.user_sheet_connections WHERE user_id = v_user_id;

  -- 2. Delete person settlements (child of person_money_records)
  DELETE FROM public.person_money_settlements WHERE user_id = v_user_id;

  -- 3. Delete person money records (child of people)
  DELETE FROM public.person_money_records WHERE user_id = v_user_id;

  -- 4. Delete people
  DELETE FROM public.people WHERE user_id = v_user_id;

  -- 5. Delete transactions (child of categories)
  DELETE FROM public.transactions WHERE user_id = v_user_id;

  -- 6. Delete categories
  DELETE FROM public.categories WHERE user_id = v_user_id;

  -- 7. Delete outbox events
  DELETE FROM public.outbox_events WHERE user_id = v_user_id;

  -- 8. Delete profile
  DELETE FROM public.profiles WHERE id = v_user_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_delete_own_account() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_delete_own_account() FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_delete_own_account() TO authenticated;
