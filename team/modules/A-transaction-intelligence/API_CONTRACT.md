# Module A — API & Provider Contract

**Owner:** Ansh Gupta (`2315000330`)

## 1. Endpoints Owned

### 1.1 Financial Imports & Reconciliation (migrated out of `tax.routes.ts`)
- `GET /api/v1/financial/accounts` & `POST /api/v1/financial/accounts`
- `GET /api/v1/financial/import-batches`, `POST /api/v1/financial/import-batches`, `POST /api/v1/financial/import-batches/:id/undo`
- `GET /api/v1/financial/transaction-links`, `POST /api/v1/financial/transaction-links`, `POST /api/v1/financial/transaction-links/:id/reject`

### 1.2 Merchant Rules (PostgreSQL `public.merchant_rules`)
- `GET /api/v1/financial/merchant-rules`
- `PUT /api/v1/financial/merchant-rules`
- `DELETE /api/v1/financial/merchant-rules/:id`

### 1.3 ML Categorization Suggestion (`POST /api/v1/categorization/suggest`)
- **Request:**
  ```json
  {
    "narration": "UPI-SWIGGY-ORDER@ICICI-123456789012",
    "cleanMerchant": "Swiggy",
    "amountPaise": 45000,
    "type": "expense"
  }
  ```
- **Response (`200 OK`):**
  ```json
  {
    "categoryId": "uuid-or-null",
    "categoryName": "Food & Dining",
    "necessity": "optional",
    "confidence": 0.92,
    "method": "anchored_fasttext",
    "modelVersion": "fasttext-hybrid-v1",
    "evidence": [{ "source": "Merchant alias / FastText", "detail": "..." }],
    "needsConfirmation": false
  }
  ```
- **Errors:** `400 Bad Request` (invalid type/narration), `401 Unauthorized`.

## 2. Internal Domain Contracts Exposed to Modules B–E

- Normalized `TransactionDTO` (`@arth/contracts/src/transactions.ts`) with integer `amount_paise`, `type`, `category_id`, `necessity`, `ingestion_source`, `account_id`.
- `RecurringPayments.Provider` (`packages/financial-modules/src/modules/recurring-payments/`) wrapping `recurring-detector.ts` to supply detected EMI/utility/subscription series to Module B & C without duplicating recurrence math.

## 3. Proposed Shared Contract Changes

Any changes to `TransactionDTO` or `CategorizationMethod` must be proposed here first and merged through `@arth/contracts` by the Integration Lead.
