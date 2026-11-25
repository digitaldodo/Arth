# Module B — Safe-to-Spend & Cash-Flow Decision Engine

- **Assigned Developer:** Arun Kushwah
- **Student Roll Number:** `2315000441`
- **Module Purpose:** Provide a deterministic, explainable Safe-to-Spend calculation until the next expected income, accounting for available balances, expected income, unpaid bills, remaining essential spending forecast, existing EMIs, scheduled savings, and cash buffer without double-counting.

---

## Current Implementation Status

- **UI:** Placeholder only (`TransactionAppShell.tsx` renders `<FeatureComingSoon title="Safe to Spend" ... />`).
- **Domain:** Scaffold only in `packages/financial-modules/src/modules/safe-to-spend/` and `spending-forecast/` (`financialModuleFlags.safeToSpend = false`, `financialModuleFlags.spendingForecast = false`).
- **Backend / DB:** Missing. No `cash_flow_commitments` table or Safe-to-Spend API endpoints exist.

---

## Directories

### Existing Source Directories Reused
- `packages/financial-modules/src/modules/safe-to-spend/`
- `packages/financial-modules/src/modules/spending-forecast/`

### New Directories Prepared
- `frontend/src/features/safe-to-spend/`
- `frontend/src/features/spending-forecast/`
- `backend/src/modules/safe-to-spend/`
- `backend/src/modules/spending-forecast/`
- `frontend/src/app/api/backend/planning/safe-to-spend/`
- `frontend/src/app/api/backend/planning/spending-forecast/`

---

## File Ownership & Restrictions

### Files Exclusively Owned
- `packages/financial-modules/src/modules/safe-to-spend/**`
- `packages/financial-modules/src/modules/spending-forecast/**`
- `frontend/src/features/safe-to-spend/**` and `frontend/src/features/spending-forecast/**`
- `backend/src/modules/safe-to-spend/**` and `backend/src/modules/spending-forecast/**`
- `frontend/src/app/api/backend/planning/safe-to-spend/**` and `frontend/src/app/api/backend/planning/spending-forecast/**`
- `supabase/migrations/0041_*.sql`

### Files That Must Not Be Changed
- `backend/src/modules/balances/**`, `backend/src/modules/transactions/**`, `backend/src/plugins/auth.ts`
- Modules A, C, D, and E directories
- `frontend/src/features/transactions/TransactionAppShell.tsx` (Integration Lead swaps `<FeatureComingSoon>` via PR)

---

## Shared Dependencies & API Contracts

- **Shared Dependencies:** `@arth/contracts`, `@spendsense/financial-modules/shared/contracts.ts`, read-only balance/transaction queries, Module C (`EmiCommitmentProvider`), Module D (`GoalCommitmentProvider`).
- **API Contracts:** See [API_CONTRACT.md](./API_CONTRACT.md).

---

## Database Ownership & Migration Allocation

- **Tables Owned:** `public.cash_flow_commitments` (planned in `0041`: expected income schedules, recurring/one-off unpaid bills, target cash buffer paise, pay-cycle config with RLS).
- **Read-Only Tables:** `public.transactions`, `public.profiles`, `public.balance_movements`, `public.transaction_links`.
- **Migration Allocation:** Slot `0041`.

---

## Test Responsibility & Acceptance Criteria

- **Test Responsibility:** See [TESTING.md](./TESTING.md).
- **Acceptance Criteria:**
  1. Deterministic BigInt/paise calculation matches `AvailableBalance + ExpectedIncome - UnpaidBills - RemainingEssentialForecast - ActiveEMIs - ScheduledGoalSavings - CashBuffer`.
  2. Double-counting protection proven: bills/EMIs/goal contributions already paid in the active cycle are excluded with an itemized audit list.
  3. Essential expenditure forecast uses transparent rolling/median historical rules with explicit uncertainty range.
  4. Interactive UI displays every assumption, step-by-step breakdown, and what-if adjustments.
- **Integration Dependencies:** Consumes Module A recurring series, Module C EMI obligations, and Module D goal contributions; exposes `CashFlowBaseline` to Modules C & D.
