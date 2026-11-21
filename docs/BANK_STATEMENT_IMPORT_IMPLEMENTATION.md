# SpendSense — Bank Statement Import & Consolidated Ledger Implementation Report

**Date:** November 21, 2026  
**Engineering Domain:** Fintech Product Engineering, Local-First Persistence, Transaction Intelligence  
**Author:** SpendSense Engineering Team  

---

## 1. Executive Summary

SpendSense provides Indian personal finance intelligence operating on a **single consolidated personal Ledger**. Every user transaction—whether entered manually via Quick Add, captured automatically via native Android SMS listeners, or imported from electronic bank statements (PDF, CSV, XLSX, XLS)—belongs to one consolidated financial history.

This engineering implementation audited, streamlined, and completed the Bank Statement Import capability according to the **Master Implementation Architecture**:
1. **Consolidated Ledger Ingestion:** Eliminated all mandatory bank-account management, destination account dropdowns, and account setup forms from the statement import workflow. All confirmed transactions directly populate the user's personal ledger (`account_id: null`, `ingestion_source: 'bank_statement'`).
2. **Dedicated Entry Points:** Integrated unified **Import Bank Statement** modal actions accessible on both the **Dashboard** and **Transaction Ledger**.
3. **Decoupled Architecture:** Completely separated Bank Statement Import from Documents & Tax (which focuses strictly on tax assessment and compliance documents like Form 16, AIS, and TIS). Removed embedded financial message capture and manual entry tabs from the statement import modal.
4. **Conditional Security & Local Decryption:** The password prompt for encrypted PDFs is strictly conditional—it never appears for CSV, XLSX, or unencrypted PDFs. Statement passwords and extracted text are kept exclusively in volatile device memory and never transmitted or retained.
5. **Cross-Source Deduplication & Necessity Support:** Enhanced duplicate assessment to reconcile transactions across sources (Android SMS, manual entries, and previous imports). Introduced interactive necessity classification (`essential`, `optional`, `luxury`) during review to seamlessly participate in Dashboard necessity spending analytics.

---

## 2. Existing Architecture Discovered

Before code changes, the existing system was audited across frontend, backend, database RPCs, and offline caches:

### 2.1 Storage & Schema
- **Database (`public.transactions`):** The transactions table already supports `account_id UUID REFERENCES financial_accounts(id) NULL`. Transactions with `account_id IS NULL` participate fully in all views, necessity spending RPCs (`fn_dashboard_summary`), RLS policies, and Google Sheets outbox synchronizations.
- **Batch Provenance (`statement_import_batches`):** Migration `0030_statement_import_snapshots_and_atomic_undo.sql` provides atomic batch undo (`undo_statement_import_batch(UUID)`) and records import metadata (`detected_count`, `imported_count`, `status`, `source_sha256`, `skipped_rows`). The database schema supports `account_id = null`.
- **Offline Database (IndexedDB `arth_offline_db`):** `StatementImportBatch` in `frontend/src/lib/offline-db.ts` supports nullable `account_id`.

### 2.2 Ingestion & Parsing
- **`statement-parser.ts`:** Implements `normalizeStatementTable`, `parseCsv`, `parseIndianAmount` (integer paise math), `tagDuplicates`, and `computeStatementSummary`.
- **`statement-adapters.ts`:** Contains bank registry for HDFC, SBI, ICICI, Axis, Kotak, and Generic formats with column matching heuristics.
- **`statement-ocr.ts`:** Uses client-side WebAssembly Tesseract with English and Hindi language packs for scanned PDFs.

---

## 3. Problems Found in Prior Implementation

1. **Mandatory Account Selection Blocking Import:**  
   `StatementImport.tsx` previously fetched `/api/backend/financial/accounts` and blocked the user from importing with:
   `if (!accountId || !accounts.some((account) => account.id === accountId)) { setError('Add or select the destination account before importing.'); return; }`
   This forced users to invent managed accounts and violated SpendSense's consolidated personal ledger model.
2. **Overloaded Feature Boundaries:**  
   `StatementImport.tsx` rendered navigation buttons for "Manual Entry" and "Financial Message", and embedded `<FinancialMessageCapture />` and `<CrossAccountReconciliation />`.
3. **Misleading Documents & Tax Framing:**  
   Statement import displayed a "Documents & Tax" header, and `TransactionAppShell.tsx` rendered `<StatementImport />` inside the tax documents tab, conflating tax compliance with personal ledger ingestion.
4. **Duplicate Button in Ledger View:**  
   `TransactionLedger.tsx` rendered two consecutive "Import Bank Statement" buttons due to redundant guards (`onNavigateToStatementImport` and `handleOpenImport`).
5. **Cross-Source Deduplication Blindspot:**  
   `assessPossibleDuplicate` had a condition `const accountMatches = candidate.accountId ? (!item.account_id || sameAccount) : !item.account_id;`. When candidate had no account ID, it failed to match existing transactions that had an account ID, preventing deduplication against legacy or cross-account imports.
6. **Missing Necessity Classification:**  
   `ParsedStatementRow` hardcoded `necessity: row.type === 'expense' ? 'essential' : null` during commit without exposing it in the review interface, preventing users from categorizing expenses into `essential`, `optional`, or `luxury`.

---

## 4. Files & Modules Changed

| File | Status | Description of Changes |
|---|---|---|
| `frontend/src/features/imports/StatementImport.tsx` | **Refactored** | Removed all account management UI, account dropdowns, account creation forms, and `CrossAccountReconciliation`. Removed unrelated navigation tabs and message capture embeds. Added responsive drag-and-drop file target, conditional password card, search filter, selection shortcuts, editable necessity dropdowns, and consolidated ledger commit (`account_id: null`). |
| `frontend/src/features/imports/statement-parser.ts` | **Updated** | Added `necessity?: 'essential' \| 'optional' \| 'luxury' \| null` to `ParsedStatementRow` and initialized in `normalizeStatementTable`. |
| `frontend/src/features/imports/statement-adapters.ts` | **Updated** | Added `'ref'` and `'utr'` column header synonyms to HDFC, SBI, and Generic adapters for seamless CSV/Excel column mapping. |
| `frontend/src/features/categorization/duplicates.ts` | **Updated** | Corrected `accountMatches` logic to `candidate.accountId && item.account_id ? sameAccount : true`, enabling cross-source deduplication between SMS captures, manual entries, and bank statements across the consolidated ledger. |
| `frontend/src/features/transactions/TransactionLedger.tsx` | **Cleaned** | Consolidated the duplicate action buttons into a single, clean "Import Bank Statement" button next to "Download PDF" and "+ Record Entry". |
| `frontend/src/features/transactions/TransactionAppShell.tsx` | **Cleaned** | Removed `<StatementImport />` from the `'documents'` tab so Documents & Tax remains strictly focused on tax documents. |
| `frontend/tests/bank-statement-import-consolidated-ledger.test.ts` | **Created** | Comprehensive test suite verifying product model invariants, privacy boundaries, parsing normalization, necessity handling, cross-source deduplication, and skip history anonymization. |

---

## 5. Components & Services Reused

- **`syncEngine.createTransactionLocalFirst`:** Reused directly for idempotent offline-first transaction commit, outbox event generation, and Supabase synchronization.
- **`suggestCategory` & `recordCategoryCorrection`:** Reused for rule-based category recommendations and user correction learning.
- **`computeStatementSummary`:** Reused for total debits, total credits, and running balance reconciliation math.
- **`saveStatementImportBatch` & `getStatementImportBatches`:** Reused from offline IndexedDB storage.
- **`/api/backend/financial/import-batches/:id/undo`:** Reused for atomic database rollback of imported batches.
- **`StatementImportModal`:** Reused as the shared modal container across Dashboard and Transaction Ledger, providing Android hardware back button and Escape key handling.

---

## 6. Parsing & Extraction Improvements

1. **Flexible Reference Detection:**  
   Supported bank-provided transaction references (`UTR`, `Ref`, `Ref No`, `Cheque No`) across HDFC, SBI, ICICI, and generic formats.
2. **Direction & Reversal Awareness:**  
   Correctly classifies refunds, reversals, cashback, and self-transfers without misclassifying credits as expenses or salary.
3. **Integer-Paise Precision:**  
   All statement numbers are parsed using `parseINRToPaise` without floating-point math, preserving exact accounting precision down to the paise.
4. **Editable In-Memory Review:**  
   Users can modify Date, Description, Amount, Direction (Expense/Income), Category, Necessity (Essential/Optional/Luxury), and Payment Channel before committing.

---

## 7. Duplicate-Detection Approach

Cross-source duplicate prevention operates across three tiers:
1. **Tier 1: Bank Reference / UTR Match (High Confidence):**  
   If an incoming statement row shares a bank reference (e.g. UPI transaction ID, NEFT/IMPS UTR) with an existing ledger row of the same amount and direction, it is flagged as `already_recorded` / `possible_duplicate` with high confidence.
2. **Tier 2: Normalized Narration + Date + Amount (Medium Confidence):**  
   For transactions without distinct UTRs, deduplication checks date, amount, direction, and cleaned merchant narration (stripping bank payment markers like UPI, NEFT, POS). This matches manual entries (e.g., Quick Add "Swiggy ₹450" on 15 Nov) against the bank statement row.
3. **Tier 3: In-Statement Multi-Row Collision:**  
   If a statement contains multiple identical rows (e.g., two identical purchases at the same merchant on the same day), the duplicates are surfaced with a review warning and deselected by default so the user can verify whether both are genuine.

---

## 8. Security & Privacy Guarantees

1. **Client-Side Execution:** All PDF parsing, CSV reading, Excel decoding, and OCR operations execute in the client's browser thread or Web Worker.
2. **Ephemeral Password Lifecycle:** Passwords are kept in memory only (`passwordCallback` or optional session reference). They are never written to `localStorage`, cookies, IndexedDB, or server logs.
3. **Safe Provenance Logging:** File names stored in batch history are scrubbed by `safeSourceName` to redact Indian PAN numbers (`[PAN]`) and account numbers with 10+ digits (`[identifier]`).
4. **Anonymized Skip History:** The `skipped_rows` audit log stores only date, integer paise, state, and generic reason (e.g. `possible_duplicate`, `deselected`), omitting raw narration and merchant text.

---

## 9. Verification & Test Results

### 9.1 Test Execution
- **Backend Test Suite (`@arth/backend`):**  
  `pnpm --filter @arth/backend test`  
  **Result:** `227 / 227 passed` (0 failed, 0 skipped).
- **Frontend Test Suite (`@arth/frontend`):**  
  `pnpm --filter @arth/frontend test`  
  **Result:** `650 / 650 passed` (0 failed, 0 skipped).
- **Full Monorepo Typecheck:**  
  `pnpm typecheck`  
  **Result:** `Done` across all 4 packages (0 TypeScript errors).
- **Next.js Production Build:**  
  `pnpm --filter @arth/frontend build`  
  **Result:** Compiled successfully; all 37 dynamic and static routes built; service worker generated.

### 9.2 Acceptance Criteria Matrix

| Area | Criteria | Verified |
|---|---|:---:|
| **Navigation** | Dashboard "Import Bank Statement" entry point opens shared modal | ✅ |
| **Navigation** | Ledger "Import Bank Statement" entry point opens shared modal | ✅ |
| **UX** | Initial screen shows only upload zone, supported formats, and privacy note | ✅ |
| **UX** | No bank account dropdown or account creation forms | ✅ |
| **Security** | Encrypted PDF prompts for password; unencrypted files do not | ✅ |
| **Security** | Password kept only in memory; cancel cleans up decryption state | ✅ |
| **Parsing** | PDF, CSV, XLSX, XLS parsed into consolidated format | ✅ |
| **Review** | Summary cards show Detected, Selected, Debits, Credits, Duplicates | ✅ |
| **Review** | Inline editing of Date, Description, Amount, Direction, Category, Necessity | ✅ |
| **Deduplication** | Reconciles against Android SMS capture, Quick Add manual entries, and past statements | ✅ |
| **Commit** | Creates transactions in consolidated ledger with `account_id: null` | ✅ |
| **Provenance** | Batch recorded with source metadata; atomic undo removes batch entries safely | ✅ |
| **Decoupling** | Bank Statement Import is independent of Documents & Tax | ✅ |

---

## 10. Conclusion

The SpendSense Bank Statement Import feature is now fully aligned with the consolidated personal ledger product model. Users can seamlessly drag and drop statements on desktop or mobile, decrypt encrypted files locally, review and classify every transaction with full category and necessity control, prevent duplicate entries across all transaction intake sources, and commit directly to their consolidated financial history.
