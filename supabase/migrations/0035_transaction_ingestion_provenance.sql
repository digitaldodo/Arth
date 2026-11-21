-- Preserve the source and processing provenance for each authoritative ledger row.
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS ingestion_source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS parser_version TEXT,
  ADD COLUMN IF NOT EXISTS categorization_model_version TEXT,
  ADD COLUMN IF NOT EXISTS category_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS categorization_method TEXT,
  ADD COLUMN IF NOT EXISTS category_suggestion_confidence REAL,
  ADD COLUMN IF NOT EXISTS category_evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS category_was_corrected BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_transactions_ingestion_source'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT chk_transactions_ingestion_source
      CHECK (ingestion_source IN ('manual', 'bank_statement', 'message', 'account_aggregator'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_transactions_categorization_method'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT chk_transactions_categorization_method
      CHECK (categorization_method IS NULL OR categorization_method IN ('weak_supervision', 'anchored_fasttext', 'user_correction', 'manual', 'none'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_transactions_category_confidence'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT chk_transactions_category_confidence
      CHECK (category_suggestion_confidence IS NULL OR (category_suggestion_confidence >= 0 AND category_suggestion_confidence <= 1));
  END IF;
END $$;

COMMENT ON COLUMN public.transactions.ingestion_source IS 'Original acquisition channel; raw source documents/messages are not stored here.';
COMMENT ON COLUMN public.transactions.category_verified IS 'True when a user explicitly selected or confirmed the persisted category.';
COMMENT ON COLUMN public.transactions.category_evidence IS 'Compact, non-raw-text evidence explaining the category suggestion.';
