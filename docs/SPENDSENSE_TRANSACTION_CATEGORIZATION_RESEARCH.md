# SpendSense Indian-context transaction categorization

## Research question

Can weak supervision and domain-anchored FastText improve category suggestions for short, abbreviated, noisy Indian bank and UPI narrations while keeping uncertain cases reviewable?

The supplied novelty assessment identifies anchored FastText plus weak labeling as the user's assigned research contribution. It sets macro F1 above 85% as an experimental target. It does not provide an evaluated SpendSense dataset or measured result; this implementation makes no accuracy claim.

## Implemented pipeline

1. **Normalization.** `frontend/src/features/categorization/pipeline.ts` applies Unicode normalization, case normalization, and removal of common amount and payment-reference patterns. It retains merchant and payment context for rules. The research adapter in `ml/transaction-categorization/pipeline.py` additionally extracts a UPI handle, transaction rail, and reference into separate fields.
2. **Weak labeling.** Merchant-alias and transaction-context labeling functions emit category votes or abstain. The UI suggests only when there are at least two agreeing signals and no tie. Its displayed agreement is a transparent rule-agreement fraction, not a calibrated probability.
3. **Human review.** Suggestions never write transactions. The user selects or changes the category before saving. Explicit corrections are scoped to the signed-in browser account and stored locally as a SHA-256 merchant fingerprint, category ID, and timestamp. Raw narration is not saved by this feedback path, and this feedback is not uploaded or used for global training.
4. **Replaceable model provider.** The Python research module defines an `EmbeddingModel` adapter and an `AnchoredFastTextProvider` that requires a model artifact, category anchors, and a confidence threshold. No trained model is bundled or active. Until a valid dataset, trained artifact, and evaluation review exist, the production UI is the conservative weak-label baseline only.

## Categories and dimensions

Initial labels are Food & Dining, Shopping, Utilities, Rent, Transport, Education, EMIs & Loans, Healthcare, Entertainment, Salary, Other income, Transfers, Refunds, and Other. Runtime suggestions map onto the existing category IDs; this module does not create or migrate a second category taxonomy. Income/expense type, necessity, payment method, merchant, and user category remain separate fields. Categorization is not a tax eligibility decision.

## Label functions

- `merchant_aliases`: known merchant aliases, including representative Indian UPI and marketplace names; abstains when no known alias matches.
- `transaction_intent`: income, refund, reversal, and own-account transfer language; abstains on ambiguous narration.
- `biller_and_context` / `transactionContexts`: utilities, rent, education, loan repayment, healthcare, food, shopping, transport, and entertainment context; abstains without context.
- Weak-label aggregation counts votes, records which functions voted, and abstains for no vote, a tie, or insufficient agreement. Votes are noisy labels, not ground truth.

The current TypeScript interface is deliberately conservative and has no global model call. The Python aggregation is a transparent weak-label combiner, not the Snorkel library's learned generative label model. A teammate can replace it behind a provider after data governance and evaluation are approved.

## FastText and comparisons

The proposed experiment will train domain-adapted subword FastText embeddings on permitted, anonymized, synthetic, or appropriately licensed Indian transaction text. Anchors should be reviewed per category and cover UPI handles, merchant aliases, bank narration, card/NEFT/IMPS/RTGS descriptors, income, transfers, utilities, and billers. Merchant-neighborhood discovery may inform reviewed aliases but must not automatically create user-facing global rules.

The novelty assessment also proposes SentenceTransformer plus XGBoost as a comparative architecture; the thesis and strategy documents emphasize broader financial-intelligence/AA features. Those are research alternatives, not current production dependencies. Compare a keyword/regex baseline, TF-IDF, anchored FastText, and a selected hybrid on the same frozen temporal test set. Use XGBoost or sentence embeddings only if evidence justifies their operational cost and privacy footprint.

## Evaluation plan and current evidence

`ml/transaction-categorization/evaluation.py` supplies a chronological split and dependency-free per-category precision/recall/F1, macro F1, weighted F1, confusion matrix, and abstention rate. The Python tests use synthetic narration only. The following remain **not measured** because no consented or licensed labeled dataset and trained artifact were supplied:

- Macro F1 (target >85%), weighted F1, precision, recall, and confusion matrix.
- Confidence calibration and coverage/accuracy tradeoff.
- Inference latency and memory on target Android devices.
- Comparative baselines and merchant-neighborhood quality.

For each experiment, freeze a dataset manifest, label definitions, model version, and date cutoff. Keep later transactions out of training and tuning. Split by time (and ideally by merchant/user group) to reduce near-duplicate leakage. Report class counts, per-category support, abstention, and confidence calibration with results. Do not use personal customer narrations without lawful basis, informed scope, and appropriate de-identification.

## Limitations and next research steps

- The shipping web baseline is a small, hand-authored weak-label set; it will not identify unfamiliar merchants semantically and can fail on atypical narration.
- Agreement between rules is not a probability of correctness.
- Category display names must match an existing category; unmatched labels abstain.
- Feedback remains browser-local and user-specific. It is not a global training corpus.
- The FastText provider is an integration boundary, not a claim that a trained or benchmarked model currently exists.
- Add reviewed aliases and category mappings only with a documented test; evaluate normalization against actual supported bank formats before expanding coverage.
