-- Migration 0016: Secure Account Deletion Stored Procedure
-- Provides atomic, reverse-dependency data purging for right-to-be-forgotten / user account deletion.
-- Executes with SECURITY DEFINER to cleanly remove child records across public schema tables:
--   1. person_money_settlements (references records with ON DELETE RESTRICT)
--   2. person_money_records (references people with ON DELETE RESTRICT)
--   3. people
--   4. transactions (references categories with ON DELETE RESTRICT)
--   5. categories
--   6. outbox_events
--   7. profiles
-- Strictly isolated to caller context via auth.uid().
-- Granted exclusively to authenticated users.

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

  -- 1. Delete person settlements (child of person_money_records)
  DELETE FROM public.person_money_settlements WHERE user_id = v_user_id;

  -- 2. Delete person money records (child of people)
  DELETE FROM public.person_money_records WHERE user_id = v_user_id;

  -- 3. Delete people
  DELETE FROM public.people WHERE user_id = v_user_id;

  -- 4. Delete transactions (child of categories)
  DELETE FROM public.transactions WHERE user_id = v_user_id;

  -- 5. Delete categories
  DELETE FROM public.categories WHERE user_id = v_user_id;

  -- 6. Delete outbox events
  DELETE FROM public.outbox_events WHERE user_id = v_user_id;

  -- 7. Delete profile
  DELETE FROM public.profiles WHERE id = v_user_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_delete_own_account() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_delete_own_account() FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_delete_own_account() TO authenticated;
