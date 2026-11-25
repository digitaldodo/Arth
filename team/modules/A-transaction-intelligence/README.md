# Module A — Transaction Intelligence, Ingestion & ML Categorization

- **Assigned Developer:** Ansh Gupta
- **Student Roll Number:** `2315000330`
- **Role:** Module A Owner & Shared Integration Lead
- **Module Purpose:** Stabilize multi-format bank statement ingestion (CSV, XLSX, PDF, local OCR), 4-tier historical reconciliation, UPI counterparty extraction, recurring-payment detection, PostgreSQL-backed `merchant_rules`, and ML-assisted transaction categorization.

---

## Current Implementation Status

- **Ledger CRUD & Manual Entry:** Implemented and verified (`QuickAddModal.tsx`, `TransactionLedger.tsx`, `backend/src/modules/transactions/`).
- **Statement Import & Reconciliation:** Partially implemented — 4-tier matcher and UI exist, **but 5 frontend tests currently fail** (`statement-import-parser.test.ts`, `statement-ocr.test.ts`), **5 ESLint errors exist** (`upi-parser.ts`, `StatementImport.tsx`), and `/api/v1/financial/{accounts,import-batches,transaction-links}` are trapped in unregistered `tax.routes.ts`.
- **ML Categorization:** Rules baseline runs in TypeScript (`pipeline.ts`, `layered-categorization.ts`) with rules trapped in `localStorage` (`public.merchant_rules` DB table unused). Python research suite (`ml/transaction-categorization/`) has 7/7 unit tests passing on a 60-row synthetic CSV, with Snorkel/FastText/XGBoost models `"status": "not_run"`.

---

## Directories

### Existing Source Directories Reused
- `frontend/src/features/imports/`
- `frontend/src/features/categorization/`
- `frontend/src/features/transactions/`
- `ml/transaction-categorization/`
- `packages/financial-modules/src/modules/personalized-categories/`
- `packages/financial-modules/src/modules/recurring-payments/`

### New Directories Prepared
- `backend/src/modules/financial-imports/`
- `backend/src/modules/categorization/`
- `frontend/src/app/api/backend/financial-imports/`
- `frontend/src/app/api/backend/categorization/`

---

## File Ownership & Restrictions

### Files Exclusively Owned
- All files under `frontend/src/features/imports/**` and `frontend/src/features/categorization/**`
- `backend/src/modules/financial-imports/**` and `backend/src/modules/categorization/**`
- `frontend/src/app/api/backend/financial-imports/**` and `frontend/src/app/api/backend/categorization/**`
- `ml/transaction-categorization/**`
- `packages/financial-modules/src/modules/personalized-categories/**` and `recurring-payments/**`
- Integration-lead PR-gated control over `backend/src/app.ts`, `packages/contracts/src/`, `packages/financial-modules/src/shared/`, `TransactionAppShell.tsx`, and root package files.

### Files That Must Not Be Changed
- Modules B, C, D, and E directories (`safe-to-spend`, `spending-forecast`, `emi-affordability`, `goal-planner`, `purchase-simulator`, `tax`, `documents`).
- `backend/src/plugins/auth.ts`, `frontend/src/proxy.ts`, `supabase/migrations/0001`–`0039`, `android/`.

---

## Shared Dependencies & API Contracts

- **Shared Dependencies:** `@arth/contracts`, `backend/src/plugins/auth.ts`, `frontend/src/lib/offline-db.ts`, `frontend/src/features/sync/sync-engine.ts`.
- **API Contracts:** See [API_CONTRACT.md](./API_CONTRACT.md). Exposes `/api/v1/financial/{accounts,import-batches,transaction-links,merchant-rules}` and `/api/v1/categorization/suggest`.

---

## Database Ownership & Migration Allocation

- **Tables Owned:** `public.merchant_rules`, `public.statement_import_batches`, `public.statement_import_batch_items`, `public.transaction_links`, `public.financial_accounts`, `public.account_movements`.
- **Read-Only Tables:** `public.transactions`, `public.categories`.
- **Migration Allocation:** Slot `0040` (only if required for `merchant_rules` necessity column or ML model provenance metadata).

---

## Test Responsibility & Acceptance Criteria

- **Test Responsibility:** See [TESTING.md](./TESTING.md). Maintain all statement import, UPI parser, categorization, reconciliation, recurring detection, and Python ML tests.
- **Acceptance Criteria:**
  1. `pnpm lint` exits 0 with zero errors; all 5 failing frontend import/OCR tests pass.
  2. `/api/v1/financial/{accounts,import-batches,transaction-links}` separated from `tax.routes.ts` and registered in `backend/src/app.ts`.
  3. `public.merchant_rules` persists across sessions/devices via Fastify API.
  4. Reproducible ML evaluation in `ml/transaction-categorization/` outputs real measured metrics (`macro_f1`, calibration, latency) and runtime inference integrates cleanly with `personalized-categories` and provenance columns.
- **Integration Dependencies:** Integration Lead for `app.ts` / `contracts`; consumes nothing from Modules B–E; provides normalized transactions and recurring candidates to B, C, D, and E.
