-- Immutable per-transaction snapshots make statement batch undo conditional and atomic.
CREATE TABLE public.statement_import_batch_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL,
  transaction_id UUID NOT NULL,
  source_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_statement_import_item_transaction UNIQUE (transaction_id),
  CONSTRAINT fk_statement_import_item_batch_owner FOREIGN KEY (batch_id, user_id)
    REFERENCES public.statement_import_batches(id, user_id) ON DELETE RESTRICT,
  CONSTRAINT fk_statement_import_item_transaction_owner FOREIGN KEY (transaction_id, user_id)
    REFERENCES public.transactions(id, user_id) ON DELETE RESTRICT
);
CREATE INDEX idx_statement_import_items_user_batch ON public.statement_import_batch_items(user_id, batch_id);
ALTER TABLE public.statement_import_batch_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY statement_import_items_select_own ON public.statement_import_batch_items
  FOR SELECT TO authenticated USING (user_id = auth.uid());
GRANT SELECT ON public.statement_import_batch_items TO authenticated;
GRANT ALL ON public.statement_import_batch_items TO service_role;

CREATE OR REPLACE FUNCTION public.fn_snapshot_statement_import_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.import_batch_id IS NOT NULL THEN
    INSERT INTO public.statement_import_batch_items(user_id, batch_id, transaction_id, source_snapshot)
    VALUES (
      NEW.user_id, NEW.import_batch_id, NEW.id,
      jsonb_build_object(
        'amount_paise', NEW.amount_paise,
        'type', NEW.type,
        'category_id', NEW.category_id,
        'transaction_date', NEW.transaction_date,
        'payment_method', NEW.payment_method,
        'necessity', NEW.necessity,
        'description', NEW.description,
        'notes', NEW.notes,
        'account_id', NEW.account_id,
        'import_batch_id', NEW.import_batch_id,
        'statement_reference', NEW.statement_reference
      )
    );
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_snapshot_statement_import_item() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_snapshot_statement_import_item
  AFTER INSERT ON public.transactions
  FOR EACH ROW WHEN (NEW.import_batch_id IS NOT NULL)
  EXECUTE FUNCTION public.fn_snapshot_statement_import_item();

CREATE OR REPLACE FUNCTION public.undo_statement_import_batch(p_batch_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_batch public.statement_import_batches%ROWTYPE;
  v_active_count INTEGER;
  v_snapshot_count INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_batch
  FROM public.statement_import_batches
  WHERE id = p_batch_id AND user_id = v_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Statement import batch not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_batch.status = 'undone' THEN
    RETURN 0;
  END IF;
  IF v_batch.status NOT IN ('completed', 'partial') THEN
    RAISE EXCEPTION 'Wait for statement synchronization to finish before undoing this batch' USING ERRCODE = 'P0001';
  END IF;

  -- Lock imported rows before snapshot checks so a concurrent edit cannot race undo.
  PERFORM 1 FROM public.transactions
  WHERE user_id = v_user_id AND import_batch_id = p_batch_id AND deleted_at IS NULL
  ORDER BY id FOR UPDATE;

  SELECT count(*) INTO v_active_count FROM public.transactions
  WHERE user_id = v_user_id AND import_batch_id = p_batch_id AND deleted_at IS NULL;
  SELECT count(*) INTO v_snapshot_count FROM public.statement_import_batch_items
  WHERE user_id = v_user_id AND batch_id = p_batch_id;
  IF v_active_count <> v_snapshot_count THEN
    RAISE EXCEPTION 'The batch has incomplete source snapshots; it cannot be safely undone' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.transactions t
    JOIN public.statement_import_batch_items i
      ON i.transaction_id = t.id AND i.user_id = t.user_id AND i.batch_id = p_batch_id
    WHERE t.user_id = v_user_id AND t.import_batch_id = p_batch_id AND t.deleted_at IS NULL
      AND i.source_snapshot IS DISTINCT FROM jsonb_build_object(
        'amount_paise', t.amount_paise,
        'type', t.type,
        'category_id', t.category_id,
        'transaction_date', t.transaction_date,
        'payment_method', t.payment_method,
        'necessity', t.necessity,
        'description', t.description,
        'notes', t.notes,
        'account_id', t.account_id,
        'import_batch_id', t.import_batch_id,
        'statement_reference', t.statement_reference
      )
  ) THEN
    RAISE EXCEPTION 'One or more imported transactions changed after import; the batch was left untouched' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.transaction_links l
    JOIN public.transactions t ON t.user_id = l.user_id
      AND (t.id = l.source_transaction_id OR t.id = l.target_transaction_id)
    WHERE l.user_id = v_user_id AND l.status = 'confirmed'
      AND t.import_batch_id = p_batch_id AND t.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'One or more imported transactions are linked to reconciliation records; resolve those links before undoing' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.transactions SET deleted_at = now(), updated_at = now()
  WHERE user_id = v_user_id AND import_batch_id = p_batch_id AND deleted_at IS NULL;
  GET DIAGNOSTICS v_active_count = ROW_COUNT;

  UPDATE public.statement_import_batches
  SET status = 'undone', reversed_at = now()
  WHERE id = p_batch_id AND user_id = v_user_id;
  RETURN v_active_count;
END;
$$;
REVOKE ALL ON FUNCTION public.undo_statement_import_batch(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_statement_import_batch(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
