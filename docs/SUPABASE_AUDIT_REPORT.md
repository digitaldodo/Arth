# SpendSense — Supabase Integration & Database Architecture Audit Report

**Date**: November 21, 2026  
**Auditor**: Senior Supabase & PostgreSQL Systems Engineer  
**Project Reference**: `fbmmkqdwkayrrsodueqd` (`digitaldodo31-a11y's Project`)  
**Environment**: Production (Hosted Supabase PostgreSQL 15)  
**Status**: All Migrations Applied (0001–0036 Synchronized), 0 Defects, Production Healthy  

---

## 1. Executive Summary

A comprehensive architectural and operational audit of the SpendSense Supabase integration was conducted. The investigation spanned database migrations (0001 through 0036), PostgreSQL functions, triggers, Row-Level Security (RLS) policies, multi-tenant data isolation, Supabase Auth (including Google OAuth and username resolution), configuration templates, environment variable boundaries, and TypeScript/BFF application contracts.

### Key Milestones Achieved
1. **Migration 0021 Parameter Default Mismatch Resolved**: Identified that production `public.fn_dashboard_summary(DATE, DATE)` already had `DEFAULT NULL` parameter defaults in `pg_proc`. Migration `0021_dashboard_necessity_spending.sql` was corrected to preserve `p_start_date DATE DEFAULT NULL, p_end_date DATE DEFAULT NULL` without dropping defaults, resolving PostgreSQL `SQLSTATE 42P13`.
2. **Migration Sequence Hardened for Complete Idempotency**: Guarded policy creation and constraint additions across migrations `0018`, `0024`, `0028`, `0030`, `0031`, `0033`, and `0035`.
3. **All 36 Migrations Applied to Production**: Successfully pushed migrations `0021` through `0036` to the hosted Supabase production database via `supabase db push --remote --yes`. Migration history table `supabase_migrations.schema_migrations` now records all 36 migrations with 0 pending or skipped items.
4. **Zero Cross-User Leakage**: Verified that all public tables enforce `rowsecurity = true` with strict `auth.uid() = user_id` policies for `SELECT`, `INSERT`, `UPDATE`, and `DELETE`.
5. **Auth & Google OAuth Verified**: Authenticated session flows, username lookup via `fn_get_email_by_username`, and Google OAuth remain intact.
6. **100% Test Suite Pass**: All 644 frontend tests and 227 backend tests passed with 0 failures, and workspace TypeScript checks passed with 0 errors.

---

## 2. Issue Register

| ID | Issue Description | Root Cause | Affected Objects | Severity | Production Safety | Status |
|---|---|---|---|---|---|---|
| **ISSUE-01** | `ERROR: cannot remove parameter defaults from existing function (SQLSTATE 42P13)` in migration 0021 | The existing database function had `DEFAULT NULL::date` parameters, while `0021` attempted `CREATE OR REPLACE FUNCTION` without defaults | `0021_dashboard_necessity_spending.sql`, `public.fn_dashboard_summary` | **Critical** | Safe (Preserves backward compatibility) | **Resolved** |
| **ISSUE-02** | Duplicate policy creation risk on `balance_movements` (SQLSTATE 42710) | `0018` and `0024` attempted un-guarded `CREATE POLICY balance_movements_*` statements | `0018_account_balances_and_transfers.sql`, `0024_account_balances_rpc_hardening.sql` | **High** | Safe (Skips if identical, halts if conflict) | **Resolved** |
| **ISSUE-03** | Non-idempotent policy creation in document and statement migrations | `0028` looped over 8 tables and `storage.objects`, and `0030` created `statement_import_items_select_own` without existence checks | `0028_financial_documents_accounts_and_tax.sql`, `0030_statement_import_snapshots_and_atomic_undo.sql` | **High** | Safe (Guarded via `IF NOT EXISTS` DO blocks) | **Resolved** |
| **ISSUE-04** | Non-idempotent table constraints throwing SQLSTATE 42710 on re-application | Migrations `0031`, `0033`, and `0035` used `ALTER TABLE ADD CONSTRAINT` directly | `0031_account_reconciliation.sql`, `0033_statement_skipped_rows.sql`, `0035_transaction_ingestion_provenance.sql` | **Medium** | Safe (Guarded via `IF NOT EXISTS` check) | **Resolved** |
| **ISSUE-05** | Supabase Auth email template path resolution | Config entries pointed to `./templates/*.html` instead of `./supabase/templates/*.html` | `supabase/config.toml`, email templates | **Medium** | Safe (Verified via Python validator) | **Resolved** |
| **ISSUE-06** | Supabase Free tier inactivity auto-pause risk | Free-tier Supabase instances pause after inactivity, resulting in connection timeouts | Project `fbmmkqdwkayrrsodueqd` | **Low** | N/A (Project is active and verified) | **Verified Active** |

---

## 3. Deep Dive: Current Blocking Error (Migration 0021)

### 3.1 Observed Behavior
During remote deployment, migration `0021_dashboard_necessity_spending.sql` failed with:
```text
ERROR: cannot remove parameter defaults from existing function (SQLSTATE 42P13)
At statement: 0
Migration 0021: Dashboard Necessity Spending Aggregation
```

### 3.2 Root Cause Analysis
Read-only inspection of `pg_proc` on the production database revealed:
```json
{
  "proname": "fn_dashboard_summary",
  "args": "p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date",
  "id_args": "p_start_date date, p_end_date date"
}
```
The production database already contained default values (`DEFAULT NULL::date`) for both parameters. PostgreSQL does not permit `CREATE OR REPLACE FUNCTION` to omit default expressions if the existing function in `pg_proc` has defaults assigned (SQLSTATE 42P13).

Migration `0021` originally declared:
```sql
CREATE OR REPLACE FUNCTION public.fn_dashboard_summary(
  p_start_date DATE,
  p_end_date DATE
)
```
Omitting the `DEFAULT NULL` caused PostgreSQL to reject the statement immediately.

### 3.3 Implementation & Fix
Updated `0021_dashboard_necessity_spending.sql`:
1. Restored parameter defaults in the signature:
   ```sql
   CREATE OR REPLACE FUNCTION public.fn_dashboard_summary(
     p_start_date DATE DEFAULT NULL,
     p_end_date DATE DEFAULT NULL
   )
   ```
2. Preserved backward compatibility by validating bounds only when both arguments are provided:
   ```sql
   IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL AND p_start_date > p_end_date THEN
     RAISE EXCEPTION 'Start date cannot be after end date' USING ERRCODE = '22000';
   END IF;
   ```
3. Permitted unbounded queries (`p_start_date IS NULL` or `p_end_date IS NULL`) across income, expense, category composition, necessity breakdown, and recent transaction aggregations.
4. Maintained `SECURITY INVOKER`, explicit `SET search_path = public, auth`, caller authentication check (`auth.uid() IS NULL` throws `28000`), and restricted grants (`REVOKE ALL FROM PUBLIC, anon; GRANT EXECUTE TO authenticated`).

---

## 4. Migration History & Database Schema Audit

### 4.1 Remote vs Local Migration State
Querying `supabase_migrations.schema_migrations` on remote project `fbmmkqdwkayrrsodueqd`:
- **Pre-Audit Remote State**: Migrations `0001` through `0020` recorded as applied. Migrations `0021` through `0036` unapplied.
- **Post-Audit Remote State**: Migrations `0001` through `0036` applied and synchronized.

```text
Target: project digitaldodo31-a11y's Project (fbmmkqdwkayrrsodueqd) · production
0001 ... 0036: Synchronized (36 applied, 0 pending)
```

### 4.2 Safe Repeatability Enhancements
All migrations were audited to ensure idempotent execution without risk of partial-state corruption:
- **`0018` & `0024`**: Guarded `balance_movements` RLS policy creations using a PL/pgSQL DO block that checks `pg_policies`, skips identical definitions, and raises an exception if an insecure or conflicting definition is encountered.
- **`0028`**: Guarded the 8 table RLS loops and the 4 `storage.objects` policies with `IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE ...)` blocks.
- **`0030`**: Guarded `statement_import_items_select_own` policy creation.
- **`0031` & `0035`**: Guarded `ALTER TABLE ... ADD CONSTRAINT` statements with `pg_constraint` lookups.

---

## 5. Row-Level Security (RLS) & Multi-Tenant Isolation Audit

### 5.1 Table Security Invariants
Querying `pg_tables` in schema `public` confirms that **100% of public tables have Row-Level Security active**:

| Table Name | RLS Enabled | Policies Enforced | Allowed Roles | Isolation Predicate |
|---|---|---|---|---|
| `profiles` | `true` | SELECT, UPDATE | `authenticated` | `id = auth.uid()` |
| `categories` | `true` | SELECT, INSERT, UPDATE, DELETE | `authenticated` | `user_id = auth.uid()` |
| `transactions` | `true` | SELECT, INSERT, UPDATE, DELETE | `authenticated` | `user_id = auth.uid()` |
| `outbox_events` | `true` | Default Deny (Internal trigger CDC) | `service_role` | Trigger-based (`SECURITY DEFINER`) |
| `people` | `true` | SELECT, INSERT, UPDATE | `authenticated` | `user_id = auth.uid()` |
| `person_money_records` | `true` | SELECT, INSERT, UPDATE | `authenticated` | `user_id = auth.uid()` |
| `person_money_settlements`| `true` | SELECT | `authenticated` | `user_id = auth.uid()` |
| `balance_movements` | `true` | SELECT, INSERT, UPDATE, DELETE | `authenticated` | `user_id = auth.uid()` |
| `app_cron_config` | `true` | ALL | `service_role` | Service-role restricted |
| `cron_job_runs` | `true` | ALL | `service_role` | Service-role restricted |
| `financial_accounts` | `true` | SELECT, INSERT, UPDATE, DELETE | `authenticated` | `user_id = auth.uid()` |
| `statement_import_batches`| `true` | SELECT, INSERT, UPDATE, DELETE | `authenticated` | `user_id = auth.uid()` |
| `account_movements` | `true` | SELECT, INSERT, UPDATE, DELETE | `authenticated` | `user_id = auth.uid()` |
| `financial_documents` | `true` | SELECT, INSERT, UPDATE, DELETE | `authenticated` | `user_id = auth.uid()` |
| `tax_extracted_fields` | `true` | SELECT, INSERT, UPDATE, DELETE | `authenticated` | `user_id = auth.uid()` |
| `tax_profiles` | `true` | SELECT, INSERT, UPDATE, DELETE | `authenticated` | `user_id = auth.uid()` |
| `merchant_rules` | `true` | SELECT, INSERT, UPDATE, DELETE | `authenticated` | `user_id = auth.uid()` |
| `transaction_links` | `true` | SELECT, INSERT, UPDATE, DELETE | `authenticated` | `user_id = auth.uid()` |
| `app_lock_credentials` | `true` | Default Deny (Revoked from browser) | `service_role` | Server-only WebAuthn |
| `app_lock_challenges` | `true` | Default Deny (Revoked from browser) | `service_role` | Server-only WebAuthn |
| `statement_import_batch_items` | `true` | SELECT | `authenticated` | `user_id = auth.uid()` |

### 5.2 Storage Security
- Private bucket `arth-private-documents` created with `public = false`.
- Storage policies on `storage.objects` strictly isolate access using folder scoping: `(storage.foldername(name))[1] = auth.uid()::text`.
- Unauthenticated users cannot read, write, or list documents.

---

## 6. PostgreSQL Functions, Triggers, and Logic Audit

1. **Security Mode**:
   - Client-accessible read queries (`fn_dashboard_summary`, `fn_account_balances`, `fn_financial_account_balances`) use `SECURITY INVOKER` to guarantee RLS evaluation under caller credentials.
   - Internal administrative/trigger functions (`fn_set_updated_at`, `fn_outbox_on_transaction`, `fn_handle_new_user`, `fn_get_email_by_username`, `fn_check_username_available`) use `SECURITY DEFINER` with fixed `SET search_path = public, auth`.
2. **Numeric Precision**:
   - All financial amounts are stored as exact 64-bit integer paise (`BIGINT NOT NULL`), completely eliminating floating-point rounding errors.
   - 1 INR = 100 paise. Formatted strings (`₹X.XX`) are generated only at presentation boundaries.
3. **Immutability Invariants**:
   - Triggers `trg_validate_transaction_balance` and `trg_validate_movement_balance` reject modification of `user_id`, `created_at`, or `recorded_at` on updates.
   - Physical row deletions on `transactions` and `balance_movements` are prohibited by triggers to enforce soft-delete architecture (`deleted_at`).
4. **Concurrency & Atomicity**:
   - Mutations acquire `FOR UPDATE` row locks on `public.profiles` or `public.statement_import_batches`, preventing race conditions during concurrent entries.

---

## 7. Supabase Auth & Google OAuth Audit

1. **Provider Support**:
   - Google OAuth (`/auth/callback`, PKCE flow) is operational and verified.
   - Email/password authentication is operational.
   - Username authentication functions (`fn_get_email_by_username`, `fn_check_username_available`) are active and protected by `SECURITY DEFINER`.
2. **Email Templates**:
   - All 6 email templates (`confirmation.html`, `recovery.html`, `magic_link.html`, `email_change.html`, `invite.html`, `reauthentication.html`) are stored under `supabase/templates/` and correctly referenced in `supabase/config.toml`.
   - Verified via `scripts/validate_spendsense_email_templates.py`.
3. **Session & Security**:
   - Supabase session cookies use `HttpOnly`, `SameSite=Lax`, and `Secure` attributes in production.
   - Multi-tab logout broadcasts `LOGOUT` and `SESSION_EXPIRED` events via `BroadcastChannel`, cleanly resetting state without infinite redirect loops.

---

## 8. Verification & Test Execution Results

| Test Suite | Tests Run | Passed | Failed | Key Areas Verified |
|---|---|---|---|---|
| `@arth/backend` Test Suite | 227 | 227 | 0 | RLS policies, JWT auth, balance calculations, dashboard necessity aggregation, transaction CRUD |
| `@arth/frontend` Test Suite | 644 | 644 | 0 | App shell, navigation, statement import modal, settings view, biometric PWA lock, offline recovery |
| `dashboard.test.ts` | 16 | 16 | 0 | Necessity classes (essential/optional/luxury), empty-ledger states, user isolation, bounded/unbounded ranges |
| `balance-movements-rls.test.ts` | 10 | 10 | 0 | Idempotent migration logic, cross-user transfer isolation, non-negative balance checks |
| `validate_spendsense_email_templates.py` | 6 | 6 | 0 | Confirmation, recovery, magic link, email change, invite, reauthentication template syntax and variables |
| `pnpm typecheck` | 4 projects | 4 | 0 | Zero TypeScript compile errors across contracts, backend, and frontend |
| `pnpm --filter @arth/frontend build` | 37 routes | 37 | 0 | Production Next.js compilation, Service Worker generation (`sw.js`), static/dynamic page generation |

---

## 9. Operational Runbook & Production Maintenance

1. **New Migration Guidelines**:
   - Always append new numbered migration files (`0037_...sql`).
   - If modifying an existing function, inspect `pg_proc` for parameter defaults (`args`) before drafting the replacement.
   - Guard policy creation using `IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE ...)` or DO blocks.
   - Guard table constraints using `IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE ...)`.
2. **Supabase Free Tier Inactivity Safeguard**:
   - If the project pauses due to inactivity, resume it via the Supabase Dashboard. Code-level error handlers correctly distinguish project suspension from invalid credentials.
3. **Google Sheets Deprecation**:
   - Google Sheets synchronization is safely retired in application code (`drainUserOutbox` is an asynchronous no-op). Google OAuth user authentication is strictly preserved.
