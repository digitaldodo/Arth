-- Migration 0007: Performance and query optimization indexes
-- Tailored to active transaction ledger, category selection, and outbox polling

-- 1. Active transaction queries by user and date (Dashboard, Ledger views)
CREATE INDEX IF NOT EXISTS idx_transactions_user_date_active
  ON public.transactions (user_id, transaction_date DESC, created_at DESC)
  WHERE deleted_at IS NULL;

-- 2. Transaction category lookup (Category breakdown analytics)
CREATE INDEX IF NOT EXISTS idx_transactions_user_category
  ON public.transactions (user_id, category_id)
  WHERE deleted_at IS NULL;

-- 3. Active categories lookup by user, type, and sort order (Quick Entry chips)
CREATE INDEX IF NOT EXISTS idx_categories_user_type_sort
  ON public.categories (user_id, type, sort_order ASC)
  WHERE archived_at IS NULL;

-- 4. Outbox worker queue polling (pending items in FIFO creation order)
CREATE INDEX IF NOT EXISTS idx_outbox_status_pending_created
  ON public.outbox_events (status, created_at ASC)
  WHERE status = 'pending';
