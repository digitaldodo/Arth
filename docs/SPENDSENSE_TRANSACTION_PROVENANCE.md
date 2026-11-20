# SpendSense Transaction Provenance & Audit Trail Architecture

## 1. Motivation & Governance

In personal finance applications, users must be able to trust their financial history. A silent categorization failure, a misread amount, or an unidentifiable transaction can destroy user trust.

SpendSense implements a comprehensive **Transaction Provenance and Audit Trail** data model. Every transaction stored in the ledger records where it came from, which parser processed it, what ML model or rules classified it, what confidence score and textual evidence supported that decision, and whether a human verified or overrode the category.

```
+--------------------------------------------------------------------------------------------------+
|                                    TRANSACTION INGESTION EVENT                                   |
|   (Manual Entry, Bank Statement File, Incoming SMS, Notification Push, or Shared Message)        |
+-------------------------------------------------+------------------------------------------------+
                                                  |
                                                  v
+--------------------------------------------------------------------------------------------------+
|                                   PROVENANCE METADATA ATTACHMENT                                 |
|                                                                                                  |
|   * ingestion_source:              'manual' | 'bank_statement' | 'sms' | 'notification' | ...    |
|   * statement_reference:           'UPI/123456789012' or 'CHQ-88912' or 'UTR-AXIS1992'           |
|   * account_id:                    UUID of destination bank or credit card account               |
|   * import_batch_id:               UUID of statement import session (if statement-derived)       |
|   * parser_version:                'hdfc_pdf:1' or 'sms_classifier_v1' or 'quick_add:1'          |
|   * categorization_model_version:  'weak-label-rules-v1' or 'fasttext-anchored-v1'              |
|   * category_verified:             true (human confirmed) / false (auto-confirmed)               |
|   * categorization_method:         'manual' | 'user_correction' | 'rule_engine' | ...            |
|   * category_suggestion_confidence:0.85 (Float between 0.0 and 1.0)                             |
|   * category_evidence:             ['alias:swiggy', 'rail:upi', 'keyword:food']                 |
|   * category_was_corrected:        true / false                                                  |
+-------------------------------------------------+------------------------------------------------+
                                                  |
                                                  v
+--------------------------------------------------------------------------------------------------+
|                                    DURABLE PERSISTENCE & SYNC                                    |
|                                                                                                  |
|   Web Client (Dexie IndexedDB)  <--->  Supabase PostgreSQL (RLS)  <--->  Android (Room SQLite)   |
|   - Transactions Table                 - Transactions Table              - Transactions Table    |
|   - Outbox Queue Mutations             - Replication Events              - Outbox Events         |
+--------------------------------------------------------------------------------------------------+
```

---

## 2. Canonical Database Schema (`0035` & `0036` Migrations)

In Supabase PostgreSQL, the `public.transactions` table incorporates these fields via additive, non-destructive migrations:

```sql
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS ingestion_source VARCHAR(32) NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS statement_reference VARCHAR(128),
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS import_batch_id UUID REFERENCES public.statement_import_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parser_version VARCHAR(32),
  ADD COLUMN IF NOT EXISTS categorization_model_version VARCHAR(32),
  ADD COLUMN IF NOT EXISTS category_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS categorization_method VARCHAR(32),
  ADD COLUMN IF NOT EXISTS category_suggestion_confidence REAL,
  ADD COLUMN IF NOT EXISTS category_evidence TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS category_was_corrected BOOLEAN NOT NULL DEFAULT false;

-- Enforce valid ingestion sources across all channels
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS chk_transactions_ingestion_source;
ALTER TABLE public.transactions
  ADD CONSTRAINT chk_transactions_ingestion_source CHECK (
    ingestion_source IN (
      'manual',
      'bank_statement',
      'sms',
      'notification',
      'message_share',
      'message',
      'account_aggregator'
    )
  );

-- Enforce categorization method taxonomy
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS chk_transactions_categorization_method;
ALTER TABLE public.transactions
  ADD CONSTRAINT chk_transactions_categorization_method CHECK (
    categorization_method IS NULL OR categorization_method IN (
      'manual',
      'user_correction',
      'rule_engine',
      'weak_supervision',
      'ml_model',
      'fasttext'
    )
  );
```

---

## 3. Cross-Platform Type Definitions

### 3.1 TypeScript Contracts (`@arth/contracts`)
```typescript
export type TransactionIngestionSource =
  | 'manual'
  | 'bank_statement'
  | 'sms'
  | 'notification'
  | 'message_share'
  | 'message'
  | 'account_aggregator';

export type CategorizationMethod =
  | 'manual'
  | 'user_correction'
  | 'rule_engine'
  | 'weak_supervision'
  | 'ml_model'
  | 'fasttext';

export interface TransactionDTO {
  id: string;
  user_id: string;
  amount_paise: string; // Serialized BIGINT
  type: 'income' | 'expense';
  category_id: string;
  transaction_date: string; // ISO 8601 YYYY-MM-DD
  payment_method: 'online' | 'cash';
  necessity: 'essential' | 'discretionary' | null;
  description: string | null;
  notes: string | null;
  
  // Provenance metadata
  ingestion_source: TransactionIngestionSource;
  statement_reference: string | null;
  account_id: string | null;
  import_batch_id: string | null;
  parser_version: string | null;
  categorization_model_version: string | null;
  category_verified: boolean;
  categorization_method: CategorizationMethod | null;
  category_suggestion_confidence: number | null;
  category_evidence: string[];
  category_was_corrected: boolean;
  
  created_at: string;
  updated_at: string;
}
```

### 3.2 Android Kotlin Room Entity (`TransactionEntity.kt`)
```kotlin
@Entity(tableName = "transactions")
data class TransactionEntity(
    @PrimaryKey val id: String,
    val amountPaise: Long,
    val type: String,
    val categoryId: String,
    val transactionDate: String,
    val paymentMethod: String,
    val necessity: String?,
    val description: String?,
    val notes: String?,
    val ingestionSource: String = "manual",
    val statementReference: String? = null,
    val accountId: String? = null,
    val importBatchId: String? = null,
    val parserVersion: String? = null,
    val categorizationModelVersion: String? = null,
    val categoryVerified: Boolean = false,
    val categorizationMethod: String? = null,
    val categorySuggestionConfidence: Float? = null,
    val categoryEvidence: String = "[]", // JSON array
    val categoryWasCorrected: Boolean = false,
    val syncStatus: String = "PENDING",
    val createdAt: Long = System.currentTimeMillis()
)
```

---

## 4. End-to-End Provenance Journey by Channel

| Channel | `ingestion_source` | `parser_version` | `categorization_method` | `category_verified` | Evidence Example |
|---|---|---|---|---|---|
| **Manual Quick Add** | `manual` | `quick_add:1` | `rule_engine` (or `user_correction` if corrected) | `true` (user tapped Save) | `["alias:zomato", "keyword:dining"]` |
| **Bank Statement Import** | `bank_statement` | e.g. `hdfc_pdf:1` | `weak_supervision` | `true` (user confirmed in review table) | `["keyword:swiggy", "rail:upi"]` |
| **Automatic SMS (High Conf.)** | `sms` | `sms_classifier_v1` | `weak_supervision` | `false` (auto-confirmed) | `["upi_vpa:swiggy@icici", "direction:dr"]` |
| **Automatic SMS (Reviewed)** | `sms` | `sms_classifier_v1` | `weak_supervision` | `true` (user tapped notification) | `["ref:123456789012", "keyword:uber"]` |
| **Notification Listener** | `notification` | `notif_listener_v1` | `weak_supervision` | `true` / `false` | `["app:com.google.android.apps.nbu.paisa.user"]` |
| **Message Share (`ACTION_SEND`)**| `message_share` | `message_parser_v1` | `weak_supervision` | `true` | `["share_text_match", "alias:bbdaily"]` |

---

## 5. Human-in-the-Loop Feedback Loop

When a user corrects an auto-suggested category:
1. The transaction records `category_was_corrected = true` and `categorization_method = 'user_correction'`.
2. The merchant fingerprint (e.g., `hash("blue tokai")`) is stored with the user's chosen category in local preference storage (`spendsense_category_feedback_v1` on Android, `recordCategoryCorrection` on Web IndexedDB).
3. Subsequent transactions matching that merchant fingerprint immediately resolve to the user's preferred category with maximum rule confidence (`1.0`), honoring user preference without retraining a global model or violating privacy boundaries.
