# Module C — Testing Plan

**Owner:** Akshat Kumar (`2315000205`)

## Existing Tests Maintained
- `packages/financial-modules/src/modules/emi-affordability/tests/contract.test.ts`

## New Tests Required
1. **Domain Math & Stress Tests**:
   - Standard reducing-balance EMI accuracy vs. reference cases (including `0%` APR zero-interest edge case, 1-month tenure, and 360-month home loan).
   - FOIR calculation, remaining cash, and `comfortable` / `stretched` / `unsustainable` boundary transitions.
   - Interest rate stress (`+100/+200 bps`) and income drop (`-15%/-25%`) scenarios.
   - Input validation rejecting negative principal/rate/tenure or zero income.
2. **Backend API & RLS Tests (`backend/tests/emi-affordability.test.ts`)**:
   - `loan_obligations` CRUD validation and user isolation.
   - `POST /api/v1/planning/emi-affordability/evaluate` contract tests.
3. **Frontend Component Tests**:
   - Scenario comparison table, existing loan form validation, and assumption display.
