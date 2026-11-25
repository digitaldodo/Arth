# SpendSense — Team Preparation Change Plan (Phase A)

**Date:** 2026-11-25  
**Base Commit SHA:** `518d3c9273446f78ffcd4662084325ca12feb27c` (`518d3c9`)  
**Current Branch:** `main`  
**Initial Working Tree State:** Clean against `origin/main` (only the 4 audit documents from the prior audit turn exist as untracked files: `docs/PROJECT_CURRENT_STATE_AUDIT.md`, `docs/ARCHITECTURE_AND_DEPENDENCY_MAP.md`, `docs/FIVE_MEMBER_WORK_ALLOCATION.md`, `docs/PROJECT_GAP_AND_COMPLETION_PLAN.md`).

---

## 1. Existing Directories Preserved & Reused (Zero Replacement)

| Module | Existing Directories Reused | Notes |
|---|---|---|
| **Module A (Ansh Gupta)** | `frontend/src/features/imports/`, `frontend/src/features/categorization/`, `frontend/src/features/transactions/`, `ml/transaction-categorization/`, `packages/financial-modules/src/modules/personalized-categories/`, `packages/financial-modules/src/modules/recurring-payments/` | Existing parser, reconciliation, categorization rules, ML research scripts, and package scaffolds remain intact. |
| **Module B (Arun Kushwah)** | `packages/financial-modules/src/modules/safe-to-spend/`, `packages/financial-modules/src/modules/spending-forecast/` | Existing contract/service scaffolds remain intact. |
| **Module C (Akshat Kumar)** | `packages/financial-modules/src/modules/emi-affordability/` | Existing contract/service scaffold remains intact. |
| **Module D (Ayush Chaudhary)** | `packages/financial-modules/src/modules/goal-planner/`, `packages/financial-modules/src/modules/purchase-simulator/` | Existing contract/service scaffolds remain intact. |
| **Module E (Dev Chaudhary)** | `backend/src/modules/tax/`, `backend/src/modules/documents/`, `frontend/src/features/tax/` | Existing tax engine, document intake API, and `DocumentsTaxCentre.tsx` remain intact. Note: `frontend/src/features/documents/` does not exist and will NOT be created because `frontend/src/features/tax/` already houses `DocumentsTaxCentre.tsx`. |

---

## 2. Proposed New Missing Directories (Additive Only, with `.gitkeep`)

Each empty workspace folder will contain a `.gitkeep` file (no fake code or placeholder implementations) so Git tracks the module boundaries cleanly:

- **Module A**:
  - `backend/src/modules/financial-imports/.gitkeep`
  - `backend/src/modules/categorization/.gitkeep`
  - `frontend/src/app/api/backend/financial-imports/.gitkeep`
  - `frontend/src/app/api/backend/categorization/.gitkeep`
- **Module B**:
  - `frontend/src/features/safe-to-spend/.gitkeep`
  - `frontend/src/features/spending-forecast/.gitkeep`
  - `backend/src/modules/safe-to-spend/.gitkeep`
  - `backend/src/modules/spending-forecast/.gitkeep`
  - `frontend/src/app/api/backend/planning/safe-to-spend/.gitkeep`
  - `frontend/src/app/api/backend/planning/spending-forecast/.gitkeep`
- **Module C**:
  - `frontend/src/features/emi-affordability/.gitkeep` *(replaces creating a separate `emi-planner/` duplicate; `TransactionAppShell.tsx` `emi-planner` tab will import from `@/features/emi-affordability/` at integration time)*
  - `backend/src/modules/emi-affordability/.gitkeep`
  - `frontend/src/app/api/backend/planning/emi-affordability/.gitkeep`
- **Module D**:
  - `frontend/src/features/goal-planner/.gitkeep`
  - `frontend/src/features/purchase-simulator/.gitkeep`
  - `backend/src/modules/goal-planner/.gitkeep`
  - `backend/src/modules/purchase-simulator/.gitkeep`
  - `frontend/src/app/api/backend/planning/goals/.gitkeep`
  - `frontend/src/app/api/backend/planning/purchase-simulate/.gitkeep`
- **Module E**:
  - `backend/src/modules/tax/capital-gains/.gitkeep`
  - `backend/src/modules/tax/reconciliation/.gitkeep`
  - `frontend/src/features/tax/regime-comparison/.gitkeep`
  - `frontend/src/features/tax/capital-gains/.gitkeep`
  - `frontend/src/features/tax/reconciliation/.gitkeep`
  - `frontend/src/features/tax/readiness/.gitkeep`
  - `frontend/src/app/api/backend/tax/.gitkeep`

---

## 3. Proposed Team & Branding Documentation Files

- `team/README.md`
- `team/ownership.yml`
- `team/integration-contracts.md`
- `team/development-workflow.md`
- `team/modules/A-transaction-intelligence/{README.md, API_CONTRACT.md, TESTING.md}`
- `team/modules/B-safe-to-spend/{README.md, API_CONTRACT.md, TESTING.md}`
- `team/modules/C-emi-affordability/{README.md, API_CONTRACT.md, TESTING.md}`
- `team/modules/D-goal-planning/{README.md, API_CONTRACT.md, TESTING.md}`
- `team/modules/E-tax-planning/{README.md, API_CONTRACT.md, TESTING.md}`
- `docs/BRANDING_MIGRATION.md`
- New package READMEs (none currently exist):
  - `frontend/README.md`
  - `backend/README.md`
  - `packages/contracts/README.md`
  - `packages/financial-modules/README.md`

---

## 4. Branding References Proposed for Safe Update vs. Preserved

### 4.1 Proposed Safe Updates (Documentation & User-Facing Docs Only)
- `README.md`: Update title (`Arth (अर्थ)` → `SpendSense`), product overview, actual monorepo structure (`frontend/`, `backend/`, `packages/`, `ml/`, `android/`, `supabase/`), accurate implemented vs. scaffolded module status, environment variable names (no values), and test commands.
- `MANUAL_DEPLOYMENT.md`: Update customer-facing title and prose (`Arth` → `SpendSense`) while preserving exact SQL migration file names (`0025`–`0027`), RPC names, and Vercel/Supabase technical identifiers.
- New package READMEs (`frontend/README.md`, `backend/README.md`, `packages/contracts/README.md`, `packages/financial-modules/README.md`): Document SpendSense naming and legacy `@arth/*` package scopes accurately.

### 4.2 Explicitly Protected / Preserved Legacy Identifiers (Zero Modifications)
- Workspace package names: `@arth/frontend`, `@arth/backend`, `@arth/contracts`, root `"arth-monorepo"` in `package.json`, `render.yaml` (`arth-backend`), `vercel.json`.
- Offline storage & browser keys: `arth_offline_db`, `arth_last_payment_method`, `arth_last_category_*`, `arth_ledger_sort_preference`, `arth_pwa_critical_channel`, `arth_build_id`, `arth_last_sw_reload`, `manifest.ts` `start_url` query `?arth_runtime=installed-mobile-pwa`.
- Android identity & native deep links: `com.digitaldodo.arth`, `com.digitaldodo.arth.installer`, `arth://auth/callback`, `ARTH_SUPABASE_URL`, `ARTH_SUPABASE_ANON_KEY`, `ARTH_API_URL`, `Arth.apk` attachment header in `next.config.ts`.
- Supabase storage & database objects: bucket `arth-private-documents`, all migrations `0001`–`0039`, all table/column/RPC/RLS definitions.
- Historical architecture docs (`docs/ARTH_*.md`), `ANTIGRAVITY.md` (user-rule referenced canonical file), and `backend/src/modules/tax/tax-engine.ts` (`"within Arth's ₹1000 comparison threshold"` — deferred to Module E PR so calculation source code stays untouched during workspace prep).
- Git remote `https://github.com/digitaldodo/Arth.git`, deployment URLs (`arth-9h3f.vercel.app`, `arth-backend-nchl.onrender.com`), and component/API symbol names (`ArthLogo`, `ArthApi`, `ArthDatabase`, `ArthBackupPayload`, `service: 'arth-backend'`).

---

## 5. Explicitly Protected Files (No Edits Permitted in Phase B)

- All source code in `frontend/src/**`, `backend/src/**`, `packages/contracts/src/**`, `packages/financial-modules/src/**`, `android/**`, `ml/**`, `scripts/**`
- All test files in `frontend/tests/**`, `backend/tests/**`, `supabase/tests/**`
- All SQL migrations in `supabase/migrations/0001`–`0039` and `supabase/seed.sql`, `supabase/config.toml`, `supabase/functions/**`, `supabase/templates/**`
- All deployment/build configs (`package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `vercel.json`, `render.yaml`, `.env.example`, `.github/workflows/**`, `frontend/next.config.ts`, `tsconfig.json`)

---

## 6. Potential Conflicts & Risks

1. **Pre-existing test/lint state**: `main` @ `518d3c9` currently has 5 failing frontend tests (`statement-import-parser.test.ts` & `statement-ocr.test.ts`) and 5 ESLint errors (`upi-parser.ts`, `StatementImport.tsx`). Phase B will not alter source code to fix them; Module A owns stabilizing them as Milestone 0.
2. **Duplicate route definitions**: `backend/src/modules/tax/tax.routes.ts` is unregistered in `backend/src/app.ts` and contains routes for `/api/v1/financial/documents*`, `/financial/accounts`, `/financial/import-batches`, and `/financial/transaction-links` alongside `/api/v1/tax/*`. Documented in `team/` contracts so Modules A and E split them before registering in `app.ts`.
3. **Empty directory tracking**: Using `.gitkeep` ensures new module directories are committed cleanly without creating fake TypeScript/runtime files that could break `tsc` or `eslint`.
4. **Branding link preservation**: Updating `README.md` must preserve valid relative links to `docs/` and exact `pnpm --filter @arth/*` commands.
