# SpendSense weak supervision methodology

## Research question

Can weak supervision and Indian-context semantic anchors improve category suggestions for short, abbreviated, noisy UPI and bank narration while keeping uncertain cases reviewable?

This is the assigned Rank 2 categorization workstream. It is not the overall project's Rank 1 Safe-to-Spend contribution.

## Labeling functions

The current Python module exposes abstaining labeling functions for merchant aliases, transaction intent, and biller/context patterns. The production TypeScript baseline has corresponding merchant/context signals and user-specific corrections. Each function returns a category vote or abstention; conflicts and ties produce no suggestion. A single unopposed signal may be shown only as a low-strength suggestion (0.5 rule-support score) and still requires confirmation. Evidence records the function/source and concise explanation. These heuristic scores are not calibrated probabilities.

This first set is a conservative seed, not a comprehensive merchant dictionary. Indian UPI handles, bank prefixes, biller patterns, income, transfer, refund, salary, card and rail patterns require curated test fixtures before broad support claims.

## Probabilistic label model

`ml/transaction-categorization/weak_supervision.py` provides a research-only adapter for Snorkel `LabelModel`. It learns LF accuracies from the LF vote matrix and returns a probability distribution with a review threshold. The default generative model relies on its documented conditional-independence assumption. Explicit LF dependency edges are only passed when the installed Snorkel version supports that API; otherwise LF overlap/conflict diagnostics must be reported and correlated rules simplified or grouped. The current client-side rules are not a trained Snorkel model and their agreement fraction must not be described as calibrated confidence.

LF coverage, overlap, conflict, and abstention should be computed on a frozen narration set before fitting. Weak labels are kept distinct from manually verified labels. Corrections from a user are higher-quality personal supervision, but are not included in a global training dataset automatically.

## Human review and privacy

All suggestions require confirmation. Low-confidence or conflicting outputs abstain. Explicit user corrections remain user-scoped; the current browser correction store contains a hashed merchant fingerprint and category, not raw narration. Committed category method/evidence/version and correction state are recorded in transaction provenance where available. Personal preferences must not be pooled into aggregate research data without an explicit lawful basis and consent.

## Evaluation protocol

Freeze category definitions and a dataset manifest. Split by time, and group duplicate/near-identical original transactions so one origin does not cross partitions. Fit vocabulary, embedding/classifier parameters and calibration only on training/validation partitions. Report LF coverage, overlap, conflicts and abstentions separately from gold-label model metrics. Evaluate precision, recall, macro F1, weighted F1, per-category support/F1, confusion matrix, abstention coverage, calibration and latency.

No licensed or consented labeled corpus was provided for this implementation. Therefore no SpendSense metric is reported. The literature's 91% balanced accuracy and other reported values are comparative references only; the >85% macro F1 remains a target.
