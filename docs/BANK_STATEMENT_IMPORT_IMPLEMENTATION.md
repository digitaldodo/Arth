# SpendSense — Bank Statement Import & Consolidated Ledger Implementation Report

**Date:** November 21, 2026  
**Engineering Domain:** Fintech Product Engineering, Local-First Persistence, PDF Spatial Parsing, Transaction Intelligence  
**Author:** SpendSense Engineering Team  

---

## 1. Executive Summary

SpendSense provides Indian personal finance intelligence operating on a **single consolidated personal Ledger**. Every user transaction—whether entered manually via Quick Add, captured automatically via native Android SMS listeners, or imported from electronic bank statements (PDF, CSV, XLSX, XLS)—belongs to one consolidated personal financial history.

This engineering implementation audited, overhauled, and completed the Bank Statement Import capability with strict adherence to **financial correctness**, **extraction accuracy**, **schema flexibility**, and **Ledger Minimal UI design**:

1. **Closing Balance Ingestion Defense:** Eliminated a critical financial integrity flaw where closing balances or opening balances were misclassified as transactions. Implemented spatial column-aware PDF extraction and strict metadata exclusion regexes. Opening and closing balances are computed and verified exclusively for statement reconciliation and are **never** imported as ledger transactions.
2. **Strict Debit vs Credit Disambiguation:** Standardized two-column extraction (Withdrawal vs Deposit). Zero-amount cells, hyphens, and empty cells are ignored. Conflicting rows with amounts in both columns are flagged for user review.
3. **Multi-Line Narration & Reference Reconstruction:** Statement rows with continuation text or split lines are joined into their parent transaction without dropping information. Alphanumeric UPI references, UTRs, and RRNs are extracted without confusing merchant names (e.g. `UPI-FLIPKART`) for reference IDs.
4. **Optional Categorization & Necessity (Migration 0037):** Decoupled statement importing from mandatory category selection. Users can commit unclassified transactions (`category_id: null`, `necessity: null`) directly into their consolidated ledger. Updated database constraints, migration definitions, RPC functions, and backend services to support nullable categories.
5. **Review UI Redesign (Ledger Minimal):** Replaced cluttered 7-form-input cards with an elegant desktop table (`Date | Narration | Type | Amount | Category & Necessity | Status | Actions`) and compact mobile cards. Expanded row editing is available on demand via quick toggles. Added a dedicated Statement Balance & Reconciliation card.
6. **Consolidated Ledger Ingestion:** Guaranteed all imported transactions commit with `account_id: null` and `ingestion_source: 'bank_statement'`.

---

## 2. Root Cause Analysis of Previous Defects

### 2.1 Closing Balance Ingestion as a Transaction
- **Root Cause:** In `StatementImport.tsx`, PDF text was previously split using naive whitespace splitting: `line.split(/\s{2,}/)`. In statements where a transaction had an empty Withdrawal Amt (e.g., a deposit), the Deposit Amt shifted left into the Withdrawal slot (index 4) and the Closing Balance shifted into the Deposit slot (index 5), causing the closing balance to be ingested as an Income transaction.
- **Root Cause in Row Filtering:** Summary rows containing "OPENING BALANCE", "CLOSING BALANCE", or "TOTAL WITHDRAWALS" lacked strict exclusion regexes and were parsed as transactions if a date was matched anywhere on the line.

### 2.2 Mandatory Category Blocking Ingestion
- **Root Cause:** Migration `0003_core_schema.sql` defined `category_id UUID NOT NULL REFERENCES categories(id)`. Migration `0013` added constraint `chk_transactions_necessity CHECK (type = 'income' AND necessity IS NULL) OR (type = 'expense' AND necessity IN ('essential', 'optional', 'luxury'))`.
- In addition, `StatementImport.tsx` executed:
  `if (selectedRows.some((row) => !categoriesById.has(row.categoryId))) { setError('Choose a valid category for every selected row before importing.'); return; }`
  This created high user friction during large statement imports, forcing users to categorize dozens of transactions before committing.

### 2.3 UI Crowding
- **Root Cause:** Every row previously rendered 7 full form inputs (Date, Description, Amount, Direction, Category, Necessity, Channel) inside an individual card box. On a 50-row statement, this presented over 350 visible inputs simultaneously, causing visual fatigue and layout overflow.

---

## 3. Engineering Implementation Details

### 3.1 Database Migration `0037_optional_category_and_necessity.sql`

```sql
-- Make category_id nullable
ALTER TABLE public.transactions
  ALTER COLUMN category_id DROP NOT NULL;

-- Relax necessity constraint on expenses
ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS chk_transactions_necessity;

ALTER TABLE public.transactions
  ADD CONSTRAINT chk_transactions_necessity CHECK (
    (type = 'income' AND necessity IS NULL) OR
    (type = 'expense' AND (necessity IS NULL OR necessity IN ('essential', 'optional', 'luxury')))
  );

-- Update fn_dashboard_summary to LEFT JOIN categories and handle unclassified expenses
CREATE OR REPLACE FUNCTION public.fn_dashboard_summary(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
...
$$;
```

### 3.2 Spatial Table Extractor (`extractTableFromPdfItems`)

Implemented in `frontend/src/features/imports/statement-parser.ts`:
- Groups PDF text items by line using Y-coordinate clustering (3pt tolerance).
- Identifies table headers (`Date`, `Narration`, `Chq./Ref.No.`, `Value Dt`, `Withdrawal Amt.`, `Deposit Amt.`, `Closing Balance`).
- Computes spatial X-coordinate midpoints between adjacent column headers (`columnBoundaries`).
- Maps data items into columns based on their horizontal midpoint `midX`.
- Guarantees that empty withdrawal cells remain strictly empty, anchoring deposit and closing balance values to their true columns regardless of missing adjacent cells.

### 3.3 Enhanced Reference & Narration Parser
- `STATEMENT_METADATA_REGEX`: Identifies opening/closing balances, running balances, statement periods, GSTIN, IFSC, branch details, and summary rows, cleanly bypassing them as transactions while extracting statement-level opening and closing balances for reconciliation.
- Multi-line continuation: Automatically appends non-dated subsequent lines to the preceding transaction's description.
- Reference regex: Uses `/(?:(?:ref(?:erence)?|utr|rrn|chq|cheque)[:\s/=-]+|upi\/(?:cr|dr)\/)([a-zA-Z0-9]{6,30})/i` to cleanly extract UPI RRNs and bank UTRs while ignoring merchant name prefixes (e.g. `UPI-FLIPKART`).

### 3.4 Review UI Overhaul (`StatementImport.tsx`)

- **Standalone Statement Balance & Reconciliation Card:**
  - Displays Opening Balance, Total Withdrawals (-₹), Total Deposits (+₹), and Closing Balance.
  - Computes `Expected Closing = Opening + Total Deposits - Total Withdrawals`.
  - Displays `✓ Reconciled (Difference: ₹0.00)` badge or exact discrepancy.
  - Highlights financial integrity notice: opening and closing balances are verified exclusively for statement math and are **never** imported into the ledger.
- **Desktop Table View (`hidden md:block`):**
  - Columns: Checkbox, Date, Narration/Description (with ref badge and value date), Type pill, Amount (-₹/+₹ font-mono), Category & Necessity, Status badge, and Edit action.
  - Expandable drawer for row editing: Date, Description, Amount, Direction, Category (with "Uncategorized" default), Necessity (with "Unclassified" default), Payment Channel, Reference/UTR, and raw narration inspection.
- **Mobile Cards View (`block md:hidden`):**
  - Compact cards with checkbox, 2-line clamped title, bold amount, metadata chip row (Date, Type, Category, Status), and expand toggle button.
- **Commit Action:**
  - Labeled `Import selected transactions (${selectedRows.length})`.
  - Imports transactions uncategorized (`category_id: null`, `necessity: null`) without validation errors.

---

## 4. Verification & Test Suite

### 4.1 Automated Test Execution

1. **HDFC Statement Accuracy Suite (`frontend/tests/hdfc-statement-accuracy.test.ts`):**
   - Subtest 1: Balance Ingestion Defense: Opening, Closing, and Summary Balances are NEVER imported as transactions. (Pass)
   - Subtest 2: Strict Debit and Credit Column Disambiguation without Floating Point Errors. (Pass)
   - Subtest 3: Spatial Table Extractor: Prevents Column Shift from Missing Cells. (Pass)
   - Subtest 4: Multi-Line Narration Reconstruction and Reference Extraction. (Pass)
   - Subtest 5: Metadata and Summary Exclusions: Never treat statement summary rows as transactions. (Pass)
   - Subtest 6: Optional Category & Necessity: Transactions default to null necessity and unclassified category. (Pass)

2. **Consolidated Statement Import Suites:**
   - `frontend/tests/statement-bank-fixtures.test.ts`: 14 / 14 passed.
   - `frontend/tests/statement-import-parser.test.ts`: 15 / 15 passed.
   - `frontend/tests/bank-statement-import-consolidated-ledger.test.ts`: 6 / 6 passed.
   - `frontend/tests/hdfc-statement-accuracy.test.ts`: 6 / 6 passed.
   - **Total Parser Tests:** 41 / 41 passed.

3. **Backend Test Suite (`@arth/backend`):**
   - 228 / 228 passed across 23 test suites (including schema integrity audit with migration `0037`, transaction services, RLS, and dashboard aggregation).

4. **Frontend Test Suite (`@arth/frontend`):**
   - 656 / 656 passed across 159 test suites.

5. **Monorepo Recursive Typecheck (`pnpm typecheck`):**
   - 0 TypeScript errors across `@arth/contracts`, `@arth/backend`, and `@arth/frontend`.

6. **Monorepo Production Build (`pnpm build`):**
   - Compiled successfully; all 37 dynamic and static routes built; service worker generated.

---

## 5. Summary Matrix of Requirements

| Requirement | Implementation & Behavior | Status |
|---|---|:---:|
| **Closing Balance Protection** | Closing balance never becomes a transaction; extracted only for reconciliation | ✅ Verified |
| **Debit/Credit Mapping** | Withdrawal = expense; Deposit = income; missing cells do not shift columns | ✅ Verified |
| **Multi-line Narration** | Continuation lines joined into single transaction; references preserved | ✅ Verified |
| **Optional Categorization** | Nullable `category_id` and nullable `necessity` on expense transactions | ✅ Verified |
| **Desktop Table UI** | Scannable table with expandable drawer replacing 7-form-input cards | ✅ Verified |
| **Mobile Compact UI** | Compact cards (<768px) with expandable editing drawer | ✅ Verified |
| **Reconciliation Card** | Standalone card displaying opening, closing, debits, credits, and match math | ✅ Verified |
| **Consolidated Ledger** | All transactions committed with `account_id: null` | ✅ Verified |
| **Privacy & Security** | Ephemeral password handling; passwords never logged or persisted | ✅ Verified |
| **Ledger Visibility & Outbox Merge** | Un-synced IndexedDB items merged into ledger state; visible immediately | ✅ Verified |
| **Multi-Format Date Extraction** | Supports DD/MM/YYYY, DD-MMM-YYYY, Excel serials, leap years, value date fallback | ✅ Verified |
| **Re-Upload Deduplication** | SHA-256 file hash + reference + composite fingerprint across local and server | ✅ Verified |
| **Batch Accounting Equality** | `detected === imported + skipped` holds mutually exclusive with zero contradictions | ✅ Verified |
| **Sync Separation & Trigger Defense** | Batches pre-created to satisfy FK trigger; import status separate from cloud sync | ✅ Verified |
| **Retry Sync & Safe Undo** | Functional queue drain retry; atomic undo cleans server, outbox, and local stores | ✅ Verified |

---

## 6. Ledger Persistence, Date Accuracy, Duplicate Prevention & Batch Synchronization Resolution

### 6.1 Root Cause Analysis

#### A. Why Imported Transactions Did Not Appear in the Ledger
1. **Desktop Ledger Overwrite Flaw:** In `frontend/src/features/transactions/TransactionLedger.tsx` (desktop mode `!isPwa`), `loadTransactions()` queried `/api/backend/transactions`. When transactions were pending cloud sync or when the Fastify backend was offline, the server returned only previously synced items. `setTransactions(items)` directly replaced the React state with the server response, completely ignoring local IndexedDB transactions pending synchronization.
2. **Missing BFF POST Fallback:** In `frontend/src/app/api/backend/transactions/route.ts`, the `GET` route contained a direct Supabase fallback, but the `POST` route had no fallback. If the Fastify service was unreachable or returned 5xx, `POST /api/backend/transactions` failed with 502 Bad Gateway.
3. **Foreign Key Trigger Violation (`fk_statement_import_item_batch_owner`):** Migration `0030` created trigger `trg_snapshot_statement_import_item`, which inserts into `statement_import_batch_items` on every transaction insertion with an `import_batch_id`. If `statement_import_batches` did not already contain a row for `(id = import_batch_id, user_id)`, the transaction insert failed with a foreign key violation.
4. **Validation Rejection of Skipped Rows:** In `StatementImport.tsx`, `skipped_rows` previously contained rows with `amount_paise === '0'`. Because backend validation required `amountPaise > 0n`, the batch header creation request was rejected with 400 Bad Request, causing subsequent transaction syncs to fail.

#### B. Why 44 Imported of 60 and 60 Skipped Appeared in the UI
In `StatementImport.tsx`, `batchRecord.skipped_rows = skippedRowsForImport(result.rows)` was executed *before* the import loop. None of the rows had been imported yet (`importedRowKeys` was empty), so all 60 rows were captured into `skipped_rows`. After importing 44 rows, `batchRecord.skipped_rows` was never updated with the imported keys excluded, producing the contradictory statement that 44 transactions were imported and 60 were skipped out of a 60-row file.

#### C. Extracted Date Inaccuracies
1. **Locale & Month Ambiguity:** Statements using named months (`15-Nov-2026`, `Nov 15, 2026`) or alternative delimiters (`15.11.2026`, `15 11 2026`) failed recognition.
2. **Excel Serial Date Failure:** Spreadsheets and tabular exports passing numeric or 5-digit string serial dates (e.g. `45245`) threw parsing errors or defaulted to UTC epoch dates.
3. **Transaction Date vs Value Date Confusion:** Certain banks placed Value Date ahead of Transaction Date or vice-versa. Value Date was occasionally parsed as the primary transaction date or caused rows to fail parsing when Value Date was absent.

#### D. Re-Upload Duplicate Creation
1. **Incomplete Ledger Lookup:** In `StatementImport.tsx`, `getExistingTransactions(userId)` only queried the server. If the server returned an empty array or failed (offline/PWA mode), local IndexedDB records were bypassed, returning 0 existing transactions.
2. **Lack of File Hash Warnings:** Re-uploading an already-imported statement file did not warn the user of previous importation.
3. **Lack of Ingestion-Level Idempotency:** The backend only validated transaction existence by client `id`, not by `statement_reference` or composite statement fingerprint (`transaction_date`, `amount_paise`, `type`, `description`).

---

### 6.2 Architectural & Implementation Corrections

1. **Ledger Local-First Outbox Merging (`TransactionLedger.tsx`):**
   - In desktop and mobile modes, `loadTransactions()` retrieves both server records and local IndexedDB records with `sync_status: 'pending'` or `sync_status: 'failed'`.
   - Merges server and local un-synced items into a single deduplicated map by `id`. Newly imported transactions are visible **immediately** upon import, regardless of network or backend status.

2. **Multi-Format Calendar & Date Normalization (`statement-parser.ts`):**
   - Extended `parseIndianDate` to handle numeric Excel serials, 5-digit string serials, ISO dates (`YYYY-MM-DD`), named months (`15-Nov-2026`, `Nov 15, 2026`, `15/Nov/26`), and various delimiters (`/`, `-`, `.`, spaces).
   - Strict calendar validation: leap year checking (`2024-02-29` is accepted, `2025-02-29` is rejected) and day bounds checking (`31/04/2026` is rejected).
   - `inferTableDateFormat(table, dateCol)` detects whether a statement uses `DMY` or `MDY` by scanning for values > 12.
   - Distinct column handling: Transaction Date is strictly prioritized as primary ledger date; Value Date is stored separately. Fallback to Value Date occurs only when Transaction Date is absent, with confidence adjusted to `medium`.

3. **Re-Upload & Cross-Source Deduplication:**
   - **Combined Ledger Lookup:** `getExistingTransactions(userId)` unifies both IndexedDB cache and full server pagination into a single map.
   - **SHA-256 File Hash Defense:** `readFile` computes the statement SHA-256 digest and warns if the identical file was previously imported, indicating the original batch ID and import date while still checking every row against the ledger.
   - **Backend Idempotency:** In `transaction.service.ts` and in the Next.js BFF fallback, insertions with an existing `statement_reference` or matching composite fingerprint (`transaction_date`, `amount_paise`, `type`, `description`) return the existing transaction as a replay without duplicating.

4. **Exact Batch Accounting & Mutually Exclusive Metrics:**
   - In `StatementImport.tsx`, `skipped_rows` is computed **after** the import loop using `skippedRowsForImport(result.rows, importedRowKeys)`.
   - The accounting equation `detected_count === imported_count + skipped_count` strictly holds across all batches (e.g., 60 detected = 44 imported + 16 skipped).
   - Skipped rows validation in `statement-skip-history.ts` ensures only positive paise values (`amountPaise > 0n`) are transmitted.

5. **Separation of Import Status vs Cloud Sync Status & UI Redesign:**
   - Separated file import status (`Imported` / `Undone`) from cloud synchronization status (`Synced to Cloud (44/44)` or `X of Y Synced · Z Pending Sync`).
   - Redesigned "Past Statement Batches" cards with clear accounting metrics, detailed skip-reason inspection, functional "Retry Sync" action, and safe "Undo Batch" confirmation.

6. **Direct Supabase BFF Fallback & Foreign Key Defense:**
   - Added direct Supabase PostgreSQL fallback to `POST /api/backend/transactions` and `frontend/src/app/api/backend/[...segments]/route.ts`.
   - Automatically pre-creates `statement_import_batches` row before inserting transactions with `import_batch_id`, satisfying `fk_statement_import_item_batch_owner` and eliminating trigger failures.
   - "Undo Batch" calls the PostgreSQL RPC `undo_statement_import_batch`, purges pending outbox mutations for that batch, and soft-deletes transactions locally.

---

### 6.3 Verification Baseline
- **Baseline Test Suite:** `frontend/tests/statement-import-ledger-sync-recovery.test.ts` (12 / 12 tests passed).

---

## 7. Master Product Improvements & Three-Section Review Architecture

### 7.1 Three-Section Review Workflow
The import review interface is partitioned into three mutually exclusive, dedicated sections:
- **Section A — To Review:** Uncommitted candidate rows awaiting user confirmation. Categories and necessity are fully optional. Rows immediately transition *out* of Section A upon verified local-first persistence into the Ledger.
- **Section B — Imported:** Committed transactions displaying a green status badge, committed debit/credit totals, and a direct link to the Transaction Ledger. Committed rows never appear in Section A.
- **Section C — Skipped / Needs Attention:** Non-imported rows displaying explicit reasons (`Ambiguous Date`, `Candidate Transfer`, `Candidate Card Settlement`, `Possible Duplicate`, `User Skipped`).

### 7.2 Non-Discarding Date Extraction & Inline Resolution
Rows with unparseable or ambiguous dates are **never discarded**. They are captured in Section C with an inline date picker (`<input type="date">`) and a "Confirm Date & Move to Review" action. The parser resolves ordinal suffixes (`21st Nov 2026`), embedded date prefixes (`Dt: 21/11/2026`), OCR substitutions (`O` for `0`, `l`/`I` for `1`), and compact 8-digit formats (`21112026`).

### 7.3 Database Migration 0038: First-Class UPI Payment Method
- Added `'upi'` to PostgreSQL `payment_method` enum (`ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'upi'`).
- Updated `fn_account_balances` and `fn_validate_transaction_balance` so that `'upi'` transactions are categorized under digital balances alongside `'online'`.
- Updated `@arth/contracts`, backend validation, and frontend badges (`variant="upi"`).

### 7.4 UPI Intelligence & Clean Merchant Counterparty Extraction
The `extractCounterpartyAndPaymentMethod` engine strips banking noise, handles UPI patterns (`UPI-...`, `UPI/...`, `UPI-P2P`, `UPI-P2M`, `UPI-QR`), extracts VPA handles, masks card/account numbers, preserves Indian financial acronyms (`HDFC`, `ICICI`, `SBI`, `ATM`, `POS`, `UPI`, `NEFT`, `IMPS`), and exposes raw narration in details while displaying clean merchant titles.

### 7.5 Layered Categorization & Rule Learning Integration
A 4-tier categorization pipeline:
1. **Layer 1: User-Specific Merchant Rules** (local persistence, instant override).
2. **Layer 2: Curated Indian Merchant Directory** (Swiggy, Zomato, BigBasket, Blinkit, etc.).
3. **Layer 3: Weak Supervision / FastText ML Models**.
4. **Layer 4: First-Class Uncategorized Fallback** (`category_id: null`).
When a user assigns a category in Review or the Ledger, an inline prompt offers "Remember this merchant's category for future transactions", auto-learning rules for future imports.

### 7.6 Contextual Inline Transaction Editing in Ledger
Replaced oversized drawers and popups with contextual inline editing directly within the table row on desktop and touch-friendly anchored cards on mobile. Allows editing amount, date, description, category, necessity, and payment method with immediate Save/Cancel and Enter/Escape keyboard shortcuts. Preserves raw narration without overwriting notes or statement references.

### 7.7 Batch Inspection Modal & Accessible Contrast
- **Inspect Batch Modal:** Displays strictly mutually exclusive batch accounting: `detected === committed + pending + confirmed_duplicates + skipped`. Displays skipped row details with dates, amounts, and reasons.
- **High-Contrast Retry Sync:** Eliminates yellow-on-yellow contrast in light/dark themes with WCAG AA compliant amber buttons.

---

### 7.8 Final Monorepo Verification Results
- **Frontend Test Suite:** 708 / 708 tests passed across 180 test suites.
- **Backend Test Suite:** 229 / 229 tests passed across 49 test suites.
- **Global Typecheck:** 0 TypeScript errors across all workspace packages (`@arth/contracts`, `@arth/backend`, `@arth/frontend`).
- **Production Build:** `pnpm build` completed successfully; all 37 application routes and service worker generated.

