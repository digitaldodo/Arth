# Module E — Testing Plan

**Owner:** Dev Chaudhary (`2315000708`)

## Existing Tests Maintained
- `backend/tests/tax-engine.test.ts`
- `backend/tests/official-tax-calculator.test.ts`
- `backend/tests/statement-batch-validation.test.ts` *(coordinate move with Module A if batch validation moves to `financial-imports`)*
- `frontend/tests/document-classifier.test.ts`
- `frontend/tests/document-extractor.test.ts`
- `frontend/tests/document-form-adapters.test.ts`
- `frontend/tests/ledger-tax-reconciliation.test.ts`
- `frontend/tests/tax-document-review.test.ts`
- `frontend/tests/tax-readiness.test.ts`
- `packages/financial-modules/src/modules/tax-calculation/tests/contract.test.ts`

## New Tests Required
1. **Tax HTTP Route Tests (`backend/tests/tax-routes.test.ts`)**: `/api/v1/tax/estimate`, `/api/v1/tax/profiles`, `/api/v1/tax/capital-gains`, `/api/v1/tax/reconcile` with JWT auth & validation error assertions.
2. **Capital Gains Benchmark Tests**: STCG vs. LTCG holding-period thresholds, Section 111A / 112A rates and exemption caps across `AY2024-25`–`TY2026-27`, and unsupported asset rejection.
3. **Cross-Document Reconciliation Tests**: Form 16 vs. AIS vs. Form 26AS vs. interest statement mismatch detection and explanation output.
4. **Extraction Adapter Fixtures**: `capital_gains`, `investment_statement`, and `fd_interest`/`savings_interest` document fixtures.
