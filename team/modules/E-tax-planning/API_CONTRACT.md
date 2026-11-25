# Module E — API & Provider Contract

**Owner:** Dev Chaudhary (`2315000708`)

## 1. Endpoints Owned (via `backend/src/modules/tax/tax.routes.ts`)

*(Prerequisite: remove colliding `/api/v1/financial/documents*` and Module A's `/api/v1/financial/{accounts,import-batches,transaction-links}` handlers from `tax.routes.ts` before registering in `app.ts`.)*

- `GET /api/v1/tax/profiles`
- `PUT /api/v1/tax/profiles`
- `POST /api/v1/tax/estimate` *(extend to support verified document links & capital gains summary)*
- `POST /api/v1/tax/capital-gains` *(new: deterministic STCG/LTCG for supported asset classes)*
- `GET /api/v1/tax/reconcile?period=AY2026-27` *(new: cross-document & ledger discrepancy analysis)*

### `POST /api/v1/tax/capital-gains` (Proposed)
- **Request:**
  ```json
  {
    "period": "AY2026-27",
    "framework": "income_tax_act_1961",
    "entries": [
      {
        "assetClass": "listed_equity_or_equity_mf",
        "acquisitionDate": "2024-01-10",
        "disposalDate": "2026-02-15",
        "purchaseCostRupees": "500000",
        "saleConsiderationRupees": "750000",
        "transferExpensesRupees": "1500"
      }
    ]
  }
  ```
- **Response (`200 OK`):**
  ```json
  {
    "period": "AY2026-27",
    "stcg111ARupees": "0",
    "ltcg112ARupees": "248500",
    "ltcgExemptionAppliedRupees": "125000",
    "estimatedCapitalGainsTaxRupees": "15438",
    "breakdown": [{ "assetClass": "listed_equity_or_equity_mf", "term": "long_term", "gainRupees": "248500", "ratePercent": 12.5, "ruleCitation": "..." }],
    "assumptions": ["..."]
  }
  ```
- **Errors:** `400 Bad Request` on invalid dates (`disposalDate < acquisitionDate`), negative amounts, or unsupported asset class; `401 Unauthorized`.

## 2. Consumed Contracts (Read-Only)
- `GET /api/v1/financial/documents` & `/fields` (`documentsRoutes`) — only `verification_status === 'verified'` fields substantiate estimates.
- `GET /api/v1/transactions` — period-bounded income credits (`taxYearDateRange(ruleset)`).
