-- Migration 0023: Fix profiles starting balances columns and schema cache
-- Resolves: "Could not find the 'balances_configured' column of 'profiles' in the schema cache"

-- 1. Ensure starting balance and configuration columns exist on public.profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS starting_cash_paise BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS starting_online_paise BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balances_configured BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS balances_configured_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.starting_cash_paise IS 'Initial cash balance in integer paise (1 INR = 100 paise).';
COMMENT ON COLUMN public.profiles.starting_online_paise IS 'Initial online balance in integer paise (1 INR = 100 paise).';
COMMENT ON COLUMN public.profiles.balances_configured IS 'Flag indicating if the user has explicitly configured starting balances.';
COMMENT ON COLUMN public.profiles.balances_configured_at IS 'Timestamp when starting balances were first configured.';

-- 2. Backfill balances_configured for existing accounts that have starting balances recorded
UPDATE public.profiles
SET
  balances_configured = TRUE,
  balances_configured_at = COALESCE(balances_configured_at, now())
WHERE
  balances_configured IS FALSE
  AND (starting_cash_paise <> 0 OR starting_online_paise <> 0);

-- 3. Dedicated atomic database procedure for configuring starting balances
-- Guarantees atomic update and immediate balance re-calculation in one roundtrip
CREATE OR REPLACE FUNCTION public.fn_configure_starting_balances(
  p_starting_cash_paise BIGINT,
  p_starting_online_paise BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF p_starting_cash_paise < 0 OR p_starting_online_paise < 0 THEN
    RAISE EXCEPTION 'Starting balances cannot be negative' USING ERRCODE = '22003';
  END IF;

  UPDATE public.profiles
  SET
    starting_cash_paise = p_starting_cash_paise,
    starting_online_paise = p_starting_online_paise,
    balances_configured = TRUE,
    balances_configured_at = COALESCE(balances_configured_at, now()),
    updated_at = now()
  WHERE id = v_user_id;

  RETURN public.fn_account_balances();
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_configure_starting_balances(BIGINT, BIGINT) TO authenticated;

-- 4. Signal PostgREST to reload its schema cache immediately
NOTIFY pgrst, 'reload schema';
