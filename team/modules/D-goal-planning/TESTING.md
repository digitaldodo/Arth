# Module D — Testing Plan

**Owner:** Ayush Chaudhary (`2315000536`)

## Existing Tests Maintained
- `packages/financial-modules/src/modules/goal-planner/tests/contract.test.ts`
- `packages/financial-modules/src/modules/purchase-simulator/tests/contract.test.ts`

## New Tests Required
1. **Domain Unit Tests**:
   - Goal progress, shortfall, and completion date calculation across priority tiers `1`, `2`, and `3`.
   - Zero-contribution / unattainable target date handling without `Infinity` or `NaN`.
   - Cash purchase counterfactual: liquidity drawdown + monthly contribution diversion + exact delay months.
   - EMI purchase counterfactual: calls mocked `EmiSimulatorProvider` and applies monthly EMI drag across selected goals.
2. **Backend API & RLS Tests (`backend/tests/goals.test.ts`)**:
   - `financial_goals` & `goal_contributions` CRUD validation, negative-amount rejection, cross-user RLS isolation.
3. **Frontend Component Tests**:
   - Goal list, contribution entry, and baseline vs. purchase comparison rendering.
