# Module B — Testing Plan

**Owner:** Arun Kushwah (`2315000441`)

## Existing Tests Maintained
- `packages/financial-modules/src/modules/safe-to-spend/tests/contract.test.ts`
- `packages/financial-modules/src/modules/spending-forecast/tests/contract.test.ts`

## New Tests Required
1. **Domain Unit Tests**:
   - Exact integer-paise Safe-to-Spend arithmetic across positive, zero, and deficit (`< 0`) headroom scenarios.
   - Double-counting prevention: matching a paid bill, paid EMI, or recorded goal transfer in the active pay cycle removes it from remaining deductions.
   - Confirmed internal transfers (`transaction_links`) excluded from essential spend forecast.
   - `spending-forecast` uncertainty bounds and insufficient-history fallback (`unavailable`).
2. **Backend API & RLS Tests (`backend/tests/safe-to-spend.test.ts`)**:
   - `cash_flow_commitments` CRUD validation (non-negative paise, valid IST dates, auth isolation).
   - Migration `0041` RLS & constraint verification.
3. **Frontend Component Tests**:
   - Safe-to-Spend waterfall rendering, assumption disclosure, and commitment form validation.
