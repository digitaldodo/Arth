# SpendSense dataset and labeling guide

## Permitted data and minimization

Use only public data with compatible licenses, generated synthetic descriptions clearly marked as synthetic, or appropriately anonymized and consented descriptions. Exclude raw SMS, full statements, account/card identifiers, UTRs and unrelated personal content. Do not report synthetic rows as genuine transactions. Keep personal user corrections separate from any aggregate research corpus.

## Dataset manifest

Each frozen dataset release should record: manifest version, source and license/consent basis, collection and cutoff dates, source count, row count, language/script coverage, synthetic vs real counts, de-identification rules, deduplication method, category taxonomy version, annotator guidance, adjudication process, class counts, train/validation/test IDs, and SHA-256 hashes. Store only the minimum narration text required by the approved research protocol.

## Labels and splits

Keep transaction direction separate from expense category. Keep merchant identity, necessity, payment method and tax treatment separate. Tax eligibility is never inferred from a category alone. Maintain a verified gold subset distinct from Snorkel weak labels. Use temporal train/validation/test splits; group exact and near-duplicate originals, repeated template examples and derived augmentations to prevent leakage. Fit text vocabulary and augmentation only after splitting.

## Quality controls

Measure annotator agreement and adjudicate ambiguous rows. Include a documented `other` and abstention policy. Audit label-function coverage, overlap, conflicts and abstention separately from gold metrics. Track category support and representation by source/language. Review synthetic examples for template leakage and label shortcuts.

## Current data availability

No approved research dataset is present in the repository. No measured model result can currently be reproduced from a dataset manifest. Do not use the sample parser fixtures as a benchmark corpus or infer production quality from unit-test cases.
