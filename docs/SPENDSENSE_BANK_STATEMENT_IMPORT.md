# SpendSense Bank Statement Import System

## 1. Overview & Architecture

Bank statement import in SpendSense is a primary, first-class transaction acquisition pipeline accessible directly from the main Ledger on both Web and Android.

Users can upload or pick electronic bank statements (PDF, encrypted PDF, CSV, XLSX, XLS) or scanned physical statements (via local OCR). SpendSense executes 100% on-device document extraction, transaction normalization, balance reconciliation, duplicate candidate identification, and ML category suggestion before presenting an editable review table to the user.

```
+--------------------------------------------------------------------------------------------------+
|                                    STATEMENT DOCUMENT SELECTION                                  |
|   Web: Drag-and-drop file dropzone   |   Android: ActivityResultContracts.OpenDocument() picker  |
+-------------------------------------------------+------------------------------------------------+
                                                  |
                                                  v
+--------------------------------------------------------------------------------------------------+
|                                 DOCUMENT FORMAT DETECTION & ROUTING                              |
|       +-------------------+--------------------+--------------------+--------------------+       |
|       |    Vector PDF     |   Encrypted PDF    |    Scanned PDF     |   CSV / XLSX / XLS |       |
|       +---------+---------+---------+----------+---------+----------+---------+----------+       |
+-----------------|-------------------|--------------------|--------------------|------------------+
                  |                   |                    |                    |
                  |                   v                    |                    |
                  |       +-----------------------+        |                    |
                  |       | EPHEMERAL PASSWORD    |        |                    |
                  |       | VOLATILE MEMORY ONLY  |        |                    |
                  |       +-----------+-----------+        |                    |
                  |                   |                    |                    |
                  v                   v                    v                    v
+--------------------------------------------------------------------------------------------------+
|                                 ON-DEVICE EXTRACTION ENGINE                                      |
|  - Web: PDF.js worker / SheetJS / Tesseract.js eng+hin LSTM (local WASM)                        |
|  - Android: Native PdfRenderer / Apache POI / CSV cursor parser                                 |
+-------------------------------------------------+------------------------------------------------+
                                                  |
                                                  v
+--------------------------------------------------------------------------------------------------+
|                                   BANK ADAPTER REGISTRY MATCHING                                 |
|  - Signature detection across 12+ Indian Banks (HDFC, ICICI, SBI, Axis, Kotak, PNB, etc.)        |
|  - Custom User Column Mapping fallback for unknown or unformatted bank tables                   |
+-------------------------------------------------+------------------------------------------------+
                                                  |
                                                  v
+--------------------------------------------------------------------------------------------------+
|                                 RECONCILIATION & VALIDATION PIPELINE                             |
|  [1] Balance Math: Opening Balance + Total Credits - Total Debits == Closing Balance             |
|  [2] Duplicate Detection: Compares with existing ledger by account_id, date, amount, reference  |
|  [3] Category Inference: Calls shared IndianCategorizationEngine for category suggestions       |
+-------------------------------------------------+------------------------------------------------+
                                                  |
                                                  v
+--------------------------------------------------------------------------------------------------+
|                                  INTERACTIVE TRANSACTION REVIEW                                  |
|  - Inline date, description, amount, type, payment channel, and category editing                 |
|  - "Select New Rows" smart filter (automatically unselects detected duplicates)                  |
|  - Real-time balance discrepancy alerts and OCR confidence indicators                            |
+-------------------------------------------------+------------------------------------------------+
                                                  | (User taps "Add X rows to ledger")
                                                  v
+--------------------------------------------------------------------------------------------------+
|                                    ATOMIC IMPORT COMMIT & UNDO                                   |
|  - Inserts transactions to local-first ledger with ingestion_source = 'bank_statement'           |
|  - Records StatementImportBatch (batch ID, source hash, detected, imported, skipped counts)      |
|  - Atomically undoes batch if requested by user without corrupting rest of ledger                |
|  - Synchronizes to backend through durable outbox queue                                          |
+--------------------------------------------------------------------------------------------------+
```

---

## 2. Password-Protected PDF Workflow & Critical Security Boundary

### 2.1 The Indian Banking Context
In India, nearly all banks protect monthly e-statements with user-specific passwords:
- **HDFC Bank**: Customer ID or PAN number (all uppercase).
- **ICICI Bank**: First 4 letters of name (lowercase) + DDMM of birth date.
- **SBI**: Last 5 digits of registered mobile number + DOB (DDMMYY).
- **Axis Bank**: First 4 letters of name + last 4 digits of customer ID.

### 2.2 Interactive Decryption Flow
1. User selects a PDF statement.
2. SpendSense parses file headers. If `encrypted = true`, PDF.js or Android `PdfRenderer` invokes the password callback.
3. SpendSense renders an accessible, responsive password entry dialog:
   - Clear banner stating the document is encrypted.
   - Plain-language explanation of common bank password formats.
   - Show/Hide password toggle.
   - Checkbox: *"Remember in volatile browser/app memory for this session"*.
   - Decryption attempt executed locally.
4. If password succeeds, parsing proceeds to transaction extraction.
5. If incorrect password:
   - Clear error is displayed without discarding the loaded file.
   - Volatile session cache is invalidated.
   - User is allowed to re-enter password.

### 2.3 Strict Ephemeral Security Invariant
> [!CAUTION]
> Under no circumstances may a statement password ever be written to persistent storage or transmitted over a network.

SpendSense strictly enforces that passwords:
- **Never saved in**: Supabase PostgreSQL, IndexedDB, Room DB, LocalStorage, SessionStorage, browser cookies, Android `SharedPreferences`, or `EncryptedSharedPreferences`.
- **Never logged in**: Console logs, telemetry, error reporting, Sentry, or server request logs.
- **Never sent to**: Backend API, external LLMs, cloud OCR services, or analytics endpoints.
- **Lifecycle Bound**: Stored purely in a transient React `useRef<string | null>` or Kotlin coroutine state, and explicitly nullified upon parsing completion, user cancellation, dialog closure, or page/screen exit.

---

## 3. Bank Statement Adapter Registry

The adapter registry identifies bank statement formats by matching text signatures in header rows and extracts transactions via deterministic column rules:

| Bank / Issuer | Supported Formats | Extraction Strategy | Known Limitations / Notes |
|---|---|---|---|
| **HDFC Bank** | PDF, CSV, XLS | Matches "HDFC BANK LIMITED", "Narration", "Chq./Ref.No.", "Value Dt", "Withdrawal Amt.", "Deposit Amt.", "Closing Balance" | Multi-page narration continuation lines merged into previous row. |
| **ICICI Bank** | PDF, CSV, XLSX | Matches "ICICI Bank", "Transaction Remarks", "Cheque Number", "Withdrawal (Dr)", "Deposit (Cr)", "Balance (INR)" | Handles both corporate and retail netbanking layout variations. |
| **State Bank of India (SBI)** | PDF, CSV, XLS | Matches "STATE BANK OF INDIA", "Txn Date", "Description", "Ref No./Cheque No.", "Debit", "Credit", "Balance" | Accommodates multi-line UPI reference numbers. |
| **Axis Bank** | PDF, CSV | Matches "AXIS BANK", "Tran Date", "Particulars", "CHQNO", "Init. Br", "Debit", "Credit", "Balance" | Filters out branch address headers on each page break. |
| **Kotak Mahindra Bank** | PDF, CSV | Matches "Kotak Mahindra Bank", "Date", "Description", "Chq / Ref No", "Amount", "Dr / Cr", "Balance" | Handles single amount column with Dr/Cr indicator. |
| **Punjab National Bank (PNB)** | PDF, CSV | Matches "PUNJAB NATIONAL BANK", "Txn Date", "Remarks", "Withdrawal", "Deposit", "Balance" | Standard table structure. |
| **Canara Bank** | PDF, CSV | Matches "CANARA BANK", "Value Date", "Description", "Ref No", "Debit", "Credit", "Balance" | Accommodates IFSC and Branch code metadata. |
| **IndusInd Bank** | PDF, CSV | Matches "IndusInd Bank", "Transaction Date", "Transaction Details", "Withdrawal", "Deposit", "Balance" | Standard table structure. |
| **Yes Bank** | PDF, CSV | Matches "YES BANK", "Transaction Date", "Description", "Reference Number", "Debit", "Credit", "Balance" | Standard table structure. |
| **Standard Chartered** | PDF, CSV | Matches "Standard Chartered Bank", "Date", "Description", "Withdrawals", "Deposits", "Running Balance" | Excludes foreign currency conversion footnotes. |
| **Generic / Unknown** | CSV, XLSX, XLS, PDF | Interactive User Column Mapping Interface | Allows user to pick header row and assign Date, Narration, Debit, Credit, Amount, and Balance. |

---

## 4. Transaction Review & Balance Reconciliation

Before committing any transactions to the ledger, SpendSense renders a comprehensive review dashboard:

1. **Extraction Metric Cards**:
   - `Detected`: Total raw rows found in document.
   - `Selected`: Number of rows checked for import (defaults to all new non-duplicate rows).
   - `New`: Rows not found in existing ledger.
   - `Already on file`: Confirmed identical matches.
   - `Duplicates / Review`: Uncertain or ambiguous matches requiring human decision.
   - `Parser`: Matched bank adapter name and validation confidence.
2. **Balance Reconciliation Mathematical Verification**:
   The engine computes:
   $$\Delta_{\text{computed}} = \text{Opening Balance} + \sum \text{Credits} - \sum \text{Debits}$$
   $$\text{Discrepancy} = \lvert \Delta_{\text{computed}} - \text{Closing Balance} \rvert$$
   - If $\text{Discrepancy} = 0$: Displays green badge *"Reconciled · Math matches statement exactly"*.
   - If $\text{Discrepancy} > 0$: Displays amber warning chip highlighting the exact rupee/paise variance for user audit.
3. **Inline Row Editing**:
   Every row can be inspected, toggled on/off, and adjusted for Date, Description, Amount, Direction (Income/Expense), Payment Method, and Category.
4. **Batch History & Atomic Safe-Undo**:
   Every successful import creates an immutable `StatementImportBatch` record with the list of created transaction IDs. If a user discovers they imported the wrong file or an incorrect account, tapping **"Undo Import"** removes all transactions belonging to that batch without affecting other ledger transactions.
