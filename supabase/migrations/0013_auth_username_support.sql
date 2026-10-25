-- Migration 0013: Auth trigger username support
-- Prioritizes username from user metadata as display_name in public.profiles

CREATE OR REPLACE FUNCTION public.fn_handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_display_name TEXT;
BEGIN
  -- Extract display name from user metadata (prioritizes username, then full_name, then name, then email prefix)
  v_display_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'username'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
    split_part(NEW.email, '@', 1)
  );

  -- Create or update profile record
  INSERT INTO public.profiles (id, display_name, timezone, currency)
  VALUES (NEW.id, v_display_name, 'Asia/Kolkata', 'INR')
  ON CONFLICT (id) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        updated_at = now();

  -- Seed default categories for this user
  PERFORM public.fn_seed_default_categories(NEW.id);

  RETURN NEW;
END;
$$;
