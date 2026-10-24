-- Migration 0003: Create transactions table
-- Schema: public.transactions enforcing integer paise and relational constraints

-- Create enums if not exists
DO $$ BEGIN
  CREATE TYPE public.payment_method AS ENUM ('online', 'cash');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.necessity_class AS ENUM ('essential', 'optional', 'luxury');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Transactions table
CREATE TABLE IF NOT EXISTS public.transactions (
  id                 UUID PRIMARY KEY, -- Client-generated UUID v7
  user_id            UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_paise       BIGINT NOT NULL CHECK (amount_paise > 0),
  type               public.transaction_type NOT NULL,
  category_id        UUID NOT NULL,
  transaction_date   DATE NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date,
  payment_method     public.payment_method NOT NULL,
  necessity          public.necessity_class,
  description        TEXT,
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ, -- Reversible soft deletion
  sheets_synced_at   TIMESTAMPTZ, -- Outbox synchronization marker

  -- Relational integrity constraint: category MUST belong to the same user and match transaction type
  CONSTRAINT fk_transactions_category_user_type
    FOREIGN KEY (category_id, user_id, type)
    REFERENCES public.categories(id, user_id, type)
    ON DELETE RESTRICT,

  -- Necessity constraint: required for expense, strictly NULL for income
  CONSTRAINT chk_transactions_necessity CHECK (
    (type = 'expense' AND necessity IS NOT NULL) OR
    (type = 'income' AND necessity IS NULL)
  )
);

COMMENT ON TABLE public.transactions IS 'Authoritative transaction ledger storing monetary amounts as integer paise.';

-- Trigger to maintain updated_at on transactions
CREATE OR REPLACE TRIGGER trg_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_updated_at();
