-- Migration 0014: Username authentication, case-insensitive uniqueness, and secure server lookup
-- Schema: public.profiles, auth triggers, and service-role lookup function

-- 1. Ensure username column exists in public.profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username TEXT;

COMMENT ON COLUMN public.profiles.username IS 'Globally unique, case-insensitive user handle (3-30 chars, alphanumeric/underscore/hyphen).';

-- 2. Format check constraint for usernames
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_profiles_username_format'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT chk_profiles_username_format
      CHECK (username IS NULL OR (username ~ '^[a-zA-Z0-9_-]{3,30}$' AND username = LOWER(username)));
  END IF;
END $$;

-- 3. Case-insensitive unique index on public.profiles(LOWER(username))
-- Filter: WHERE username IS NOT NULL to allow existing users without usernames
CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_lower_username
  ON public.profiles (LOWER(username))
  WHERE username IS NOT NULL;

-- 4. Update auth hook trigger function to populate normalized username from metadata
CREATE OR REPLACE FUNCTION public.fn_handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_raw_username TEXT;
  v_username TEXT;
  v_display_name TEXT;
BEGIN
  -- Extract raw username from metadata and normalize
  v_raw_username := NULLIF(TRIM(NEW.raw_user_meta_data->>'username'), '');
  IF v_raw_username IS NOT NULL AND v_raw_username ~ '^[a-zA-Z0-9_-]{3,30}$' THEN
    v_username := LOWER(v_raw_username);
    -- Check if username is already claimed by another user
    IF EXISTS (
      SELECT 1 FROM public.profiles
      WHERE LOWER(username) = v_username AND id != NEW.id
    ) THEN
      v_username := NULL; -- Prevent collision; user can set a unique username later
    END IF;
  ELSE
    v_username := NULL;
  END IF;

  -- Extract display name from user metadata (prioritizes username, then full_name, then name, then email prefix)
  v_display_name := COALESCE(
    v_raw_username,
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
    split_part(NEW.email, '@', 1)
  );

  -- Create or update profile record
  INSERT INTO public.profiles (id, username, display_name, timezone, currency)
  VALUES (NEW.id, v_username, v_display_name, 'Asia/Kolkata', 'INR')
  ON CONFLICT (id) DO UPDATE
    SET username = COALESCE(public.profiles.username, EXCLUDED.username),
        display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name),
        updated_at = now();

  -- Seed default categories for this user
  PERFORM public.fn_seed_default_categories(NEW.id);

  RETURN NEW;
END;
$$;

-- 5. Secure server-only lookup function to resolve a username to account email
-- Strictly restricted to service_role to protect user privacy and prevent enumeration via PostgREST
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

  -- 1. Primary lookup: public.profiles.username joined with auth.users
  SELECT u.email INTO v_email
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE LOWER(p.username) = v_clean_username
  LIMIT 1;

  -- 2. Fallback: check raw_user_meta_data->>'username' for any accounts where profile sync was pending
  IF v_email IS NULL THEN
    SELECT u.email INTO v_email
    FROM auth.users u
    WHERE LOWER(TRIM(u.raw_user_meta_data->>'username')) = v_clean_username
    LIMIT 1;
  END IF;

  RETURN v_email;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_get_email_by_username(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_get_email_by_username(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.fn_get_email_by_username(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_email_by_username(TEXT) TO service_role;

-- 6. Safe public check function for username availability (returns boolean only)
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
  IF v_clean_username IS NULL OR NOT (v_clean_username ~ '^[a-zA-Z0-9_-]{3,30}$') THEN
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

-- 7. Authenticated self-service username assignment function
CREATE OR REPLACE FUNCTION public.fn_set_own_username(p_username TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_clean_username TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_clean_username := LOWER(TRIM(p_username));
  IF v_clean_username IS NULL OR NOT (v_clean_username ~ '^[a-zA-Z0-9_-]{3,30}$') THEN
    RAISE EXCEPTION 'Invalid username format: must be 3-30 characters alphanumeric, underscore, or hyphen';
  END IF;

  -- Check if another user already has this username
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE LOWER(username) = v_clean_username AND id != v_user_id
  ) THEN
    RAISE EXCEPTION 'Username already taken' USING ERRCODE = '23505';
  END IF;

  UPDATE public.profiles
  SET username = v_clean_username,
      updated_at = now()
  WHERE id = v_user_id;

  -- Sync user metadata in auth.users
  UPDATE auth.users
  SET raw_user_meta_data = jsonb_set(
    COALESCE(raw_user_meta_data, '{}'::jsonb),
    '{username}',
    to_jsonb(v_clean_username)
  )
  WHERE id = v_user_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_set_own_username(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_set_own_username(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_set_own_username(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_set_own_username(TEXT) TO service_role;
