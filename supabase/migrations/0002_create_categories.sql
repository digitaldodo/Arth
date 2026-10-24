-- Migration 0002: Create categories table and taxonomy
-- Schema: public.categories linked to public.profiles

-- Create transaction_type enum if not exists
DO $$ BEGIN
  CREATE TYPE public.transaction_type AS ENUM ('income', 'expense');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Categories table: user-owned categories with income/expense separation
CREATE TABLE IF NOT EXISTS public.categories (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  type         public.transaction_type NOT NULL,
  icon         TEXT,
  color        TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  is_default   BOOLEAN NOT NULL DEFAULT FALSE,
  archived_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Composite unique constraint used for relational integrity enforcement in transactions
  CONSTRAINT uq_categories_id_user_type UNIQUE (id, user_id, type)
);

COMMENT ON TABLE public.categories IS 'Taxonomy categories for user transactions with soft-archiving support.';

-- Case-insensitive unique category name per user and type for active categories
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_user_type_name_active
  ON public.categories (user_id, type, lower(name))
  WHERE archived_at IS NULL;

-- Trigger to maintain updated_at on categories
CREATE OR REPLACE TRIGGER trg_categories_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_updated_at();
