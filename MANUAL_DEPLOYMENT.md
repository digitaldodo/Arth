# Arth Production Deployment & Verification Guide

This document provides exact, step-by-step instructions for completing the deployment of Arth's PWA session persistence, balance snapshot accounting, and database-level non-negative balance invariants.

---

## Overview of Automated vs. Manual Actions

| Component | Status | Action Required |
|---|---|---|
| **Codebase & Contracts** | ✅ Completed & Committed | Automated via GitHub `main` push. |
| **Vercel Web App** | 🔄 Automated CI/CD | Auto-deployed on GitHub push to `main`. |
| **Supabase PostgreSQL** | ⚠️ **Manual Action** | Execute migrations `0025` and `0026` via Supabase SQL Editor. |
| **Installed Android PWA** | 📱 Automatic Update | Update activates upon opening the app. |

---

## 1. Supabase Production Migration

### Context & Safety
- **Target Files**:
  1. [`supabase/migrations/0025_balance_snapshot_and_non_negative_balances.sql`](./supabase/migrations/0025_balance_snapshot_and_non_negative_balances.sql)
  2. [`supabase/migrations/0026_harden_unconfigured_balances_and_ownership.sql`](./supabase/migrations/0026_harden_unconfigured_balances_and_ownership.sql)
- **Nature of Migrations**: Forward-only, append-only, and **100% idempotent**.
- **Data Safety**: Non-destructive. Backfills `recorded_at` from `created_at` for existing rows. Preserves all existing financial transactions, categories, and user profiles.

### Step-by-Step Execution via Supabase Dashboard

1. Navigate to the **[Supabase Dashboard](https://supabase.com/dashboard)** and select your **Arth** project.
2. In the left navigation menu, click the **SQL Editor** tab (`>_` icon).
3. Click **+ New Query** in the top bar.
4. Copy the complete text of `supabase/migrations/0025_balance_snapshot_and_non_negative_balances.sql` (if not previously applied) and run it.
5. Next, copy the complete text of `supabase/migrations/0026_harden_unconfigured_balances_and_ownership.sql` into the SQL editor and click the green **Run** button (or press `Ctrl` + `Enter` / `Cmd` + `Enter`).
6. Confirm that the execution status outputs: `Success. No rows returned`.

> [!TIP]
> If you manage migrations using the Supabase CLI (`supabase db push`), you can alternatively run:
> ```bash
> supabase db push
> ```
> *Note: If applying via SQL Editor, do not re-run via CLI without repairing migration history.*

---

## 2. Production Database Verification Queries

Execute each query below in the Supabase SQL Editor to verify the migration.

### 2.1 Verify Columns, Defaults & Constraints

```sql
-- Check recorded_at column and check constraints
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('transactions', 'balance_movements')
  AND column_name = 'recorded_at';
```
**Expected Result**:
Two rows (`transactions` and `balance_movements`), both with `data_type = 'timestamp with time zone'`, `is_nullable = 'NO'`, and `column_default = 'now()'`.

---

```sql
-- Check non-negative check constraints on public.profiles
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.profiles'::regclass
  AND conname IN ('chk_profiles_starting_cash_non_negative', 'chk_profiles_starting_online_non_negative');
```
**Expected Result**:
Two rows:
- `chk_profiles_starting_cash_non_negative` → `CHECK ((starting_cash_paise >= 0))`
- `chk_profiles_starting_online_non_negative` → `CHECK ((starting_online_paise >= 0))`

---

### 2.2 Verify Timestamp Distribution

```sql
-- Confirm no null recorded_at and that recorded_at distribution matches creation
SELECT
  count(*) AS total_txns,
  count(recorded_at) AS txns_with_recorded_at,
  count(*) FILTER (WHERE recorded_at IS NULL) AS missing_recorded_at
FROM public.transactions;
```
**Expected Result**:
`missing_recorded_at` is `0`. `txns_with_recorded_at` equals `total_txns`.

---

### 2.3 Verify RPC Signatures & Grants

```sql
-- Check fn_account_balances signature and execution grants
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  p.prosecdef AS is_security_definer,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute
FROM pg_proc p
WHERE p.proname IN ('fn_account_balances', 'fn_configure_starting_balances');
```
**Expected Result**:
- `fn_account_balances`: arguments = `""` (0 params), `anon_can_execute` = `false`, `authenticated_can_execute` = `true`.
- `fn_configure_starting_balances`: arguments = `p_starting_cash_paise bigint, p_starting_online_paise bigint`, `anon_can_execute` = `false`, `authenticated_can_execute` = `true`.

---

### 2.4 Verify Trigger Definitions

```sql
-- Check balance validation triggers
SELECT
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE trigger_name IN ('trg_validate_transaction_balance', 'trg_validate_movement_balance');
```
**Expected Result**:
- `trg_validate_transaction_balance` on `public.transactions` firing `BEFORE INSERT OR UPDATE OR DELETE`.
- `trg_validate_movement_balance` on `public.balance_movements` firing `BEFORE INSERT OR UPDATE OR DELETE`.

---

### 2.5 Verify Indexes

```sql
-- Check composite indexes on (user_id, recorded_at)
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN ('idx_transactions_user_recorded_at', 'idx_balance_movements_user_recorded_at');
```
**Expected Result**:
Both indexes present, indexing `(user_id, recorded_at)`.

---

### 2.6 Verify User Ownership Immutability & Zero-Baseline Invariants (Migration 0026)

```sql
-- Check that trigger functions contain user ownership validation and zero-baseline checks
SELECT proname, prosecdef
FROM pg_proc
WHERE proname IN ('fn_account_balances', 'fn_validate_transaction_balance', 'fn_validate_movement_balance');
```
**Expected Result**:
- `fn_account_balances`: `prosecdef = false` (`SECURITY INVOKER`)
- `fn_validate_transaction_balance`: `prosecdef = true` (`SECURITY DEFINER`)
- `fn_validate_movement_balance`: `prosecdef = true` (`SECURITY DEFINER`)

---

## 3. Vercel Web Deployment

1. **Automatic Deployment**: Pushing to `main` on GitHub triggers an automatic production build and deployment on Vercel.
2. **Configuration Status**:
   - **Environment Variables**: **No new environment variables are needed.**
   - Existing variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`) remain unchanged.
3. **Verification**:
   - Check the **Vercel Dashboard** → **Deployments** tab.
   - Confirm that the latest deployment from the `main` commit shows status **Ready**.
   - If deployments are paused or failed due to external rate limits, click **Redeploy** on the latest deployment.

---

## 4. Android PWA Update Procedure

When Arth is opened on an Android device:
1. **Background Service Worker Update**:
   - The browser automatically detects the new service worker (`sw.js` with new build version) in the background.
2. **Activating the Update**:
   - Close the Arth PWA from Android's **Recent Apps / App Switcher** screen.
   - Reopen Arth from your home screen.
   - The new service worker activates and serves the hardened application shell.

> [!CAUTION]
> **Do NOT clear "Storage" or "App Data"** in Android Settings. Clearing app data will delete your local IndexedDB storage, which may contain unsynchronized pending transactions awaiting an internet connection.

---

## 5. Production Smoke Test Checklist

Once the Supabase migration and Vercel deployment are complete, perform this 5-minute sanity check:

- [ ] **1. Sign-In & Session Continuity**:
  - Open Arth. Confirm you are signed in without requiring re-authentication.
  - Return to the Android home screen, reopen Arth: confirm session is instantly restored.
- [ ] **2. Android Back Gesture**:
  - Open a sub-screen (e.g. Ledger, People Tracker, or More).
  - Use the Android system back gesture. Confirm that Arth navigates to the previous view or minimizes to the home screen—it must **never** take you to a login screen or log you out.
- [ ] **3. Starting-Balance Snapshot Invariant**:
  - Check your Account Balances.
  - Confirm that transactions recorded prior to your `balances_configured_at` baseline date (e.g., 23–30 October) remain visible in the ledger and reports, but are **not** deducted from your configured starting balance snapshot.
- [ ] **4. Post-Baseline Expense**:
  - Record a test expense for ₹10.
  - Verify that the relevant account (Cash or Online) is deducted by ₹10.
- [ ] **5. Non-Negative Balance Enforcement**:
  - Attempt to record an expense for an amount greater than your available balance (e.g., ₹999,999).
  - Confirm the application immediately blocks the submission with an alert: `Insufficient cash/online balance.`
- [ ] **6. Offline Creation & Sync**:
  - Turn on **Airplane Mode** on your device.
  - Record a small expense (e.g., ₹20). Confirm it saves locally and shows `Saved locally (pending sync)`.
  - Turn off **Airplane Mode**. Confirm the sync engine reconciles the mutation with Supabase and marks it Synced.
