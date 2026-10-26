-- Migration 0020: Supabase Cron (pg_cron) Schedules, Outbox Recovery, and Observability
-- Migrates scheduled background tasks from Vercel Cron to Supabase PostgreSQL Cron (pg_cron).
--
-- Features:
-- 1. Safe enabling of pg_cron and pg_net extensions.
-- 2. Audit and observability logging via public.cron_job_runs.
-- 3. Secure configuration storage via public.app_cron_config and Supabase Vault.
-- 4. Outbox lease recovery (public.fn_recover_stale_outbox_events).
-- 5. Failed event manual retry (public.fn_retry_failed_outbox_events).
-- 6. Cron trigger functions for outbox sync (5-minute interval) and daily reconciliation.
-- 7. Idempotent cron schedule registration (prevents duplicate jobs on repeated runs).

-- ─── 1. Extensions ─────────────────────────────────────────────────────────────
-- Enable pg_cron and pg_net safely with fallback notice for environments without superuser
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron extension could not be enabled directly: %', SQLERRM;
END $$;

DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_net;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_net extension could not be enabled directly: %', SQLERRM;
END $$;

-- ─── 2. Observability: Cron Job Execution History ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.cron_job_runs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name       TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'started',
  details        JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at   TIMESTAMPTZ,
  error_message  TEXT,

  CONSTRAINT chk_cron_job_status CHECK (
    status IN ('started', 'completed', 'failed', 'skipped')
  )
);

COMMENT ON TABLE public.cron_job_runs IS 'Execution audit log for Supabase Cron background jobs and outbox recovery.';

CREATE INDEX IF NOT EXISTS idx_cron_job_runs_job_started
  ON public.cron_job_runs (job_name, started_at DESC);

ALTER TABLE public.cron_job_runs ENABLE ROW LEVEL SECURITY;

-- Restrict cron_job_runs to service_role exclusively
DO $$ BEGIN
  CREATE POLICY "Service role full access to cron_job_runs"
    ON public.cron_job_runs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── 3. Secure Configuration: public.app_cron_config ──────────────────────────
CREATE TABLE IF NOT EXISTS public.app_cron_config (
  config_key   TEXT PRIMARY KEY,
  config_value TEXT NOT NULL,
  description  TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.app_cron_config IS 'Database configuration and fallback parameters for Supabase background workers.';

ALTER TABLE public.app_cron_config ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role full access to app_cron_config"
    ON public.app_cron_config
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Seed default base application URL if not already present
INSERT INTO public.app_cron_config (config_key, config_value, description)
VALUES ('app_url', 'https://arth-9h3f.vercel.app', 'Base URL of Arth Next.js web application for cron worker webhooks')
ON CONFLICT (config_key) DO NOTHING;

-- Helper to retrieve configuration, checking Supabase Vault first, then app_cron_config
CREATE OR REPLACE FUNCTION public.fn_get_cron_config(
  p_key TEXT,
  p_default TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
DECLARE
  v_secret TEXT := NULL;
BEGIN
  -- 1. Attempt lookup from Supabase Vault (decrypted_secrets)
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'vault' AND tablename = 'decrypted_secrets') THEN
      SELECT decrypted_secret INTO v_secret
      FROM vault.decrypted_secrets
      WHERE name = p_key
      LIMIT 1;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_secret := NULL;
  END;

  IF v_secret IS NOT NULL AND v_secret <> '' THEN
    RETURN v_secret;
  END IF;

  -- 2. Fall back to public.app_cron_config
  BEGIN
    SELECT config_value INTO v_secret
    FROM public.app_cron_config
    WHERE config_key = p_key
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_secret := NULL;
  END;

  RETURN COALESCE(v_secret, p_default);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_get_cron_config(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_get_cron_config(TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.fn_get_cron_config(TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_cron_config(TEXT, TEXT) TO service_role;

-- ─── 4. Outbox Lease Recovery ──────────────────────────────────────────────────
-- Resets stalled/abandoned outbox event locks (e.g. from timed out or crashed workers)
CREATE OR REPLACE FUNCTION public.fn_recover_stale_outbox_events(
  p_stale_seconds INT DEFAULT 300
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_count INT := 0;
BEGIN
  WITH recovered AS (
    UPDATE public.outbox_events
    SET status = 'pending',
        locked_at = NULL,
        claim_id = NULL
    WHERE status = 'processing'
      AND locked_at < (now() - (p_stale_seconds || ' seconds')::interval)
    RETURNING id
  )
  SELECT count(*)::int INTO v_count FROM recovered;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_recover_stale_outbox_events(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_recover_stale_outbox_events(INT) TO service_role;

-- ─── 5. Manual / Scheduled Retry for Failed Outbox Events ─────────────────────
-- Resets failed events back to pending with retry_count = 0 so they can be re-evaluated
CREATE OR REPLACE FUNCTION public.fn_retry_failed_outbox_events(
  p_user_id UUID DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_count INT := 0;
BEGIN
  WITH reset_rows AS (
    UPDATE public.outbox_events
    SET status = 'pending',
        retry_count = 0,
        error_message = NULL,
        locked_at = NULL,
        claim_id = NULL
    WHERE status = 'failed'
      AND (p_user_id IS NULL OR user_id = p_user_id)
    RETURNING id
  )
  SELECT count(*)::int INTO v_count FROM reset_rows;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_retry_failed_outbox_events(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_retry_failed_outbox_events(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_retry_failed_outbox_events(UUID) TO authenticated;

-- ─── 6. Cron Worker Invocation Procedures ──────────────────────────────────────

-- 6A: Recovery & Outbox Drain Trigger (invoked every 5 minutes by pg_cron)
CREATE OR REPLACE FUNCTION public.fn_cron_trigger_outbox_sync()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_run_id UUID;
  v_recovered_count INT := 0;
  v_pending_count INT := 0;
  v_app_url TEXT;
  v_cron_secret TEXT;
  v_target_url TEXT;
  v_headers JSONB;
  v_body JSONB;
  v_has_pg_net BOOLEAN := false;
BEGIN
  -- Step 1: Recover any stale claims (> 5 minutes old)
  v_recovered_count := public.fn_recover_stale_outbox_events(300);

  -- Step 2: Check pending events count
  SELECT count(*)::int INTO v_pending_count
  FROM public.outbox_events
  WHERE status = 'pending'
    AND retry_count < 5;

  -- Step 3: Insert start record into cron_job_runs
  INSERT INTO public.cron_job_runs (job_name, status, details)
  VALUES (
    'outbox_recovery_sync',
    'started',
    jsonb_build_object(
      'recovered_stale', v_recovered_count,
      'pending_events', v_pending_count
    )
  )
  RETURNING id INTO v_run_id;

  -- If nothing pending and nothing recovered, skip HTTP dispatch to conserve resources
  IF v_pending_count = 0 AND v_recovered_count = 0 THEN
    UPDATE public.cron_job_runs
    SET status = 'skipped',
        completed_at = now(),
        details = details || jsonb_build_object('reason', 'Queue idle: zero pending outbox events')
    WHERE id = v_run_id;

    RETURN v_run_id;
  END IF;

  -- Step 4: Resolve app_url and cron_secret
  v_app_url := rtrim(public.fn_get_cron_config('app_url', 'https://arth-9h3f.vercel.app'), '/');
  v_cron_secret := public.fn_get_cron_config('cron_secret', '');

  v_target_url := v_app_url || '/api/sync/sheets';
  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-cron-source', 'supabase-cron-pg_net'
  );

  IF v_cron_secret IS NOT NULL AND v_cron_secret <> '' THEN
    v_headers := v_headers || jsonb_build_object(
      'Authorization', 'Bearer ' || v_cron_secret,
      'x-cron-secret', v_cron_secret
    );
  END IF;

  v_body := jsonb_build_object(
    'trigger', 'pg_cron',
    'run_id', v_run_id,
    'recovered_stale', v_recovered_count,
    'timestamp', now()
  );

  -- Step 5: Dispatch HTTP POST via pg_net if installed
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'net' AND p.proname = 'http_post'
  ) INTO v_has_pg_net;

  IF v_has_pg_net THEN
    BEGIN
      EXECUTE 'SELECT net.http_post(
        url := $1,
        headers := $2,
        body := $3,
        timeout_milliseconds := 25000
      )' USING v_target_url, v_headers, v_body;

      UPDATE public.cron_job_runs
      SET status = 'completed',
          completed_at = now(),
          details = details || jsonb_build_object(
            'dispatched_via', 'pg_net',
            'target_url', v_target_url
          )
      WHERE id = v_run_id;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.cron_job_runs
      SET status = 'failed',
          completed_at = now(),
          error_message = 'pg_net dispatch failed: ' || SQLERRM
      WHERE id = v_run_id;
    END;
  ELSE
    UPDATE public.cron_job_runs
    SET status = 'completed',
        completed_at = now(),
        details = details || jsonb_build_object(
          'note', 'Recovered stale events locally in DB; pg_net extension not enabled for external webhook'
        )
    WHERE id = v_run_id;
  END IF;

  RETURN v_run_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_cron_trigger_outbox_sync() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_cron_trigger_outbox_sync() TO service_role;

-- 6B: Daily Full Sheets Reconciliation Trigger (invoked daily at 03:00 IST / 21:30 UTC)
CREATE OR REPLACE FUNCTION public.fn_cron_trigger_daily_reconcile()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_run_id UUID;
  v_app_url TEXT;
  v_cron_secret TEXT;
  v_target_url TEXT;
  v_headers JSONB;
  v_body JSONB;
  v_has_pg_net BOOLEAN := false;
BEGIN
  INSERT INTO public.cron_job_runs (job_name, status, details)
  VALUES (
    'daily_sheets_reconciliation',
    'started',
    jsonb_build_object('scheduled_at', now())
  )
  RETURNING id INTO v_run_id;

  v_app_url := rtrim(public.fn_get_cron_config('app_url', 'https://arth-9h3f.vercel.app'), '/');
  v_cron_secret := public.fn_get_cron_config('cron_secret', '');

  v_target_url := v_app_url || '/api/sync/reconcile';
  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-cron-source', 'supabase-cron-pg_net'
  );

  IF v_cron_secret IS NOT NULL AND v_cron_secret <> '' THEN
    v_headers := v_headers || jsonb_build_object(
      'Authorization', 'Bearer ' || v_cron_secret,
      'x-cron-secret', v_cron_secret
    );
  END IF;

  v_body := jsonb_build_object(
    'trigger', 'pg_cron_daily',
    'run_id', v_run_id,
    'timestamp', now()
  );

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'net' AND p.proname = 'http_post'
  ) INTO v_has_pg_net;

  IF v_has_pg_net THEN
    BEGIN
      EXECUTE 'SELECT net.http_post(
        url := $1,
        headers := $2,
        body := $3,
        timeout_milliseconds := 60000
      )' USING v_target_url, v_headers, v_body;

      UPDATE public.cron_job_runs
      SET status = 'completed',
          completed_at = now(),
          details = details || jsonb_build_object(
            'dispatched_via', 'pg_net',
            'target_url', v_target_url
          )
      WHERE id = v_run_id;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.cron_job_runs
      SET status = 'failed',
          completed_at = now(),
          error_message = 'pg_net dispatch failed: ' || SQLERRM
      WHERE id = v_run_id;
    END;
  ELSE
    UPDATE public.cron_job_runs
    SET status = 'skipped',
        completed_at = now(),
        details = details || jsonb_build_object(
          'note', 'pg_net extension not enabled; daily reconciliation HTTP call skipped'
        )
    WHERE id = v_run_id;
  END IF;

  RETURN v_run_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_cron_trigger_daily_reconcile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_cron_trigger_daily_reconcile() TO service_role;

-- ─── 7. Idempotent pg_cron Schedule Registration ──────────────────────────────
-- Unschedules existing jobs first to guarantee zero duplicate jobs on repeated deployment
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    -- Unschedule outbox recovery job if already registered
    BEGIN
      PERFORM cron.unschedule('arth-outbox-recovery-sync')
      WHERE EXISTS (
        SELECT 1 FROM cron.job WHERE jobname = 'arth-outbox-recovery-sync'
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not unschedule arth-outbox-recovery-sync: %', SQLERRM;
    END;

    -- Unschedule daily reconciliation job if already registered
    BEGIN
      PERFORM cron.unschedule('arth-daily-sheets-reconcile')
      WHERE EXISTS (
        SELECT 1 FROM cron.job WHERE jobname = 'arth-daily-sheets-reconcile'
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not unschedule arth-daily-sheets-reconcile: %', SQLERRM;
    END;

    -- 1. Schedule Outbox Recovery & Drain every 5 minutes (*/5 * * * *)
    PERFORM cron.schedule(
      'arth-outbox-recovery-sync',
      '*/5 * * * *',
      'SELECT public.fn_cron_trigger_outbox_sync();'
    );

    -- 2. Schedule Daily Full Sheets Reconciliation at 03:00 IST / 21:30 UTC (30 21 * * *)
    PERFORM cron.schedule(
      'arth-daily-sheets-reconcile',
      '30 21 * * *',
      'SELECT public.fn_cron_trigger_daily_reconcile();'
    );

    RAISE NOTICE 'pg_cron schedules successfully registered for Arth.';
  ELSE
    RAISE NOTICE 'cron schema does not exist yet. Please enable pg_cron extension in Supabase dashboard to activate background schedules.';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron schedule block completed with notice: %', SQLERRM;
END $$;
