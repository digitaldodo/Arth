-- Migration 0034: Strict Database-Level Username Uniqueness, Fail-Closed Registration, and Identity Integrity
-- Enforces canonical case-insensitive username uniqueness, prevents occupied username acquisition,
-- and hardens server-side identity resolution.

-- 1. Ensure unique index on LOWER(username) is authoritatively enforced
CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_lower_username
  ON public.profiles (LOWER(username));

-- 2. Hardened trigger function on auth.users: FAIL CLOSED when requested username is already taken
CREATE OR REPLACE FUNCTION public.fn_handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_raw_username TEXT;
  v_clean_username TEXT;
  v_username TEXT;
  v_display_name TEXT;
BEGIN
  -- Extract raw username from metadata
  v_raw_username := NULLIF(TRIM(NEW.raw_user_meta_data->>'username'), '');

  IF v_raw_username IS NOT NULL THEN
    v_clean_username := LOWER(v_raw_username);

    -- Format validation (3-20 chars, lowercase alphanumeric and underscore)
    IF NOT (v_clean_username ~ '^[a-z0-9_]{3,20}$') THEN
      RAISE EXCEPTION 'Username must be between 3 and 20 characters and contain only letters, numbers, and underscores.'
        USING ERRCODE = '22023';
    END IF;

    -- Reserved username check
    IF v_clean_username IN ('admin', 'administrator', 'support', 'system', 'arth', 'root', 'superuser', 'help', 'api', 'auth', 'null', 'undefined', 'moderator', 'staff') THEN
      RAISE EXCEPTION 'This username is reserved. Please choose another username.'
        USING ERRCODE = '22023';
    END IF;

    -- Strict uniqueness check: fail closed if already registered by any user
    IF EXISTS (
      SELECT 1 FROM public.profiles
      WHERE LOWER(username) = v_clean_username AND id != NEW.id
    ) THEN
      RAISE EXCEPTION 'This username is already taken. Please choose another.'
        USING ERRCODE = '23505';
    END IF;

    v_username := v_clean_username;
  ELSE
    -- For users without a requested handle (e.g. Google OAuth sign-in), auto-generate a unique handle
    v_username := public.fn_generate_unique_username();
  END IF;

  -- Extract display name from user metadata
  v_display_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
    v_username
  );

  -- Create or safely update profile record (guaranteed NOT NULL username)
  INSERT INTO public.profiles (id, username, display_name, timezone, currency)
  VALUES (NEW.id, v_username, v_display_name, 'Asia/Kolkata', 'INR')
  ON CONFLICT (id) DO UPDATE
    SET display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name),
        updated_at = now();

  -- Seed default categories for this user
  PERFORM public.fn_seed_default_categories(NEW.id);

  RETURN NEW;
END;
$$;

-- 3. Hardened public username availability check: canonical lowercase, trimmed, rejecting reserved handles
CREATE OR REPLACE FUNCTION public.fn_check_username_available(p_username TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_clean_username TEXT;
BEGIN
  v_clean_username := LOWER(TRIM(p_username));
  IF v_clean_username IS NULL OR NOT (v_clean_username ~ '^[a-z0-9_]{3,20}$') THEN
    RETURN FALSE;
  END IF;

  -- Disallow reserved system handles
  IF v_clean_username IN ('admin', 'administrator', 'support', 'system', 'arth', 'root', 'superuser', 'help', 'api', 'auth', 'null', 'undefined', 'moderator', 'staff') THEN
    RETURN FALSE;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE LOWER(username) = v_clean_username
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_check_username_available(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_check_username_available(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_check_username_available(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_check_username_available(TEXT) TO service_role;

-- 4. Hardened identity resolution: strictly resolves from public.profiles, preventing cross-user metadata spoofing
CREATE OR REPLACE FUNCTION public.fn_get_email_by_username(p_username TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_clean_username TEXT;
  v_email TEXT;
BEGIN
  v_clean_username := LOWER(TRIM(p_username));
  IF v_clean_username IS NULL OR v_clean_username = '' THEN
    RETURN NULL;
  END IF;

  -- Authoritative resolution: matches verified public.profiles handle joined to auth.users
  SELECT u.email INTO v_email
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE LOWER(p.username) = v_clean_username
  LIMIT 1;

  RETURN v_email;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_get_email_by_username(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_get_email_by_username(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.fn_get_email_by_username(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_email_by_username(TEXT) TO service_role;

-- 5. Safe, idempotent profile repair procedure for existing authenticated users
CREATE OR REPLACE FUNCTION public.fn_recover_user_profile(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user auth.users%ROWTYPE;
  v_existing_profile public.profiles%ROWTYPE;
  v_candidate_username TEXT;
  v_display_name TEXT;
BEGIN
  -- Verify calling context: authenticated user can only recover their own profile, service_role can recover any
  IF auth.role() <> 'service_role' AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_user FROM auth.users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  SELECT * INTO v_existing_profile FROM public.profiles WHERE id = p_user_id;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'repaired', false,
      'user_id', v_existing_profile.id,
      'username', v_existing_profile.username,
      'display_name', v_existing_profile.display_name
    );
  END IF;

  -- Profile is missing: safely reconstruct it
  v_candidate_username := LOWER(NULLIF(TRIM(v_user.raw_user_meta_data->>'username'), ''));
  IF v_candidate_username IS NULL
     OR NOT (v_candidate_username ~ '^[a-z0-9_]{3,20}$')
     OR EXISTS (SELECT 1 FROM public.profiles WHERE LOWER(username) = v_candidate_username) THEN
    v_candidate_username := public.fn_generate_unique_username();
  END IF;

  v_display_name := COALESCE(
    NULLIF(TRIM(v_user.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(v_user.raw_user_meta_data->>'name'), ''),
    v_candidate_username
  );

  INSERT INTO public.profiles (id, username, display_name, timezone, currency)
  VALUES (p_user_id, v_candidate_username, v_display_name, 'Asia/Kolkata', 'INR');

  PERFORM public.fn_seed_default_categories(p_user_id);

  RETURN jsonb_build_object(
    'success', true,
    'repaired', true,
    'user_id', p_user_id,
    'username', v_candidate_username,
    'display_name', v_display_name
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_recover_user_profile(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_recover_user_profile(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_recover_user_profile(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_recover_user_profile(UUID) TO service_role;
