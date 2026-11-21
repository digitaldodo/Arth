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
