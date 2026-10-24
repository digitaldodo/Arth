-- Migration 0004: Create durable transactional outbox and trigger
-- Schema: public.outbox_events for reliable asynchronous Google Sheets synchronization

DO $$ BEGIN
  CREATE TYPE public.outbox_status AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.outbox_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  entity_type      TEXT NOT NULL DEFAULT 'transaction',
  entity_id        UUID NOT NULL,
  event_type       TEXT NOT NULL,
  payload          JSONB NOT NULL,
  status           public.outbox_status NOT NULL DEFAULT 'pending',
  retry_count      INTEGER NOT NULL DEFAULT 0,
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at     TIMESTAMPTZ,

  CONSTRAINT chk_outbox_event_type CHECK (
    event_type IN ('transaction.created', 'transaction.updated', 'transaction.deleted', 'transaction.restored')
  )
);

COMMENT ON TABLE public.outbox_events IS 'Durable transactional outbox for near-real-time Google Sheets reconciliation.';

-- Trigger function to atomically record outbox events on transaction mutation
CREATE OR REPLACE FUNCTION public.fn_transactions_outbox_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_event_type TEXT;
  v_payload JSONB;
BEGIN
  IF (TG_OP = 'INSERT') THEN
    v_event_type := 'transaction.created';
    v_payload := jsonb_build_object(
      'id', NEW.id,
      'user_id', NEW.user_id,
      'amount_paise', NEW.amount_paise,
      'type', NEW.type,
      'category_id', NEW.category_id,
      'transaction_date', NEW.transaction_date,
      'payment_method', NEW.payment_method,
      'necessity', NEW.necessity,
      'description', NEW.description,
      'notes', NEW.notes,
      'created_at', NEW.created_at,
      'deleted_at', NEW.deleted_at
    );

    INSERT INTO public.outbox_events (
      user_id,
      entity_type,
      entity_id,
      event_type,
      payload
    ) VALUES (
      NEW.user_id,
      'transaction',
      NEW.id,
      v_event_type,
      v_payload
    );

  ELSIF (TG_OP = 'UPDATE') THEN
    -- Detect soft-deletion vs restoration vs regular update
    IF (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL) THEN
      v_event_type := 'transaction.deleted';
    ELSIF (OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL) THEN
      v_event_type := 'transaction.restored';
    ELSE
      v_event_type := 'transaction.updated';
    END IF;

    v_payload := jsonb_build_object(
      'id', NEW.id,
      'user_id', NEW.user_id,
      'amount_paise', NEW.amount_paise,
      'type', NEW.type,
      'category_id', NEW.category_id,
      'transaction_date', NEW.transaction_date,
      'payment_method', NEW.payment_method,
      'necessity', NEW.necessity,
      'description', NEW.description,
      'notes', NEW.notes,
      'created_at', NEW.created_at,
      'updated_at', NEW.updated_at,
      'deleted_at', NEW.deleted_at
    );

    INSERT INTO public.outbox_events (
      user_id,
      entity_type,
      entity_id,
      event_type,
      payload
    ) VALUES (
      NEW.user_id,
      'transaction',
      NEW.id,
      v_event_type,
      v_payload
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Attach atomic outbox trigger
CREATE OR REPLACE TRIGGER trg_transactions_outbox
  AFTER INSERT OR UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_transactions_outbox_event();
