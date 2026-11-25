# Module C — EMI Affordability & Stress Testing

- **Assigned Developer:** Akshat Kumar
- **Student Roll Number:** `2315000205`
- **Module Purpose:** Provide deterministic reducing-balance EMI calculations, existing EMI obligation tracking, FOIR affordability assessment, and baseline vs. stressed scenarios (interest-rate hikes and income drops) with transparent assumptions.

---

## Current Implementation Status

- **UI:** Placeholder only (`TransactionAppShell.tsx` `emi-planner` tab renders `<FeatureComingSoon title="EMI Stress Test & Prepayment Planner" ... />`).
- **Domain:** Scaffold only in `packages/financial-modules/src/modules/emi-affordability/` (`financialModuleFlags.emiAffordability = false`).
- **Backend / DB:** Missing. No `loan_obligations` table or EMI API endpoints exist.

---

## Directories

### Existing Source Directories Reused
- `packages/financial-modules/src/modules/emi-affordability/`

### New Directories Prepared
- `frontend/src/features/emi-affordability/` *(note: `TransactionAppShell.tsx`'s `emi-planner` tab will dynamically import `@/features/emi-affordability/` at integration time—do not create a duplicate `emi-planner/` directory)*
- `backend/src/modules/emi-affordability/`
- `frontend/src/app/api/backend/planning/emi-affordability/`

---

## File Ownership & Restrictions

### Files Exclusively Owned
- `packages/financial-modules/src/modules/emi-affordability/**`
- `frontend/src/features/emi-affordability/**`
- `backend/src/modules/emi-affordability/**`
- `frontend/src/app/api/backend/planning/emi-affordability/**`
- `supabase/migrations/0042_*.sql`

### Files That Must Not Be Changed
- Modules A, B, D, and E implementation files
- `backend/src/modules/transactions/**`, `backend/src/modules/balances/**`, `backend/src/plugins/auth.ts`
- `frontend/src/features/transactions/TransactionAppShell.tsx` (Integration Lead swaps dynamic import)

---

## Shared Dependencies & API Contracts

- **Shared Dependencies:** `@arth/contracts` (paise utilities), `@spendsense/financial-modules/shared/contracts.ts`, Module B `CashFlowBaseline` contract.
- **API Contracts:** See [API_CONTRACT.md](./API_CONTRACT.md). Exposes `EmiCommitmentProvider` to Module B and `EmiSimulatorProvider` to Module D.

---

## Database Ownership & Migration Allocation

- **Tables Owned:** `public.loan_obligations` (planned in `0042`: lender, loan type, principal paise, annual rate basis points, monthly EMI paise, remaining months, rate type, RLS).
- **Read-Only Tables:** `public.transactions`, `public.profiles`.
- **Migration Allocation:** Slot `0042`.

---

## Test Responsibility & Acceptance Criteria

- **Test Responsibility:** See [TESTING.md](./TESTING.md).
- **Acceptance Criteria:**
  1. Exact reducing-balance EMI, total interest, and total repayment calculations verified against standard banking formulas in integer paise (0% interest edge case included).
  2. Computes FOIR and remaining monthly cash after existing EMIs and essentials.
  3. Baseline vs. stress scenarios (e.g., `+100 bps`, `+200 bps` rate shocks and `-15%`, `-25%` income drops) with emergency fund runway and clear sustainability classification.
  4. Interactive UI displays every assumption and exposes the simulation contract for Module D.
- **Integration Dependencies:** Consumes `CashFlowBaseline` from Module B (or user-provided manual income/essentials override); exposes EMI contracts to Modules B & D.
