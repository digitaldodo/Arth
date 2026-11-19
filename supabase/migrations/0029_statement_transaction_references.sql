-- Add source reference data needed to reconcile imported transaction rows.
-- UUID idempotency, owner-scoped account/batch FKs and existing transaction/outbox triggers remain authoritative.

ALTER TABLE public.transactions
  ADD COLUMN statement_reference TEXT,
  ADD CONSTRAINT chk_transaction_statement_reference CHECK (
    statement_reference IS NULL OR char_length(statement_reference) <= 120
  );

CREATE INDEX idx_transactions_account_reference
  ON public.transactions(user_id, account_id, statement_reference)
  WHERE statement_reference IS NOT NULL AND deleted_at IS NULL;
