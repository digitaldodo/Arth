-- Migration 0033: retain privacy-minimized row-level skip reasons for statement import recovery.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'statement_import_batches' AND column_name = 'skipped_rows'
  ) THEN
    ALTER TABLE public.statement_import_batches
      ADD COLUMN skipped_rows JSONB NOT NULL DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_statement_skipped_rows_array'
  ) THEN
    ALTER TABLE public.statement_import_batches
      ADD CONSTRAINT chk_statement_skipped_rows_array CHECK (jsonb_typeof(skipped_rows) = 'array');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
