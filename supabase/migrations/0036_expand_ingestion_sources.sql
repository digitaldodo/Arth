-- Migration 0036: Expand transaction ingestion sources to support granular native acquisition channels
-- (manual, bank_statement, sms, notification, message_share, message, account_aggregator)

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS chk_transactions_ingestion_source;

ALTER TABLE public.transactions
  ADD CONSTRAINT chk_transactions_ingestion_source
  CHECK (ingestion_source IN ('manual', 'bank_statement', 'sms', 'notification', 'message_share', 'message', 'account_aggregator'));

COMMENT ON CONSTRAINT chk_transactions_ingestion_source ON public.transactions
  IS 'Enforces valid ingestion source identifiers across web, Android SMS, notification capture, statement import, and manual entry.';
