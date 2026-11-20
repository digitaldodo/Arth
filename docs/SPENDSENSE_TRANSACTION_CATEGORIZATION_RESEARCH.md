# SpendSense Indian-context transaction categorization

## Research question and ownership

Can weak supervision and domain-anchored FastText improve category suggestions for short, abbreviated, noisy Indian bank and UPI narrations while keeping uncertain cases reviewable?

The user's assigned contribution is **Weakly Supervised Indian-Context Transaction Categorization using Anchored FastText Embeddings**. The novelty assessment ranks this candidate second (Research Value 8.5/10; Implementation Difficulty 7/10). The project's overall Rank 1 novelty is the uncertainty-aware Safe-to-Spend engine, owned by another team member. This document does not claim that transaction categorization is the project's overall Rank 1 contribution.

## Implemented product path

Manual Quick Add, bank statement row review, and selected bank/UPI message review call the same frontend `suggestCategory` pipeline. The pipeline normalizes narration, applies abstaining merchant/context weak-label functions, preserves supporting evidence, and declines to suggest on conflicting evidence. A single unopposed signal is exposed only as a low-strength suggestion; users must confirm or change it before saving. A missing suggestion requires user category selection; it does not fall back to the first category.

Transaction commits continue through the existing transaction engine. Provenance records input source, parser/model version, user verification, compact evidence, method, score when available, and correction state. This does not add another ledger. The detailed channel architecture and commit boundary are in `SPENDSENSE_TRANSACTION_INTELLIGENCE_ARCHITECTURE.md` and `SPENDSENSE_CATEGORIZATION_API_CONTRACT.md`.

## Methodology status

- **Narration normalization:** TypeScript and Python implementations normalize case/spacing, references, currency amounts, rails and UPI handles while maintaining reference/handle fields separately. Source parsers retain their own original text transiently; transaction records do not store full message bodies or bank documents.
- **Weak supervision:** Existing labeling functions cover merchant aliases, transaction intent and biller/context patterns. The research module now has an optional Snorkel `LabelModel` adapter. The client-side agreement fraction is not a learned generative model and is not calibrated confidence. LF coverage, overlap, conflict, abstention and label-model assumptions must be recorded in a real experiment.
- **Anchored FastText:** A training command now trains unsupervised skip-gram subword vectors and writes a run manifest. The repository's supervised FastText artifact adapter remains optional. No FastText artifact, approved Indian transaction corpus or measured semantic anchor quality is present.
- **Baselines and hybrid:** The evaluation runner includes TF-IDF unigram/bigram + XGBoost and SentenceTransformer `all-MiniLM-L6-v2` + XGBoost. An experimental Snorkel pseudo-label + skip-gram FastText anchor-feature + XGBoost path is also available when dependencies, data and a trained embedding artifact are supplied. Optional training-only RandomOverSampler, SMOTE and semantic text augmentation experiments are implemented behind a flag. None has been run on an approved labeled corpus. No production model dependency was introduced.
- **Human verification:** Explicit categories are confirmed before commit. The browser-scoped correction store hashes merchant fingerprints and does not train a global model. Transaction metadata retains the classification evidence and user confirmation where a candidate is committed through the current API.

## Taxonomy and field separation

Runtime suggestions map to the user's existing category IDs and type. Research labels may include Food & Dining, Shopping, Utilities, Rent, Transport, Education, EMIs & Loans, Healthcare, Entertainment, Salary, Other Income, Transfers, Refunds and Other. Income/expense direction, necessity, payment method, merchant identity and tax treatment remain independent fields. The classifier does not decide tax eligibility.

## Evaluation and results

The evaluation utilities provide chronological splitting and metrics for precision, recall, macro/weighted F1, per-category support/F1, confusion matrix, abstention and top-label calibration diagnostics. Calibration code is a metric implementation, not calibration evidence. A labeled benchmark must additionally report accuracy, LF coverage/conflict/abstention, training/inference timing, model dimensions and hyperparameters.

No licensed or consented labeled corpus or trained model was supplied. Therefore SpendSense accuracy, precision, recall, Macro F1, Weighted F1, per-category performance, calibration, coverage trade-offs, inference latency and comparative gains are **not measured**. The novelty assessment's >85% macro F1 is a target only. Its cited Alhenshiri values (93.6% accuracy for SentenceTransformer + XGBoost, 87.2% TF-IDF + XGBoost, macro F1 0.866, weighted F1 0.857) and Toran/Flowcast's 91% average balanced accuracy are literature values, not SpendSense results. See `SPENDSENSE_MODEL_BENCHMARKS.md` for the run requirements.

## Reproducibility and limitations

Use a frozen manifest with source/license/consent, source counts, category definitions, exact and near-duplicate controls, anonymization procedure, temporal split IDs, random seeds where supported, dependency versions, model versions and artifacts. Split before oversampling or text augmentation. Do not create near-duplicate train/test records. FastText's library training interface may not expose a portable random seed, so pin the corpus hash and library version and do not claim bitwise determinism.

The current product baseline is a small hand-authored weak-label set, not a production-quality model. It may fail on unknown or ambiguous merchants. Paper datasets, paper metrics and the literature's 18-million narration corpus are not available to SpendSense. The user's supplied research files were available at paths outside the repository; product recommendations there were treated as reference context while the explicit implementation requirements in the user request remained controlling.

## Supporting research documents

- `SPENDSENSE_WEAK_SUPERVISION_METHODOLOGY.md`
- `SPENDSENSE_FASTTEXT_TRAINING_AND_ANCHORING.md`
- `SPENDSENSE_DATASET_AND_LABELING_GUIDE.md`
- `SPENDSENSE_MODEL_BENCHMARKS.md`
- `SPENDSENSE_MULTI_SOURCE_TRANSACTION_INTELLIGENCE.md`
