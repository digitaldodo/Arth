# Module A — Testing Plan

**Owner:** Ansh Gupta (`2315000330`)

## Existing Tests Maintained
- `frontend/tests/statement-import-parser.test.ts` *(currently 4 failing tests to fix)*
- `frontend/tests/statement-ocr.test.ts` *(currently 1 failing test to fix)*
- `frontend/tests/statement-bank-fixtures.test.ts`
- `frontend/tests/statement-import-redesign.test.ts`
- `frontend/tests/statement-import-trim-robustness.test.ts`
- `frontend/tests/statement-skip-history.test.ts`
- `frontend/tests/historical-statement-reconciliation.test.ts`
- `frontend/tests/reconciliation.test.ts`
- `frontend/tests/upi-parser.test.ts`
- `frontend/tests/categorization-pipeline.test.ts`
- `frontend/tests/layered-categorization.test.ts`
- `frontend/tests/recurring-payment-detection.test.ts`
- `frontend/tests/multi-source-transaction-intelligence.test.ts`
- `packages/financial-modules/src/modules/personalized-categories/tests/contract.test.ts`
- `packages/financial-modules/src/modules/recurring-payments/tests/contract.test.ts`
- `ml/transaction-categorization/test_pipeline.py`

## New Tests Required
1. **Backend Route Tests (`backend/tests/financial-imports.test.ts`)**: accounts, import-batches, undo, and transaction-links routes under `verifyAuth` + RLS isolation.
2. **Merchant Rules Persistence Tests (`backend/tests/merchant-rules.test.ts`)**: CRUD, cross-user isolation, composite category FK validation.
3. **ML Evaluation & Inference Tests**: temporal holdout evaluation verifying no data leakage, abstention behavior on conflicting signals, and `/api/v1/categorization/suggest` schema validation.
