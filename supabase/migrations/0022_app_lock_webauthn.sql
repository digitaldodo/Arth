-- App Lock WebAuthn credentials and short-lived, single-use ceremony challenges.
-- These tables are accessed only by authenticated Next.js server handlers using
-- the service role after validating the caller's Supabase Auth session.

CREATE TABLE public.app_lock_credentials (
  credential_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id UUID NOT NULL,
  public_key TEXT NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0 CHECK (counter >= 0),
  transports TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_id)
);

CREATE INDEX app_lock_credentials_user_device_idx
  ON public.app_lock_credentials (user_id, device_id);

CREATE TABLE public.app_lock_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id UUID NOT NULL,
  ceremony TEXT NOT NULL CHECK (ceremony IN ('registration', 'authentication')),
  challenge TEXT,
  consumed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX app_lock_challenges_user_device_created_idx
  ON public.app_lock_challenges (user_id, device_id, created_at DESC);

CREATE UNIQUE INDEX app_lock_challenges_one_pending_ceremony_idx
  ON public.app_lock_challenges (user_id, device_id, ceremony)
  WHERE consumed_at IS NULL;

ALTER TABLE public.app_lock_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_lock_challenges ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.app_lock_credentials FROM anon, authenticated;
REVOKE ALL ON public.app_lock_challenges FROM anon, authenticated;
GRANT ALL ON public.app_lock_credentials TO service_role;
GRANT ALL ON public.app_lock_challenges TO service_role;
