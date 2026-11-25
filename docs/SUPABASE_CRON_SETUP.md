# Supabase Cron Migration & Setup Guide

This document describes the architectural migration of SpendSense's scheduled background jobs from Vercel Cron to Supabase PostgreSQL Cron (`pg_cron`), why Vercel Hobby deployments failed with the original configuration, and the one-time setup required in Supabase.

---

## 1. Root Cause of Previous Vercel Hobby Deployment Failures

### The Hobby Tier Limitation
In `vercel.json`, SpendSense previously defined:
```json
"crons": [
  {
    "path": "/api/sync/sheets",
    "schedule": "*/5 * * * *"
  },
  {
    "path": "/api/sync/reconcile",
    "schedule": "0 0 * * 0"
  }
]
```

Under **Vercel's Hobby (Free) Plan**:
1. **Frequency Limit**: Cron jobs are strictly limited to running **at most once per day** (i.e. minimum interval is 24 hours, such as `0 0 * * *`).
2. Any cron expression exceeding this frequency (such as `"*/5 * * * *"` for every 5 minutes) causes Vercel deployments to fail validation with:
   ```
   Invalid cron expression: Hobby accounts are limited to cron jobs that run at most once a day.
   ```
3. In addition, Vercel Hobby plan restricts the number of concurrent scheduled cron jobs.

### The Solution
- Scheduled tasks have been cleanly **removed from `vercel.json`**, allowing Vercel to remain exclusively the web and serverless API host without failing Hobby tier deployment constraints.
- Scheduling is now authoritatively managed by **Supabase PostgreSQL Cron (`pg_cron`)**, allowing 5-minute recovery cycles and daily reconciliations without third-party plan limits.

---

## 2. Architecture & Job Design

```
┌─────────────────────────────────────────────────────────────┐
│                       PostgreSQL DB                         │
│                                                             │
│  [transactions mutation] ──(DB trigger)──> [outbox_events]  │
│                                                   │         │
│  [pg_cron (*/5 * * * *)]                          │         │
│         │                                         ▼         │
│         ▼                             fn_recover_stale()    │
│  fn_cron_trigger_outbox_sync()                 │            │
│         │                                      │            │
│         ▼ (pg_net HTTP POST)                   ▼            │
│  [cron_job_runs audit table]              [claim lease]     │
└─────────┬───────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│                 Vercel Web App / API Host                   │
│                                                             │
│  • POST /api/sync/sheets    (Validated by CRON_SECRET)      │
│  • POST /api/sync/reconcile (Daily full reconciliation)     │
│  • POST /api/backend/sheets/retry (Manual failed retry)     │
│                                                             │
│  Event-Driven Near-Real-Time:                               │
│  User creates/updates transaction ──> BFF asynchronously    │
│  triggers drainUserOutbox() without blocking client HTTP    │
└─────────────────────────────────────────────────────────────┘
```

### Three Synchronized Layers:
1. **Near-Real-Time Event-Driven Processing**:
   - Creating, editing, or deleting a transaction writes atomically to `public.transactions` and `public.outbox_events` via PostgreSQL trigger `trg_transactions_outbox`.
   - The BFF proxy in Next.js triggers an immediate non-blocking outbox drain for the user.
   - If Google Sheets API responds immediately, the record is synchronized within seconds.
   - If Google Sheets is unreachable or slow, the transaction remains safe in PostgreSQL with `status = 'pending'`, never blocking or rolling back user ledger operations.

2. **Durable 5-Minute Recovery Job (`arth-outbox-recovery-sync`)**:
   - Runs every 5 minutes (`*/5 * * * *`) inside Supabase `pg_cron`.
   - Calls `public.fn_cron_trigger_outbox_sync()`:
     - Automatically releases stale leases (`locked_at > 300s`) via `fn_recover_stale_outbox_events(300)`.
     - Detects pending outbox records and dispatches an authenticated HTTP POST via `pg_net` to `/api/sync/sheets`.
     - Records full status, duration, and error metrics in `public.cron_job_runs`.

3. **Daily Full Reconciliation (`arth-daily-sheets-reconcile`)**:
   - Runs once per day at 03:00 IST / 21:30 UTC (`30 21 * * *`).
   - Calls `public.fn_cron_trigger_daily_reconcile()`.
   - Verifies all transaction records between PostgreSQL and Google Sheets, filling any gaps.

4. **Manual Recovery & Retries**:
   - `Sync Now`: Flushes current user outbox events immediately.
   - `Retry Failed Syncs`: Resets events marked as `'failed'` (exceeded 5 retries) back to `'pending'` and runs an immediate sync cycle.
   - `Full Reconcile`: Re-evaluates entire ledger against Google Sheets on demand.

---

## 3. One-Time Supabase Setup Instructions

Follow these steps in your Supabase Dashboard:

### Step 1: Enable Extensions in Supabase
1. Open your project at [https://supabase.com/dashboard/project/arth/database/extensions](https://supabase.com/dashboard).
2. Ensure the following extensions are enabled (toggled on):
   - **`pg_cron`**: Job scheduler for PostgreSQL.
   - **`pg_net`**: Async HTTP client for PostgreSQL.
   - **`vault`**: Supabase Vault for encrypted secrets storage.

*(Note: Migration `0020_supabase_cron_schedules.sql` includes `CREATE EXTENSION IF NOT EXISTS` with safe fallback error handling).*

### Step 2: Store Secrets in Supabase Vault (Recommended)
In the Supabase Dashboard, go to **Project Settings → Vault** (or run via SQL Editor):

```sql
-- 1. Store your shared CRON_SECRET in Supabase Vault
SELECT vault.create_secret(
  secret := 'your-random-cron-secret-here',
  name := 'cron_secret',
  description := 'Shared bearer token for authenticating Supabase Cron webhooks to Next.js API'
);

-- 2. Store your production application URL
SELECT vault.create_secret(
  secret := 'https://arth-9h3f.vercel.app',
  name := 'app_url',
  description := 'Production Next.js application URL for background webhooks'
);
```

### Alternative: Database Configuration Table
If you do not use Supabase Vault, you can set the parameters in the dedicated `public.app_cron_config` table:
```sql
UPDATE public.app_cron_config
SET config_value = 'your-random-cron-secret-here'
WHERE config_key = 'cron_secret';

UPDATE public.app_cron_config
SET config_value = 'https://arth-9h3f.vercel.app'
WHERE config_key = 'app_url';
```

### Step 3: Set Vercel Environment Variable
In your Vercel Project Settings at [https://vercel.com/anshkmrn-8908s-projects/arth-9h3f/settings/environment-variables](https://vercel.com):
- Add `CRON_SECRET` with the exact same secret value used in Step 2.
- Check environments: **Production**, **Preview**, **Development**.

---

## 4. Important: Supabase Free Plan Limitations

> [!WARNING]
> **Database Pausing on the Free Plan**:
> - Supabase free projects **automatically pause after 7 days of inactivity** (no database connections or web traffic).
> - **`pg_cron` will NOT execute while the project database is paused.**
> - **Recovery Behavior**: The moment you visit the SpendSense app or make a transaction, Supabase automatically unpauses the database. The database trigger immediately records your transaction to the durable outbox, the event-driven worker synchronizes it to Google Sheets, and `pg_cron` resumes its 5-minute background recovery schedule.
> - PostgreSQL is always authoritative: transactions are never lost or invalidated while the project is sleeping.

---

## 5. Idempotency & Concurrency Safeguards

1. **Lease Locking with `FOR UPDATE SKIP LOCKED`**:
   - `public.fn_claim_outbox_events()` claims batches atomically. Multiple concurrent workers or crons will never process the same outbox event concurrently.
2. **Deterministic Deduplication on Migration Deployment**:
   - Migration `0020` executes `cron.unschedule()` for each job before `cron.schedule()`. Repeated runs or migrations will **never** register duplicate jobs.
3. **Execution Guardrails**:
   - API endpoints enforce a 25s timeout for outbox drains and 55s timeout for reconciliation, preventing hung serverless lambdas.
   - Batch sizes are clamped between 1 and 100.
