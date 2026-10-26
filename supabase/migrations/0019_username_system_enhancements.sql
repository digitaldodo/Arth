-- Migration 0019: Username System Enhancements, Auto-generation, Reusable Handles, NOT NULL constraint, and Reserved Names Protection
-- Schema: public.profiles, auth triggers, unique auto-generation, availability check, and self-service username updates

-- 1. Deduplicate legacy usernames and backfill any NULL or invalid usernames with unique generated usernames
DO $$
DECLARE
  r RECORD;
  v_candidate TEXT;
  v_num INT;
  v_attempts INT;
BEGIN
  -- Normalize any existing uppercase characters to lowercase
  UPDATE public.profiles
  SET username = LOWER(username)
  WHERE username IS NOT NULL AND username <> LOWER(username);

  -- Resolve duplicate usernames if any existed prior to strict constraint
  FOR r IN (
    SELECT id, username, ROW_NUMBER() OVER (PARTITION BY LOWER(username) ORDER BY created_at ASC) as rn
    FROM public.profiles
    WHERE username IS NOT NULL
  ) LOOP
    IF r.rn > 1 THEN
      v_attempts := 0;
      LOOP
        v_attempts := v_attempts + 1;
        v_num := floor(random() * 90000 + 10000)::INT;
        v_candidate := 'arth_user_' || v_num::TEXT;
        IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE LOWER(username) = v_candidate) THEN
          UPDATE public.profiles SET username = v_candidate, updated_at = now() WHERE id = r.id;
          EXIT;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  -- Backfill any NULL, invalid format, or reserved usernames
  FOR r IN (
    SELECT id FROM public.profiles
    WHERE username IS NULL
       OR NOT (username ~ '^[a-z0-9_]{3,20}$')
       OR username IN ('admin', 'administrator', 'support', 'system', 'arth', 'root', 'superuser', 'help', 'api', 'auth', 'null', 'undefined', 'moderator', 'staff')
  ) LOOP
    v_attempts := 0;
    LOOP
      v_attempts := v_attempts + 1;
      v_num := floor(random() * 90000 + 10000)::INT;
      v_candidate := 'arth_user_' || v_num::TEXT;
      IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE LOWER(username) = v_candidate) THEN
        UPDATE public.profiles SET username = v_candidate, updated_at = now() WHERE id = r.id;
        EXIT;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- 2. Enforce NOT NULL on username
ALTER TABLE public.profiles
  ALTER COLUMN username SET NOT NULL;

-- 3. Replace format check constraint with strict 3-20 lowercase alphanumeric + underscore, non-reserved check
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS chk_profiles_username_format;

ALTER TABLE public.profiles
  ADD CONSTRAINT chk_profiles_username_format
  CHECK (
    username ~ '^[a-z0-9_]{3,20}$'
    AND username = LOWER(username)
    AND username NOT IN ('admin', 'administrator', 'support', 'system', 'arth', 'root', 'superuser', 'help', 'api', 'auth', 'null', 'undefined', 'moderator', 'staff')
  );

-- 4. Case-insensitive unique index
CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_lower_username
  ON public.profiles (LOWER(username));

-- 5. Helper function for unique random username generation (e.g. arth_user_58321)
CREATE OR REPLACE FUNCTION public.fn_generate_unique_username()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_candidate TEXT;
  v_num INT;
  v_attempts INT := 0;
BEGIN
  LOOP
    v_attempts := v_attempts + 1;
    -- Generate 5-digit random number (10000 to 99999)
    v_num := floor(random() * 90000 + 10000)::INT;
    v_candidate := 'arth_user_' || v_num::TEXT;

    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE LOWER(username) = v_candidate) THEN
      RETURN v_candidate;
    END IF;

    -- Safeguard for extreme collision scenarios
    IF v_attempts >= 50 THEN
      v_candidate := 'arth_user_' || floor(random() * 90000000 + 10000000)::INT::TEXT;
      RETURN v_candidate;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_generate_unique_username() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_generate_unique_username() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_generate_unique_username() TO service_role;

-- 6. Updated public check function for username availability (rejects reserved names and invalid formats)
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

-- 7. Updated self-service username assignment function (releases previous handle immediately, enforces rules)
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
  IF v_clean_username IS NULL OR NOT (v_clean_username ~ '^[a-z0-9_]{3,20}$') THEN
    RAISE EXCEPTION 'Invalid username format: must be 3-20 characters, lowercase letters, numbers, and underscores' USING ERRCODE = '22023';
  END IF;

  IF v_clean_username IN ('admin', 'administrator', 'support', 'system', 'arth', 'root', 'superuser', 'help', 'api', 'auth', 'null', 'undefined', 'moderator', 'staff') THEN
    RAISE EXCEPTION 'Username is reserved' USING ERRCODE = '22023';
  END IF;

  -- Check if another user already has this username
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE LOWER(username) = v_clean_username AND id != v_user_id
  ) THEN
    RAISE EXCEPTION 'Username already taken' USING ERRCODE = '23505';
  END IF;

  -- Updating profile immediately frees up the previous username for other users
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

-- 8. Updated auth trigger to auto-generate unique username if not provided or unavailable
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
    IF v_clean_username ~ '^[a-z0-9_]{3,20}$'
       AND v_clean_username NOT IN ('admin', 'administrator', 'support', 'system', 'arth', 'root', 'superuser', 'help', 'api', 'auth', 'null', 'undefined', 'moderator', 'staff')
       AND NOT EXISTS (
         SELECT 1 FROM public.profiles WHERE LOWER(username) = v_clean_username AND id != NEW.id
       ) THEN
      v_username := v_clean_username;
    END IF;
  END IF;

  -- If not provided, invalid, reserved, or already taken, auto-generate unique candidate
  IF v_username IS NULL THEN
    v_username := public.fn_generate_unique_username();
  END IF;

  -- Extract display name from user metadata
  v_display_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
    v_username
  );

  -- Create or update profile record (guaranteed NOT NULL username)
  INSERT INTO public.profiles (id, username, display_name, timezone, currency)
  VALUES (NEW.id, v_username, v_display_name, 'Asia/Kolkata', 'INR')
  ON CONFLICT (id) DO UPDATE
    SET username = COALESCE(public.profiles.username, EXCLUDED.username, public.fn_generate_unique_username()),
        display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name),
        updated_at = now();

  -- Seed default categories for this user
  PERFORM public.fn_seed_default_categories(NEW.id);

  RETURN NEW;
END;
$$;
