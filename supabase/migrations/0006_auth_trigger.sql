-- Migration 0006: Auth trigger for automatic profile and default category creation
-- Securely provisions new user profile & default categories upon auth.users signup

-- Function to seed predefined categories for a specific user
CREATE OR REPLACE FUNCTION public.fn_seed_default_categories(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Default expense categories
  INSERT INTO public.categories (user_id, name, type, sort_order, is_default)
  VALUES
    (p_user_id, 'Food & Dining', 'expense', 1, TRUE),
    (p_user_id, 'Transport', 'expense', 2, TRUE),
    (p_user_id, 'Housing', 'expense', 3, TRUE),
    (p_user_id, 'Utilities', 'expense', 4, TRUE),
    (p_user_id, 'Healthcare', 'expense', 5, TRUE),
    (p_user_id, 'Entertainment', 'expense', 6, TRUE),
    (p_user_id, 'Shopping', 'expense', 7, TRUE),
    (p_user_id, 'Education', 'expense', 8, TRUE),
    (p_user_id, 'Personal Care', 'expense', 9, TRUE),
    (p_user_id, 'Travel', 'expense', 10, TRUE),
    (p_user_id, 'Other Expense', 'expense', 11, TRUE)
  ON CONFLICT (user_id, type, lower(name)) WHERE archived_at IS NULL DO NOTHING;

  -- Default income categories
  INSERT INTO public.categories (user_id, name, type, sort_order, is_default)
  VALUES
    (p_user_id, 'Salary', 'income', 1, TRUE),
    (p_user_id, 'Freelance', 'income', 2, TRUE),
    (p_user_id, 'Investments', 'income', 3, TRUE),
    (p_user_id, 'Other Income', 'income', 4, TRUE)
  ON CONFLICT (user_id, type, lower(name)) WHERE archived_at IS NULL DO NOTHING;
END;
$$;

-- Auth trigger function executed on new auth.users record
CREATE OR REPLACE FUNCTION public.fn_handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_display_name TEXT;
BEGIN
  -- Extract display name from user metadata if provided
  v_display_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  -- Create profile record
  INSERT INTO public.profiles (id, display_name, timezone, currency)
  VALUES (NEW.id, v_display_name, 'Asia/Kolkata', 'INR')
  ON CONFLICT (id) DO NOTHING;

  -- Seed default categories for this user
  PERFORM public.fn_seed_default_categories(NEW.id);

  RETURN NEW;
END;
$$;

-- Attach trigger to auth.users if auth schema is present
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;
    CREATE TRIGGER trg_on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION public.fn_handle_new_user();
  END IF;
END $$;
