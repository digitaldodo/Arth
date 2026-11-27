-- Migration 0040: SpendSense Master Admin Portal & Operations Telemetry Schema
-- Strictly append-only migration. Preserves all user financial RLS policies untouched.

-- 1. Administrator Memberships (Strict 5-member allowlist, single initial OWNER_ADMIN)
CREATE TABLE IF NOT EXISTS public.admin_memberships (
  admin_id                  TEXT PRIMARY KEY,
  full_name                 TEXT NOT NULL,
  username                  TEXT NOT NULL,
  role                      TEXT NOT NULL CHECK (role IN ('OWNER_ADMIN', 'OPERATIONS_ADMIN', 'SUPPORT_ADMIN')),
  is_owner                  BOOLEAN NOT NULL DEFAULT FALSE,
  status                    TEXT NOT NULL CHECK (status IN ('PENDING_ACTIVATION', 'ENABLED', 'DISABLED')),
  activation_state          TEXT NOT NULL CHECK (
    activation_state IN (
      'PENDING_EMAIL',
      'PENDING_EMAIL_VERIFICATION',
      'AWAITING_OWNER_APPROVAL',
      'AWAITING_PASSWORD_SETUP',
      'ACTIVE'
    )
  ),
  supabase_user_id          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_email            TEXT,
  pending_email             TEXT,
  pending_email_verified    BOOLEAN NOT NULL DEFAULT FALSE,
  temp_credential_hash      TEXT,
  temp_credential_invalidated BOOLEAN NOT NULL DEFAULT FALSE,
  permanent_password_hash   TEXT,
  session_version           INTEGER NOT NULL DEFAULT 1,
  last_login_at             TIMESTAMPTZ,
  last_seen_at              TIMESTAMPTZ,
  disabled_at               TIMESTAMPTZ,
  disabled_reason           TEXT,
  disabled_by               TEXT REFERENCES public.admin_memberships(admin_id),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_memberships_username_lower
  ON public.admin_memberships (LOWER(username));

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_memberships_verified_email_lower
  ON public.admin_memberships (LOWER(verified_email))
  WHERE verified_email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_memberships_single_owner
  ON public.admin_memberships (is_owner)
  WHERE is_owner = TRUE;

CREATE OR REPLACE TRIGGER trg_admin_memberships_updated_at
  BEFORE UPDATE ON public.admin_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_updated_at();

-- 2. Revocable Administrative Sessions
CREATE TABLE IF NOT EXISTS public.admin_sessions (
  session_id      TEXT PRIMARY KEY,
  admin_id        TEXT NOT NULL REFERENCES public.admin_memberships(admin_id) ON DELETE CASCADE,
  session_version INTEGER NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_active
  ON public.admin_sessions (admin_id, expires_at)
  WHERE revoked_at IS NULL;

-- 3. Single-Use Expiring Verification & Recovery Tokens (Hashed Only)
CREATE TABLE IF NOT EXISTS public.admin_tokens (
  token_hash   TEXT PRIMARY KEY,
  admin_id     TEXT NOT NULL REFERENCES public.admin_memberships(admin_id) ON DELETE CASCADE,
  purpose      TEXT NOT NULL CHECK (purpose IN ('EMAIL_VERIFY', 'PASSWORD_RESET')),
  target_email TEXT NOT NULL,
  code_hash    TEXT,
  expires_at   TIMESTAMPTZ NOT NULL,
  consumed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_tokens_admin_purpose
  ON public.admin_tokens (admin_id, purpose, expires_at);

-- 4. Append-Only Administrative Audit Log
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_admin_id TEXT REFERENCES public.admin_memberships(admin_id) ON DELETE SET NULL,
  actor_username TEXT,
  actor_role     TEXT,
  action         TEXT NOT NULL,
  target_id      TEXT,
  result         TEXT NOT NULL CHECK (result IN ('SUCCESS', 'DENIED', 'FAILED')),
  reason         TEXT,
  metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at
  ON public.admin_audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_target_id
  ON public.admin_audit_logs (target_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.fn_admin_audit_logs_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_logs is append-only; updates and deletes are forbidden';
END;
$$;

CREATE OR REPLACE TRIGGER trg_admin_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON public.admin_audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_admin_audit_logs_immutable();

-- 5. Aggregated Operational Telemetry (Zero PII or Raw Financial Content)
CREATE TABLE IF NOT EXISTS public.operational_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type  TEXT NOT NULL,
  channel     TEXT,
  status      TEXT NOT NULL CHECK (status IN ('success', 'warning', 'error')),
  app_version TEXT,
  parser_version TEXT,
  platform    TEXT,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_operational_events_created_at
  ON public.operational_events (created_at DESC);

CREATE TABLE IF NOT EXISTS public.operational_daily_metrics (
  metric_date          DATE PRIMARY KEY,
  registered_users     INTEGER NOT NULL DEFAULT 0,
  active_users         INTEGER NOT NULL DEFAULT 0,
  web_users            INTEGER NOT NULL DEFAULT 0,
  android_users        INTEGER NOT NULL DEFAULT 0,
  capture_events       INTEGER NOT NULL DEFAULT 0,
  candidates_generated INTEGER NOT NULL DEFAULT 0,
  candidates_accepted  INTEGER NOT NULL DEFAULT 0,
  candidates_rejected  INTEGER NOT NULL DEFAULT 0,
  duplicate_detections INTEGER NOT NULL DEFAULT 0,
  parser_failures      INTEGER NOT NULL DEFAULT 0,
  sync_failures        INTEGER NOT NULL DEFAULT 0,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Strict RLS Lockdown (No anon or normal authenticated access; backend service_role only)
ALTER TABLE public.admin_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_daily_metrics ENABLE ROW LEVEL SECURITY;
