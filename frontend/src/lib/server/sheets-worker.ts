import { createClient } from '@supabase/supabase-js';
import {
  syncTransactionToSheet,
  reconcileSheetWithTransactions,
  type TransactionPayload,
} from './google-sheets-client';
import { isGoogleServiceAccountConfigured } from './google-auth';

export interface OutboxRecord {
  id: string;
  user_id: string;
  entity_type: string;
  entity_id: string;
  event_type: string;
  payload: TransactionPayload;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  retry_count: number;
  error_message?: string | null;
  created_at: string;
  processed_at?: string | null;
  locked_at?: string | null;
  claim_id?: string | null;
}

export interface UserSheetConnection {
  id: string;
  user_id: string;
  spreadsheet_id: string;
  spreadsheet_url: string;
  sheet_name: string;
  sync_status: 'idle' | 'syncing' | 'connected' | 'error';
  last_synced_at?: string | null;
  last_error?: string | null;
}

/**
 * Returns a privileged Supabase client configured with the service role key.
 * This client bypasses RLS and is strictly confined to server-side background workers.
 */
export function getSupabaseAdmin() {
  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Supabase Admin credentials missing. Please set SUPABASE_SERVICE_ROLE_KEY.'
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Atomically claims a batch of pending outbox events using PostgreSQL FOR UPDATE SKIP LOCKED
 * via RPC fn_claim_outbox_events, recovering expired leases.
 */
export async function claimPendingOutboxEvents(
  batchSize = 50,
  workerId = `worker-${Date.now()}`
): Promise<OutboxRecord[]> {
  const admin = getSupabaseAdmin();

  try {
    // Attempt atomic claiming RPC
    const { data, error } = await admin.rpc('fn_claim_outbox_events', {
      p_batch_size: batchSize,
      p_claim_id: workerId,
      p_stale_seconds: 300,
    });

    if (!error && Array.isArray(data)) {
      return data as OutboxRecord[];
    }
  } catch {
    // If RPC is unavailable (e.g. before migration), fall back to direct query
  }

  // Fallback: simple query for pending events with retry_count < 5
  const { data: fallbackEvents } = await admin
    .from('outbox_events')
    .select('*')
    .eq('status', 'pending')
    .lt('retry_count', 5)
    .order('created_at', { ascending: true })
    .limit(batchSize);

  if (!fallbackEvents || fallbackEvents.length === 0) {
    return [];
  }

  const ids = fallbackEvents.map((e) => e.id);
  // Mark in-flight
  await admin
    .from('outbox_events')
    .update({
      status: 'processing',
      locked_at: new Date().toISOString(),
      claim_id: workerId,
    })
    .in('id', ids);

  return fallbackEvents as OutboxRecord[];
}

/**
 * Executes a single outbox batch drain across all users.
 */
export async function processOutboxBatch(batchSize = 50): Promise<{
  claimed: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
}> {
  if (!isGoogleServiceAccountConfigured()) {
    console.warn(
      '[SheetsWorker] Google Service Account credentials not configured. Skipping outbox drain.'
    );
    return { claimed: 0, processed: 0, succeeded: 0, failed: 0, skipped: 0 };
  }

  const admin = getSupabaseAdmin();
  const workerId = `sheets-worker-${Date.now()}-${Math.random()
    .toString(36)
    .substring(2, 7)}`;
  const events = await claimPendingOutboxEvents(batchSize, workerId);

  if (events.length === 0) {
    return { claimed: 0, processed: 0, succeeded: 0, failed: 0, skipped: 0 };
  }

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  // Group events by user_id to preserve user isolation and batch connection lookups
  const userEventsMap = new Map<string, OutboxRecord[]>();
  for (const ev of events) {
    const list = userEventsMap.get(ev.user_id) || [];
    list.push(ev);
    userEventsMap.set(ev.user_id, list);
  }

  for (const [userId, userEvents] of userEventsMap.entries()) {
    // 1. Fetch user's sheet connection
    const { data: connection } = await admin
      .from('user_sheet_connections')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (!connection) {
      // User has not paired a Google Sheet yet.
      // Mark events as completed with skipped note so queue does not grow unbounded.
      const eventIds = userEvents.map((e) => e.id);
      await admin
        .from('outbox_events')
        .update({
          status: 'completed',
          processed_at: new Date().toISOString(),
          error_message: 'Skipped: User has no active Google Sheet connection',
        })
        .in('id', eventIds);

      skipped += userEvents.length;
      continue;
    }

    // 2. Fetch category names for readable category column
    const { data: categories } = await admin
      .from('categories')
      .select('id, name')
      .eq('user_id', userId);

    const categoryMap = new Map<string, string>();
    if (categories) {
      for (const cat of categories) {
        categoryMap.set(cat.id, cat.name);
      }
    }

    // 3. Process events in order
    for (const ev of userEvents) {
      const payload: TransactionPayload = {
        ...ev.payload,
        category_name: ev.payload.category_id
          ? categoryMap.get(ev.payload.category_id) || null
          : null,
      };

      try {
        await syncTransactionToSheet(
          connection.spreadsheet_id,
          connection.sheet_name || 'Transactions',
          ev.event_type,
          payload
        );

        // Mark event completed
        await admin
          .from('outbox_events')
          .update({
            status: 'completed',
            processed_at: new Date().toISOString(),
            error_message: null,
          })
          .eq('id', ev.id);

        succeeded++;
      } catch (err: unknown) {
        const errorMsg =
          err instanceof Error ? err.message : 'Unknown sync error';
        const nextRetry = (ev.retry_count || 0) + 1;
        const newStatus = nextRetry >= 5 ? 'failed' : 'pending';

        await admin
          .from('outbox_events')
          .update({
            status: newStatus,
            retry_count: nextRetry,
            error_message: errorMsg,
            locked_at: null,
            claim_id: null,
          })
          .eq('id', ev.id);

        // Update connection status
        await admin
          .from('user_sheet_connections')
          .update({
            sync_status: 'error',
            last_error: errorMsg,
            updated_at: new Date().toISOString(),
          })
          .eq('id', connection.id);

        failed++;
      }
    }

    // If at least one event succeeded for this user, mark connection healthy
    if (succeeded > 0) {
      await admin
        .from('user_sheet_connections')
        .update({
          sync_status: 'connected',
          last_synced_at: new Date().toISOString(),
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', connection.id);
    }
  }

  return {
    claimed: events.length,
    processed: succeeded + failed + skipped,
    succeeded,
    failed,
    skipped,
  };
}

/**
 * Triggers an immediate outbox drain for a single user (called from "Sync Now" in Settings).
 */
export async function drainUserOutbox(userId: string): Promise<{
  synced: number;
  failed: number;
  message: string;
}> {
  if (!isGoogleServiceAccountConfigured()) {
    throw new Error(
      'Google Sheets integration is not configured on the server. Please check environment variables.'
    );
  }

  const admin = getSupabaseAdmin();

  // 1. Get user connection
  const { data: connection, error: connError } = await admin
    .from('user_sheet_connections')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (connError || !connection) {
    throw new Error(
      'No connected Google Sheet found for this account. Please pair a spreadsheet first.'
    );
  }

  // 2. Fetch all pending/processing events for this user
  const { data: userEvents, error: evError } = await admin
    .from('outbox_events')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['pending', 'processing'])
    .lt('retry_count', 5)
    .order('created_at', { ascending: true });

  if (evError) {
    throw new Error(`Failed to fetch outbox events: ${evError.message}`);
  }

  if (!userEvents || userEvents.length === 0) {
    // Nothing pending, update last_synced_at
    await admin
      .from('user_sheet_connections')
      .update({
        sync_status: 'connected',
        last_synced_at: new Date().toISOString(),
        last_error: null,
      })
      .eq('id', connection.id);

    return {
      synced: 0,
      failed: 0,
      message: 'Spreadsheet is already fully synchronized.',
    };
  }

  // 3. Fetch category taxonomy
  const { data: categories } = await admin
    .from('categories')
    .select('id, name')
    .eq('user_id', userId);

  const categoryMap = new Map<string, string>();
  if (categories) {
    for (const cat of categories) {
      categoryMap.set(cat.id, cat.name);
    }
  }

  let synced = 0;
  let failed = 0;

  for (const ev of userEvents as OutboxRecord[]) {
    const payload: TransactionPayload = {
      ...ev.payload,
      category_name: ev.payload.category_id
        ? categoryMap.get(ev.payload.category_id) || null
        : null,
    };

    try {
      await syncTransactionToSheet(
        connection.spreadsheet_id,
        connection.sheet_name || 'Transactions',
        ev.event_type,
        payload
      );

      await admin
        .from('outbox_events')
        .update({
          status: 'completed',
          processed_at: new Date().toISOString(),
          error_message: null,
        })
        .eq('id', ev.id);

      synced++;
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : 'Unknown sync error';
      const nextRetry = (ev.retry_count || 0) + 1;
      const newStatus = nextRetry >= 5 ? 'failed' : 'pending';

      await admin
        .from('outbox_events')
        .update({
          status: newStatus,
          retry_count: nextRetry,
          error_message: errorMsg,
          locked_at: null,
          claim_id: null,
        })
        .eq('id', ev.id);

      failed++;
    }
  }

  // Update connection status
  await admin
    .from('user_sheet_connections')
    .update({
      sync_status: failed > 0 ? 'error' : 'connected',
      last_synced_at: new Date().toISOString(),
      last_error: failed > 0 ? `${failed} mutations failed to sync` : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', connection.id);

  return {
    synced,
    failed,
    message: `Synchronized ${synced} record(s)${
      failed > 0 ? `, ${failed} failed` : ''
    }.`,
  };
}

/**
 * Reconciles all transactions in PostgreSQL with the user's Google Sheet (Weekly reconciliation).
 */
export async function reconcileUserSheet(userId: string): Promise<{
  total: number;
  inserted: number;
  updated: number;
}> {
  const admin = getSupabaseAdmin();

  const { data: connection } = await admin
    .from('user_sheet_connections')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (!connection) {
    throw new Error('No Google Sheet connected for this user.');
  }

  // Fetch all transactions for user (active and soft-deleted)
  const { data: transactions, error: txError } = await admin
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('transaction_date', { ascending: false });

  if (txError) {
    throw new Error(`Failed to load transactions: ${txError.message}`);
  }

  // Fetch categories
  const { data: categories } = await admin
    .from('categories')
    .select('id, name')
    .eq('user_id', userId);

  const categoryMap = new Map<string, string>();
  if (categories) {
    for (const cat of categories) {
      categoryMap.set(cat.id, cat.name);
    }
  }

  const payloads: TransactionPayload[] = (transactions || []).map((t) => ({
    id: t.id,
    user_id: t.user_id,
    amount_paise: t.amount_paise,
    type: t.type,
    category_id: t.category_id,
    category_name: t.category_id ? categoryMap.get(t.category_id) || null : null,
    transaction_date: t.transaction_date,
    payment_method: t.payment_method,
    necessity: t.necessity,
    description: t.description,
    notes: t.notes,
    created_at: t.created_at,
    updated_at: t.updated_at,
    deleted_at: t.deleted_at,
  }));

  const result = await reconcileSheetWithTransactions(
    connection.spreadsheet_id,
    connection.sheet_name || 'Transactions',
    payloads
  );

  // Update sync status
  await admin
    .from('user_sheet_connections')
    .update({
      sync_status: 'connected',
      last_synced_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', connection.id);

  return result;
}

/**
 * Reconciles all connected user spreadsheets (called by weekly cron).
 */
export async function reconcileAllConnectedSheets(): Promise<{
  usersProcessed: number;
  errors: number;
}> {
  if (!isGoogleServiceAccountConfigured()) {
    return { usersProcessed: 0, errors: 0 };
  }

  const admin = getSupabaseAdmin();
  const { data: connections } = await admin
    .from('user_sheet_connections')
    .select('user_id');

  if (!connections || connections.length === 0) {
    return { usersProcessed: 0, errors: 0 };
  }

  let usersProcessed = 0;
  let errors = 0;

  for (const conn of connections) {
    try {
      await reconcileUserSheet(conn.user_id);
      usersProcessed++;
    } catch (err) {
      console.error(
        `[SheetsWorker] Failed weekly reconciliation for user ${conn.user_id}:`,
        err
      );
      errors++;
    }
  }

  return { usersProcessed, errors };
}
