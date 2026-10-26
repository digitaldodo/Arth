import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Supabase Cron Migration & Scheduled Job Architecture Suite', () => {
  const rootDir = path.resolve(__dirname, '../..');
  const vercelJsonPath = path.join(rootDir, 'vercel.json');
  const migration0020Path = path.join(
    rootDir,
    'supabase/migrations/0020_supabase_cron_schedules.sql'
  );
  const syncRoutePath = path.join(
    rootDir,
    'frontend/src/app/api/sync/sheets/route.ts'
  );
  const reconcileRoutePath = path.join(
    rootDir,
    'frontend/src/app/api/sync/reconcile/route.ts'
  );
  const retryRoutePath = path.join(
    rootDir,
    'frontend/src/app/api/backend/sheets/retry/route.ts'
  );
  const sheetsWorkerPath = path.join(
    rootDir,
    'frontend/src/lib/server/sheets-worker.ts'
  );
  const edgeSyncPath = path.join(
    rootDir,
    'supabase/functions/sheets-sync/index.ts'
  );
  const edgeReconcilePath = path.join(
    rootDir,
    'supabase/functions/sheets-reconcile/index.ts'
  );

  // ─── 1. vercel.json Verification ───────────────────────────────────────────
  it('1. vercel.json does not contain invalid Vercel Cron definitions that fail Hobby plans', () => {
    assert.ok(fs.existsSync(vercelJsonPath), 'vercel.json must exist');
    const content = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf8'));

    // crons key must be completely absent or empty
    assert.strictEqual(
      content.crons,
      undefined,
      'vercel.json must not define crons key to prevent Vercel Hobby plan 24h frequency failure'
    );
    // outputDirectory override must be cleared so Vercel uses framework default (.next)
    // without appending frontend/.next to produce frontend/frontend/.next
    assert.strictEqual(
      content.outputDirectory,
      undefined,
      'vercel.json must clear custom outputDirectory override to prevent duplicate nested path'
    );
  });

  // ─── 2. Migration 0020 Verification ─────────────────────────────────────────
  it('2. Migration 0020 safely enables pg_cron and pg_net extensions', () => {
    assert.ok(fs.existsSync(migration0020Path), 'Migration 0020 must exist');
    const sql = fs.readFileSync(migration0020Path, 'utf8');

    assert.ok(
      sql.includes('CREATE EXTENSION IF NOT EXISTS pg_cron'),
      'Migration must attempt to enable pg_cron'
    );
    assert.ok(
      sql.includes('CREATE EXTENSION IF NOT EXISTS pg_net'),
      'Migration must attempt to enable pg_net'
    );
  });

  it('3. Migration 0020 creates cron_job_runs audit table with RLS enabled', () => {
    const sql = fs.readFileSync(migration0020Path, 'utf8');

    assert.ok(
      sql.includes('CREATE TABLE IF NOT EXISTS public.cron_job_runs'),
      'Must create public.cron_job_runs table'
    );
    assert.ok(
      sql.includes('chk_cron_job_status CHECK'),
      'Must enforce valid cron status constraints'
    );
    assert.ok(
      sql.includes('status IN (\'started\', \'completed\', \'failed\', \'skipped\')'),
      'Must support started, completed, failed, skipped statuses'
    );
    assert.ok(
      sql.includes('ALTER TABLE public.cron_job_runs ENABLE ROW LEVEL SECURITY'),
      'Must enable Row Level Security on cron_job_runs'
    );
  });

  it('4. Migration 0020 provides secure configuration retrieval with Supabase Vault integration', () => {
    const sql = fs.readFileSync(migration0020Path, 'utf8');

    assert.ok(
      sql.includes('CREATE TABLE IF NOT EXISTS public.app_cron_config'),
      'Must create fallback app_cron_config table'
    );
    assert.ok(
      sql.includes('FUNCTION public.fn_get_cron_config'),
      'Must provide fn_get_cron_config security definer function'
    );
    assert.ok(
      sql.includes('vault.decrypted_secrets'),
      'Must check Supabase Vault decrypted_secrets first'
    );
  });

  it('5. Migration 0020 provides outbox lease recovery and retry functions', () => {
    const sql = fs.readFileSync(migration0020Path, 'utf8');

    assert.ok(
      sql.includes('FUNCTION public.fn_recover_stale_outbox_events'),
      'Must provide fn_recover_stale_outbox_events function'
    );
    assert.ok(
      sql.includes('FUNCTION public.fn_retry_failed_outbox_events'),
      'Must provide fn_retry_failed_outbox_events function'
    );
  });

  it('6. Migration 0020 registers idempotent pg_cron schedules without duplicate risk', () => {
    const sql = fs.readFileSync(migration0020Path, 'utf8');

    // Verify unschedule calls before schedule
    assert.ok(
      sql.includes("cron.unschedule('arth-outbox-recovery-sync')"),
      'Must unschedule arth-outbox-recovery-sync before scheduling'
    );
    assert.ok(
      sql.includes("cron.unschedule('arth-daily-sheets-reconcile')"),
      'Must unschedule arth-daily-sheets-reconcile before scheduling'
    );

    // Verify cron expressions
    assert.ok(
      sql.includes("'*/5 * * * *'"),
      'Outbox recovery job must use 5-minute interval */5 * * * *'
    );
    assert.ok(
      sql.includes("'30 21 * * *'"),
      'Daily reconciliation job must run once per day (30 21 * * *)'
    );
    assert.ok(
      sql.includes('fn_cron_trigger_outbox_sync'),
      'Must call fn_cron_trigger_outbox_sync'
    );
    assert.ok(
      sql.includes('fn_cron_trigger_daily_reconcile'),
      'Must call fn_cron_trigger_daily_reconcile'
    );
  });

  // ─── 3. Endpoint Bounded Execution & Security ───────────────────────────────
  it('7. /api/sync/sheets enforces bounded execution, timeout safeguard, and CRON_SECRET auth', () => {
    assert.ok(fs.existsSync(syncRoutePath), 'sync route must exist');
    const code = fs.readFileSync(syncRoutePath, 'utf8');

    assert.ok(
      code.includes('isAuthorizedCron'),
      'Must enforce isAuthorizedCron security'
    );
    assert.ok(
      code.includes('Math.min(Math.max(rawLimit, 1), 100)'),
      'Must enforce bounded limit clamping between 1 and 100'
    );
    assert.ok(
      code.includes('timeoutPromise') || code.includes('25000'),
      'Must enforce serverless execution timeout guard'
    );
    assert.ok(
      code.includes('x-cron-source'),
      'Must record x-cron-source header for observability'
    );
  });

  it('8. /api/sync/reconcile enforces bounded timeout and authentication', () => {
    assert.ok(fs.existsSync(reconcileRoutePath), 'reconcile route must exist');
    const code = fs.readFileSync(reconcileRoutePath, 'utf8');

    assert.ok(
      code.includes('isAuthorizedCron'),
      'Must enforce isAuthorizedCron security'
    );
    assert.ok(
      code.includes('55000') || code.includes('timeoutPromise'),
      'Must enforce timeout guard for full reconciliation'
    );
  });

  // ─── 4. Manual Retry Endpoint & Worker Function ─────────────────────────────
  it('9. sheets-worker provides retryFailedUserOutbox and retry API endpoint exists', () => {
    assert.ok(fs.existsSync(sheetsWorkerPath), 'sheets-worker.ts must exist');
    const workerCode = fs.readFileSync(sheetsWorkerPath, 'utf8');

    assert.ok(
      workerCode.includes('export async function retryFailedUserOutbox'),
      'Must export retryFailedUserOutbox function'
    );
    assert.ok(
      workerCode.includes("status: 'pending'"),
      'Must reset failed records to pending'
    );
    assert.ok(
      workerCode.includes('retry_count: 0'),
      'Must reset retry count to 0'
    );

    assert.ok(fs.existsSync(retryRoutePath), 'retry route must exist');
    const routeCode = fs.readFileSync(retryRoutePath, 'utf8');
    assert.ok(
      routeCode.includes('getAuthenticatedSession'),
      'Retry route must authenticate caller'
    );
    assert.ok(
      routeCode.includes('retryFailedUserOutbox'),
      'Retry route must invoke retryFailedUserOutbox'
    );
  });

  // ─── 5. Supabase Edge Functions ─────────────────────────────────────────────
  it('10. Supabase Edge Functions exist for sheets-sync and sheets-reconcile', () => {
    assert.ok(fs.existsSync(edgeSyncPath), 'sheets-sync edge function must exist');
    assert.ok(
      fs.existsSync(edgeReconcilePath),
      'sheets-reconcile edge function must exist'
    );

    const syncEdgeCode = fs.readFileSync(edgeSyncPath, 'utf8');
    assert.ok(
      syncEdgeCode.includes('isAuthorizedCronRequest'),
      'Edge function must validate authorization'
    );
    assert.ok(
      syncEdgeCode.includes('AbortController'),
      'Edge function must use AbortController timeout'
    );

    const reconcileEdgeCode = fs.readFileSync(edgeReconcilePath, 'utf8');
    assert.ok(
      reconcileEdgeCode.includes('isAuthorizedCronRequest'),
      'Reconciliation edge function must validate authorization'
    );
  });

  // ─── 6. Event-Driven Near-Real-Time Outbox Drain ────────────────────────────
  it('11. Transaction routes trigger asynchronous outbox drain without blocking', () => {
    const txRoutePath = path.join(
      rootDir,
      'frontend/src/app/api/backend/transactions/route.ts'
    );
    const txIdRoutePath = path.join(
      rootDir,
      'frontend/src/app/api/backend/transactions/[id]/route.ts'
    );
    const txRestoreRoutePath = path.join(
      rootDir,
      'frontend/src/app/api/backend/transactions/[id]/restore/route.ts'
    );

    const txCode = fs.readFileSync(txRoutePath, 'utf8');
    const txIdCode = fs.readFileSync(txIdRoutePath, 'utf8');
    const txRestoreCode = fs.readFileSync(txRestoreRoutePath, 'utf8');

    assert.ok(
      txCode.includes('drainUserOutbox(userId)'),
      'Create transaction route must trigger drainUserOutbox'
    );
    assert.ok(
      txIdCode.includes('drainUserOutbox(userId)'),
      'Update/Delete transaction route must trigger drainUserOutbox'
    );
    assert.ok(
      txRestoreCode.includes('drainUserOutbox(userId)'),
      'Restore transaction route must trigger drainUserOutbox'
    );
  });
});
