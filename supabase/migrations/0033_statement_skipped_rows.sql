-- Migration 0033: retain privacy-minimized row-level skip reasons for statement import recovery.
ALTER TABLE public.statement_import_batches
  ADD COLUMN skipped_rows JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD CONSTRAINT chk_statement_skipped_rows_array CHECK (jsonb_typeof(skipped_rows) = 'array');

NOTIFY pgrst, 'reload schema';
