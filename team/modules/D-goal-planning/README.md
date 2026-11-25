# Module D — Goal Planning & Purchase Simulation

- **Assigned Developer:** Ayush Chaudhary
- **Student Roll Number:** `2315000536`
- **Module Purpose:** Enable deterministic savings goal tracking, priority-based contribution planning, and counterfactual purchase simulation (both lump-sum cash and EMI-financed) showing savings contribution impact, goal progress, and recalculated completion dates.

---

## Current Implementation Status

- **UI:** Placeholder only (`TransactionAppShell.tsx` `goal-planner` tab renders `<FeatureComingSoon title="Financial Goal Planner" ... />`).
- **Domain:** Scaffold only in `packages/financial-modules/src/modules/goal-planner/` and `purchase-simulator/` (`financialModuleFlags.goalPlanner = false`, `financialModuleFlags.purchaseSimulator = false`).
- **Backend / DB:** Missing. No `financial_goals` or `goal_contributions` tables or endpoints exist.

---

## Directories

### Existing Source Directories Reused
- `packages/financial-modules/src/modules/goal-planner/`
- `packages/financial-modules/src/modules/purchase-simulator/`

### New Directories Prepared
- `frontend/src/features/goal-planner/`
- `frontend/src/features/purchase-simulator/`
- `backend/src/modules/goal-planner/`
- `backend/src/modules/purchase-simulator/`
- `frontend/src/app/api/backend/planning/goals/`
- `frontend/src/app/api/backend/planning/purchase-simulate/`

---

## File Ownership & Restrictions

### Files Exclusively Owned
- `packages/financial-modules/src/modules/goal-planner/**` and `purchase-simulator/**`
- `frontend/src/features/goal-planner/**` and `purchase-simulator/**`
- `backend/src/modules/goal-planner/**` and `purchase-simulator/**`
- `frontend/src/app/api/backend/planning/goals/**` and `frontend/src/app/api/backend/planning/purchase-simulate/**`
- `supabase/migrations/0043_*.sql`

### Files That Must Not Be Changed
- Modules A, B, C, and E implementation files
- `backend/src/modules/balances/**`, `backend/src/modules/transactions/**`, `backend/src/plugins/auth.ts`
- `frontend/src/features/transactions/TransactionAppShell.tsx` (Integration Lead wires dynamic import)

---

## Shared Dependencies & API Contracts

- **Shared Dependencies:** `@arth/contracts`, `@spendsense/financial-modules/shared/contracts.ts`, Module B (`SafeToSpend` / `CashFlowBaseline`), Module C (`EmiSimulatorProvider` for EMI-backed purchase simulations).
- **API Contracts:** See [API_CONTRACT.md](./API_CONTRACT.md). Exposes `GoalCommitmentProvider` to Module B.

---

## Database Ownership & Migration Allocation

- **Tables Owned:** `public.financial_goals` and `public.goal_contributions` (planned in `0043`, enforcing integer-paise amounts, priority tiers `1..3`, and RLS).
- **Read-Only Tables:** `public.transactions`, `public.profiles`.
- **Migration Allocation:** Slot `0043`.

---

## Test Responsibility & Acceptance Criteria

- **Test Responsibility:** See [TESTING.md](./TESTING.md).
- **Acceptance Criteria:**
  1. Full goal CRUD + contribution logging with progress %, shortfall, and projected completion dates.
  2. Counterfactual purchase simulation (cash vs. EMI via Module C) deterministically computes reduced monthly contributions, delay in months, and revised goal completion dates.
  3. Side-by-side baseline vs. purchase scenario comparison rendered in UI with assumptions clearly stated.
- **Integration Dependencies:** Consumes Module B liquidity/Safe-to-Spend and Module C EMI simulation; exposes scheduled goal savings commitments to Module B.
