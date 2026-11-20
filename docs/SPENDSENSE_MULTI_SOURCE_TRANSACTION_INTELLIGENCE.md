# SpendSense Multi-Source Transaction Intelligence Architecture

## 1. Executive Summary & Ownership Scope

SpendSense personal finance application features a unified, multi-source transaction acquisition, normalization, and categorization pipeline engineered for Indian financial transactions.

- **Primary Ownership**: Ansh (Lead Architect for Transaction Acquisition, Statement Import, Automatic SMS Capture & Categorization).
- **Research Novelty Contribution**: Rank 2 — *Weakly Supervised Indian-Context Transaction Categorization using Anchored FastText Embeddings* (Research Value: 8.5/10; Implementation Difficulty: 7/10).
- **Core Product Architecture**: Single authoritative ledger, UUID v7 primary identifiers, strict integer-paise monetary representation (`BIGINT`), local-first offline persistence, durable outbox replication, and end-to-end transaction provenance.

```
+--------------------------------------------------------------------------------------------------+
|                                    TRANSACTION ACQUISITION HUB                                   |
+---------------------+-------------------------------+--------------------------------------------+
|   Manual Quick Add  |     Bank Statement Import     |        Financial SMS & Notifications       |
|   (Web, PWA, App)   |  (PDF, Encrypted, CSV, Excel) | (BroadcastReceiver, Inbox Scan, Share, NL) |
+----------+----------+---------------+---------------+---------------------+----------------------+
           |                          |                                     |
           +--------------------------+-------------------------------------+
                                      |
                                      v
+--------------------------------------------------------------------------------------------------+
|                            CANONICAL NORMALIZATION & EXTRACTION LAYER                            |
|  - Amount in paise (never float)    - Date & Value Date (ISO 8601)  - UTR / UPI Ref / Account Last4|
|  - Direction (Debit = expense, Credit = income)                     - Cleaned Merchant Narration |
+-------------------------------------+------------------------------------------------------------+
                                      |
                                      v
+--------------------------------------------------------------------------------------------------+
|                            SHARED INDIAN CATEGORIZATION ENGINE                                   |
|  - Anchored FastText Subwords       - Snorkel Weak Supervision Rules  - Merchant Alias Mapping   |
|  - Context Patterns (Food, Utility) - Conservative Confidence Scoring - User Feedback Memory     |
+-------------------------------------+------------------------------------------------------------+
                                      |
                                      v
+--------------------------------------------------------------------------------------------------+
|                            CROSS-SOURCE RECONCILIATION & REVIEW                                  |
|  - Duplicate detection heuristic    - Strict preserve distinct refs   - Ephemeral Review Table   |
+-------------------------------------+------------------------------------------------------------+
                                      |
                                      v
+--------------------------------------------------------------------------------------------------+
|                             LOCAL-FIRST AUTHORITATIVE LEDGER                                     |
|  - Web: IndexedDB (Dexie)           - Android: SQLite Room DB (v4)    - UUID v7 IDs              |
|  - Ingestion Source Provenance      - Audit Trail & Model Versions    - Paired Outbox Queue      |
+-------------------------------------+------------------------------------------------------------+
                                      |
                                      v
+--------------------------------------------------------------------------------------------------+
|                             DURABLE REPLICATION & CLOUD SYNC                                     |
|  - Fastify REST API (/api/v1/sync)  - Supabase PostgreSQL (RLS)       - Cross-Device Event Push  |
+--------------------------------------------------------------------------------------------------+
```

---

## 2. Multi-Channel Capability Matrix

SpendSense delivers end-to-end parity across Desktop Web, Laptop Web, Mobile PWA, and Native Android:

| Capability | Web / Desktop / PWA | Android Native Application | Implementation Details |
|---|---|---|---|
| **Manual Transaction Entry** | Mandatory (Working) | Mandatory (Working) | Quick Add modal/bottom sheet, auto-suggests category with rule confidence, saves to local ledger immediately, queues outbox event. |
| **PDF Statement Import** | Mandatory (Working) | Mandatory (Working) | Native document picker on Android, web file drop; PDF.js on-device text-layer extraction, table row parsing. |
| **Password-Protected PDF** | Mandatory (Working) | Mandatory (Working) | Ephemeral decryption in browser/Android memory; volatile session reuse checkbox; never saved to disk or network. |
| **CSV / XLSX / XLS Import** | Mandatory (Working) | Mandatory (Working) | Local SheetJS / CSV parser, bank-specific column adapter auto-detection, manual mapping fallback. |
| **Scanned PDF Local OCR** | Supported (Working) | Review Fallback | In-browser Tesseract.js (LSTM eng+hin, 25-page cap, mandatory user review of low confidence fields). |
| **Bank/UPI Message Pasting** | Mandatory (Working) | Mandatory (Working) | Web paste hub / Android clipboard parser extracts INR amount, counterparty, rail, reference. |
| **Share Selected Message** | Browser Web Share | Mandatory (Working) | Android `ACTION_SEND` intent filter captures selected SMS or WhatsApp receipt into review queue. |
| **Automatic Incoming SMS** | N/A (Browser sandbox) | Mandatory (Working) | `SmsBroadcastReceiver` listening on `SMS_RECEIVED_ACTION`, automated parsing, non-intrusive notification. |
| **Historical SMS Scanning** | N/A (Browser sandbox) | Mandatory (Working) | `READ_SMS` cursor traversal with batch deduplication, personal/OTP exclusion, idempotency checks. |
| **Financial Notification Detection** | N/A (Browser sandbox) | Supported (Working) | `NotificationListenerService` hooks banking app push notifications (GPay, PhonePe, Paytm, CRED). |
| **Common ML Categorization** | Mandatory (Working) | Mandatory (Working) | Shared rule model + subwords + merchant fingerprint feedback cache (`spendsense_category_feedback_v1`). |
| **Duplicate Reconciliation** | Mandatory (Working) | Mandatory (Working) | Matches account, amount, date, reference; flags candidates for review without deleting legitimate transactions. |
| **Local-First Persistence** | Mandatory (IndexedDB) | Mandatory (Room DB) | Zero-latency local commit, works completely offline, optimistic balance calculation. |
| **Cross-Device Sync** | Mandatory (Working) | Mandatory (Working) | Outbox event replay, idempotent deduplication, Supabase Row-Level Security isolation. |

---

## 3. Authoritative Single Ledger & Data Contracts

All ingestion channels feed into one shared data model. There is no secondary ledger or competing transaction repository.

### 3.1 Strict Integer-Paise Representation
Financial amounts are strictly stored as 64-bit integer paise (`BIGINT` in PostgreSQL, `Long` in Kotlin, `bigint` in TypeScript):
$$\text{paise} = \text{round}(\text{amount}_{\text{INR}} \times 100)$$
Floating-point money representations (`0.1 + 0.2 = 0.30000000000000004`) are forbidden across all storage, calculation, and network transmission boundaries.

### 3.2 UUID v7 Transaction Identifiers
All transactions use time-ordered UUID v7:
- Combines 48-bit UNIX millisecond timestamp with 74 bits of cryptographically strong randomness.
- Guarantees natural B-Tree index clustering in PostgreSQL and SQLite, preventing index fragmentation.
- Generated client-side before persistence to enable immediate offline referencing.

### 3.3 Transaction Ingestion Provenance Schema
Every transaction records its exact origin and classification history:
```sql
ALTER TABLE public.transactions
  ADD COLUMN ingestion_source VARCHAR(32) NOT NULL DEFAULT 'manual'
    CHECK (ingestion_source IN ('manual', 'bank_statement', 'sms', 'notification', 'message_share', 'message', 'account_aggregator')),
  ADD COLUMN statement_reference VARCHAR(128),
  ADD COLUMN account_id UUID REFERENCES public.financial_accounts(id),
  ADD COLUMN import_batch_id UUID REFERENCES public.statement_import_batches(id),
  ADD COLUMN parser_version VARCHAR(32),
  ADD COLUMN categorization_model_version VARCHAR(32),
  ADD COLUMN category_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN categorization_method VARCHAR(32)
    CHECK (categorization_method IN ('manual', 'user_correction', 'rule_engine', 'weak_supervision', 'ml_model', 'fasttext')),
  ADD COLUMN category_suggestion_confidence REAL,
  ADD COLUMN category_evidence TEXT[],
  ADD COLUMN category_was_corrected BOOLEAN NOT NULL DEFAULT false;
```

---

## 4. Cross-Source Duplicate Reconciliation

When transactions arrive through multiple channels (e.g., user pays at Starbucks via UPI -> SMS detected immediately -> later imports HDFC bank statement containing the same debit):

1. **Deterministic Matching Key**:
   $$\text{Key} = (\text{account\_id}, \text{date}, \text{amount\_paise}, \text{statement\_reference})$$
2. **Ambiguity Heuristic**:
   If amount and date match, but reference numbers are missing or differing:
   - System flags the candidate as `possible_duplicate`.
   - Displays comparison chip in the Review Table highlighting matching date and amount.
3. **Core Invariant**:
   Never auto-delete or silently discard two transactions that have distinct reference numbers or timestamps, even if amounts and merchant match (e.g., two ₹500 grocery transactions on the same day).

---

## 5. Security, Privacy & Boundary Protection

1. **Ephemeral PDF Passwords**:
   - Decryption occurs client-side in volatile memory (RAM) via WebAssembly PDF.js or native Android `PdfRenderer`.
   - Passwords are never sent across the network, never logged, and never written to `localStorage`, `IndexedDB`, `Room`, or telemetry.
   - Cleared immediately upon parsing completion, user cancellation, or component teardown.
2. **SMS Privacy Boundary**:
   - Strict sender address filtering (only registered 6-character bank sender headers such as `VM-HDFCBK`, `AD-ICICIB`).
   - OTP, balance alerts, service messages, and personal messages are immediately discarded without persistent storage.
   - Raw message bodies are not transmitted to backend servers or third-party AI models.
3. **Row-Level Security (RLS)**:
   - Supabase PostgreSQL enforces `auth.uid() = user_id` across all queries, preventing cross-tenant data leakage.
