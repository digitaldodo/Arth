# SpendSense Indian-Context Transaction Categorization Research

## 1. Research Question & Academic Novelty Assessment

### 1.1 Core Research Question
> *Can weak supervision and domain-anchored subword embeddings provide accurate, interpretable, and low-latency transaction categorization for noisy, abbreviated Indian banking and UPI narrations while maintaining safe abstention and conservative confidence calibration?*

### 1.2 Novelty Ranking & Ownership
- **Lead Researcher / Owner**: Ansh.
- **Assigned Novelty Assessment**: **Rank 2** — *Weakly Supervised Indian-Context Transaction Categorization using Anchored FastText Embeddings* (Research Value: 8.5/10, Implementation Difficulty: 7/10).
- **Distinction from Project Rank 1**: The project's overall Rank 1 novelty contribution is the *Explainable, Uncertainty-Aware Safe-to-Spend Engine*, owned by another team member. Transaction categorization operates as an authoritative upstream input provider, passing clean structured classifications and confidence scores into the ledger.

---

## 2. Theoretical Architecture & Methodology

Indian financial narrations present unique NLP challenges:
1. **Severe Character Length Constraints & Aggressive Truncation**: Core banking software truncates narrations to 30–50 characters (e.g., `UPI/123456789012/SWIGGY/swiggy@icici/Order`).
2. **Agglutinated Tokens & Missing Spaces**: Strings like `BPCLPETROLMUMBAI` or `BBPS*MSEBDISCOM*BILL`.
3. **Pervasive Code-Mixing & Hinglish Phonetics**: `Doodh`, `Kirana`, `Chai`, `Dhabha`, `Bijli`.
4. **Extreme Class Imbalance**: Everyday UPI micro-transactions (Food & Dining, Groceries, Transport) heavily outnumber periodic high-value payments (Tuition fees, Loan EMIs, Hospital bills, Term insurance).

```
+--------------------------------------------------------------------------------------------------+
|                                    RAW TRANSACTION NARRATION                                     |
|           "UPI/429108192837/SWIGGY/swiggy@icici/Food order/Payment from ICICI"                   |
+-------------------------------------------------+------------------------------------------------+
                                                  |
                                                  v
+--------------------------------------------------------------------------------------------------+
|                                    1. NORMALIZATION & TOKENIZATION                               |
|  - Cleans whitespace & casing      - Strips UPI rails & bank prefixes (e.g., UPI/, NEFT/, IMPS/) |
|  - Isolates UTR / reference IDs    - Extracts merchant tokens: ["swiggy", "food", "order"]       |
+-------------------------------------------------+------------------------------------------------+
                                                  |
                                                  v
+--------------------------------------------------------------------------------------------------+
|                                 2. WEAK SUPERVISION LABELING FUNCTIONS                           |
|       +-------------------------+-------------------------+-------------------------+            |
|       |   LF 1: Merchant Alias  |  LF 2: Context Keywords |   LF 3: Direction/Rail  |            |
|       |  Votes: food_dining     |  Votes: food_dining     |  Votes: ABSTAIN         |            |
|       +------------+------------+------------+------------+------------+------------+            |
+--------------------|-------------------------|-------------------------|-------------------------+
                     +-------------------------+-------------------------+
                                               |
                                               v
+--------------------------------------------------------------------------------------------------+
|                                 3. ANCHORED FASTTEXT SUBWORD MATCHING                            |
|  - Generates character n-grams (e.g. <sw, swi, wig, igg, ggy, gy>)                              |
|  - Matches out-of-vocabulary agglutinated merchant handles to domain anchor centroids           |
+-------------------------------------------------+------------------------------------------------+
                                                  |
                                                  v
+--------------------------------------------------------------------------------------------------+
|                                4. CONFIDENCE ESTIMATOR & ABSTENTION                              |
|  - Lone unverified signal capped at 0.50 (Never claims false certainty)                         |
|  - Multiple corroborating signals scale confidence (0.75 - 0.95)                                |
|  - Conflicting label signals trigger abstention (<ABSTAIN>) -> forces user review                |
+-------------------------------------------------+------------------------------------------------+
                                                  |
                                                  v
+--------------------------------------------------------------------------------------------------+
|                                 5. HUMAN-IN-THE-LOOP CORRECTION MEMORY                           |
|  - User overrides update localized preference hash cache (spendsense_category_feedback_v1)      |
|  - Preserves privacy: No raw user financial narrations transmitted for centralized training     |
+--------------------------------------------------------------------------------------------------+
```

---

## 3. Empirical Benchmark Dataset & Experimental Results

To establish reproducible, empirical baselines within the SpendSense workspace, a synthetic benchmark dataset comprising 60 realistic Indian banking and UPI narrations was evaluated using chronological holdout splitting (48 training instances, 12 test instances).

### 3.1 Model Evaluation Summary (`ml/transaction-categorization/evaluation-results.json`)

| Metric | Measured SpendSense Performance | Research Target / Benchmark Context |
|---|---|---|
| **Weighted F1 Score** | **0.8889 (88.9%)** | Target: > 85.0% |
| **Macro F1 Score** | **0.6190 (61.9%)** | Unseen zero-support classes pull macro average down |
| **Mean Inference Latency** | **0.1915 ms (191.5 µs)** | ~5,220 predictions per second on single CPU core |
| **Abstention Rate** | **0.00%** on benchmark | Strict fallbacks prevent silent misattribution |
| **Expected Calibration Error (ECE)** | **0.3333** | Fixed-width 10-bin calibration |

### 3.2 Per-Category Performance Breakdown

| Financial Category | Precision | Recall | F1 Score | Test Set Support |
|---|---|---|---|---|
| **Food & Dining** | 1.0000 | 1.0000 | **1.0000** | 1 |
| **Shopping** | 1.0000 | 1.0000 | **1.0000** | 1 |
| **Healthcare** | 1.0000 | 1.0000 | **1.0000** | 1 |
| **Entertainment** | 1.0000 | 1.0000 | **1.0000** | 1 |
| **Salary** | 1.0000 | 1.0000 | **1.0000** | 1 |
| **Other Income** | 1.0000 | 1.0000 | **1.0000** | 2 |
| **Transfers** | 1.0000 | 1.0000 | **1.0000** | 1 |
| **Refunds** | 1.0000 | 1.0000 | **1.0000** | 2 |
| **Utilities** | 0.5000 | 1.0000 | **0.6667** | 1 |
| **Transport** | 0.0000 | 0.0000 | **0.0000** | 1 (classified as utility in holdout) |
| **Rent / Education / EMI** | 0.0000 | 0.0000 | **N/A** | 0 (zero test set instances) |

### 3.3 Labeling Function (LF) Empirical Analysis

The Snorkel-style weak supervision framework was analyzed across the 48 training transactions:

| Labeling Function | Coverage | Abstention Rate | Primary Categories Voted |
|---|---|---|---|
| `biller_and_context` | **70.83%** | 29.17% | Food, Shopping, Utilities, Rent, Transport, Healthcare |
| `merchant_keywords` | **25.00%** | 75.00% | Food & Dining, Shopping, Transport, Entertainment |
| `transaction_intent` | **18.75%** | 81.25% | Salary, Transfers, Refunds, Other Income |
| `known_biller_formats`| **14.58%** | 85.42% | Utilities (Electricity, Water, Gas, Broadband) |
| `bank_narration_patterns`| **8.33%** | 91.67% | Salary, Direct Refunds |
| `direction_and_transfer`| **4.17%** | 95.83% | Account Transfers |

- **Multi-Vote Agreement**: 20 out of 48 transactions (41.7%) received corroborating votes from multiple independent LFs.
- **LF Conflict Rate**: Only 1 out of 48 transactions (2.1%) encountered conflicting votes, validating LF orthogonality.

---

## 4. Cross-Platform Parity & Production Deployment

The categorization engine maintains exact mathematical and semantic consistency across three execution environments:

1. **Web / TypeScript (`frontend/src/features/categorization/`)**:
   - `suggestCategory(narration, availableCategories, type)`: Executes on every keystroke in Quick Add modal and for every row during statement import.
   - Preserves user corrections via IndexedDB `recordCategoryCorrection`.
2. **Native Android / Kotlin (`com.digitaldodo.arth.core.sms.IndianCategorizationEngine`)**:
   - Executes during background `SMS_RECEIVED` broadcast, `NotificationListenerService` hooks, and native `QuickAddViewModel`.
   - Caches merchant corrections in encrypted `spendsense_category_feedback_v1` SharedPreferences.
3. **Research Workspace / Python (`ml/transaction-categorization/`)**:
   - Houses evaluation harness (`evaluate.py`), Snorkel LabelModel adapters, FastText skip-gram trainers, and XGBoost comparative pipelines.

---

## 5. Ethical AI, Privacy & Academic Integrity

- **Zero Data Leakage**: User transaction descriptions are never sent to external third-party proprietary LLMs (e.g. OpenAI, Anthropic) or public cloud endpoints for categorization.
- **Honest Performance Claims**: Target metrics cited in literature (such as Alhenshiri's 93.6% for SentenceTransformer + XGBoost or Toran's 91% balanced accuracy on proprietary 18M-row datasets) are acknowledged as published academic reference points, distinct from SpendSense's internal 60-row baseline metrics.
