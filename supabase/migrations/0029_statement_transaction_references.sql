-- Add source reference data needed to reconcile imported transaction rows.
-- UUID idempotency, owner-scoped account/batch FKs and existing transaction/outbox triggers remain authoritative.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'statement_reference'
  ) THEN
    ALTER TABLE public.transactions ADD COLUMN statement_reference TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_transaction_statement_reference'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT chk_transaction_statement_reference CHECK (
        statement_reference IS NULL OR char_length(statement_reference) <= 120
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_transactions_account_reference
  ON public.transactions(user_id, account_id, statement_reference)
  WHERE statement_reference IS NOT NULL AND deleted_at IS NULL;
