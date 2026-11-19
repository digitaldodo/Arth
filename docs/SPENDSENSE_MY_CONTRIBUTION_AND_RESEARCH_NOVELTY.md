# SpendSense implementation contribution and research novelty

## Scope implemented

The user's implementation scope is product branding and experience, Indian-context transaction categorization, explainable correction flow, and financial-document intake/review. The existing React/TypeScript frontend, backend, Android companion, Supabase database, and local offline persistence remain in place; this work does not rewrite the ledger or authentication layer.

## Primary research contribution

**Weakly Supervised Indian-Context Transaction Categorization using Anchored FastText Embeddings** is the assigned research direction. It addresses noisy, abbreviated, obfuscated UPI and bank narration through normalization, abstaining labeling functions, weak-label aggregation, domain-anchored FastText subwords, classification, confidence-aware abstention, explanation, and explicit human corrections.

The current working product path is a deterministic weak-label baseline that suggests only when at least two labeling signals agree. It shows the rule evidence and requires user confirmation. Explicit category corrections are scoped to the user's browser profile and stored locally as a hashed merchant fingerprint, selected existing category ID, and time. It does not train a global model. The replaceable FastText provider and evaluation harness are research infrastructure; no trained artifact or labeled customer dataset is bundled. The novelty assessment's >85% macro-F1 is a target only. No measured accuracy is claimed.

## Supporting engineering contribution

The document intake/review path supports local document parsing and optional local OCR, candidate extraction, and human review before verification. Provenance-aware facts are handed to a future tax module using `FinancialFact`; extracted documents are not silently treated as verified and this assigned scope does not create a second tax calculation engine. PDF processing and field behavior should be assessed against the tests and current UI implementation in `frontend/src/features/tax/` and `frontend/src/features/imports/`.

Branding and UI/UX improvements are substantial product engineering, not a claim of independent academic novelty. They prepare a clear, responsive user experience for transparent categorization and safe document review.

## Evaluation and defense

Evaluate on a licensed, consented, de-identified or synthetic corpus using chronological separation; also group by merchant/user where possible. Report category definitions and class support, precision, recall, macro/weighted F1, confusion matrix, abstention rate, calibration, latency, model version, and baseline comparisons. Compare deterministic rules, TF-IDF, anchored FastText, and a selected hybrid under the same data split. Include weak-label coverage and conflicts separately from test labels. Avoid leakage through near-duplicate descriptions and references.

Defensible current statement: *SpendSense contains a conservative Indian-context weak-label suggestion path and a replaceable anchored-FastText research adapter; production model efficacy remains to be evaluated on an appropriate dataset.* It is not defensible to state that the 85% target is met, that rules understand all unfamiliar merchants, or that document extraction itself is a novel algorithm.

## Research-document conflicts and boundaries

The supplied novelty assessment calls Safe-to-Spend the overall highest-ranked novelty, while the user's requested ownership assigns transaction categorization as their main contribution. The thesis evaluation warns against SMS scraping and recommends AA plus statements; the user's later instruction explicitly makes SMS functionality mandatory. Direct APK builds do not request restricted inbox permissions, so they cannot scan inbox history or receive SMS broadcasts. They support optional detection of visible notifications from the current default Messages app after explicit Android Notification access, plus manual, user-selected message import. Android can hide or redact notification text, so detection is conditional and not a complete replacement for inbox access. Team-owned Safe-to-Spend, forecasting, tax calculation, AA, and other engines remain disabled scaffolds.
