-- Migration 0005: Configure Row-Level Security (RLS) and Grants
-- Principle: Principle of least privilege. RLS enforced on all user-owned tables.

-- Enable Row-Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbox_events ENABLE ROW LEVEL SECURITY;

-- 1. Profiles Policies
CREATE POLICY "profiles_select_own"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- 2. Categories Policies
CREATE POLICY "categories_select_own"
  ON public.categories
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "categories_insert_own"
  ON public.categories
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "categories_update_own"
  ON public.categories
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "categories_delete_own"
  ON public.categories
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- 3. Transactions Policies
CREATE POLICY "transactions_select_own"
  ON public.transactions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "transactions_insert_own"
  ON public.transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "transactions_update_own"
  ON public.transactions
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "transactions_delete_own"
  ON public.transactions
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- 4. Outbox Events Policies
-- Normal authenticated users have ZERO direct access to outbox_events.
-- Privileged background worker runs with service_role which bypasses RLS.
-- No permissive policy is added for authenticated or anon roles.

-- 5. Database Grants
REVOKE ALL ON SCHEMA public FROM public;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Grant authenticated permissions on domain tables
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;

-- Grant service_role full access for background workers
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;
