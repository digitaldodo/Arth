# Module E — Tax Planning, Capital Gains & Document Verification

- **Assigned Developer:** Dev Chaudhary
- **Student Roll Number:** `2315000708`
- **Module Purpose:** Complete the deterministic Old vs. New Tax Regime comparison UI, tax profile management, Capital Gains tax estimation for supported investments, Form 16/AIS/26AS/interest/investment statement extraction adapters, cross-document discrepancy reconciliation, and tax readiness checklist—without implementing tax-return filing.

---

## Current Implementation Status

- **Document Intake (Shared Dependency):** Implemented and verified in `backend/src/modules/documents/` and `frontend/src/features/tax/DocumentsTaxCentre.tsx`.
- **Tax Engine:** Implemented and unit-tested (`backend/src/modules/tax/tax-engine.ts`, `tax-rules.ts`, `tax-deductions.ts`), **but `taxRoutes` (`tax.routes.ts`) is NOT registered in `backend/src/app.ts` and contains colliding document/import routes**.
- **Capital Gains:** Missing (`specialRateIncomeRupees > 0n` returns `'unsupported'` in `tax-engine.ts`).
- **Tax UI & Reconciliation:** Missing/unwired — no UI calls `/api/v1/tax/estimate` or `/api/v1/tax/profiles`; `tax-readiness.ts`, `tax-document-review.ts`, and `ledger-tax-reconciliation.ts` exist as tested utilities but are unused in `DocumentsTaxCentre.tsx`.

---

## Directories

### Existing Source Directories Reused
- `backend/src/modules/tax/`
- `backend/src/modules/documents/` *(read-only consumer via existing API — do NOT modify)*
- `frontend/src/features/tax/`
- `packages/financial-modules/src/modules/tax-calculation/`

*(Note: `frontend/src/features/documents/` does not exist and is intentionally omitted because `frontend/src/features/tax/` already houses `DocumentsTaxCentre.tsx`.)*

### New Directories Prepared
- `backend/src/modules/tax/capital-gains/`
- `backend/src/modules/tax/reconciliation/`
- `frontend/src/features/tax/regime-comparison/`
- `frontend/src/features/tax/capital-gains/`
- `frontend/src/features/tax/reconciliation/`
- `frontend/src/features/tax/readiness/`
- `frontend/src/app/api/backend/tax/`

---

## File Ownership & Restrictions

### Files Exclusively Owned
- `backend/src/modules/tax/**`
- `packages/financial-modules/src/modules/tax-calculation/**`
- `frontend/src/features/tax/**`
- `frontend/src/app/api/backend/tax/**`

### Files That Must Not Be Changed
- `backend/src/modules/documents/**` *(must NOT register duplicate `/api/v1/financial/documents*` handlers or alter document intake storage)*
- `backend/src/modules/transactions/**`, `backend/src/modules/financial-imports/**`
- Modules A, B, C, and D directories

---

## Shared Dependencies & API Contracts

- **Shared Dependencies:** `documentsRoutes` (`/api/v1/financial/documents*`), Core Ledger (`GET /api/v1/transactions`), `@arth/contracts`.
- **API Contracts:** See [API_CONTRACT.md](./API_CONTRACT.md).

---

## Database Ownership & Migration Allocation

- **Tables Owned:** `public.tax_profiles` (`0028`).
- **Read-Only Tables:** `public.financial_documents`, `public.tax_extracted_fields`, `public.transactions`.
- **Migration Allocation:** No new migration assumed; inspect `0028_financial_documents_accounts_and_tax.sql` first. If schema changes are later required, request a slot (`0044+`) from the Integration Lead.

---

## Test Responsibility & Acceptance Criteria

- **Test Responsibility:** See [TESTING.md](./TESTING.md).
- **Acceptance Criteria:**
  1. `tax.routes.ts` cleaned of `/api/v1/financial/*` collisions and registered in `backend/src/app.ts` via Integration Lead.
  2. Old vs. New Regime Comparison UI works end-to-end with verified document auto-fill, `tax_profiles` persistence, assumptions, and statutory citations.
  3. Deterministic Capital Gains calculation implemented for supported investments (STCG 111A, LTCG 112A equity/MF, and supported debt/FD/gold rules) with versioned rules.
  4. Cross-document reconciliation flags discrepancies (Form 16 vs. AIS vs. Form 26AS vs. interest/investment statements vs. ledger credits) with clear explanations.
  5. Tax readiness checklist (`tax-readiness.ts`) and summary export live in UI; explicitly states SpendSense does not file returns.
- **Integration Dependencies:** Integration Lead for registering cleaned `taxRoutes` in `app.ts`; consumes `documentsRoutes` & ledger credits read-only.
