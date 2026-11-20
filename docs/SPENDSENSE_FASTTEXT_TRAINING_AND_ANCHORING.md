# SpendSense FastText training and anchoring

## Intended method

The proposed contribution adapts skip-gram FastText subword embeddings to noisy Indian transaction descriptions. Subword n-grams are intended to help with short, misspelled, abbreviated, and obfuscated merchant text. Reviewed domain anchors can provide semantic evidence through cosine similarity; an anchor match is a weak labeling signal, not ground truth.

## Corpus policy

`train_fasttext_embeddings.py` accepts a UTF-8 narration-only file and trains an unsupervised skip-gram artifact. A suitable corpus may contain public descriptions whose license permits this use, clearly marked synthetic Indian narration examples, and appropriately anonymized and consented records. Do not include account identifiers, UTRs, raw SMS bodies, or bank statements. Record source licenses, consent basis, filtering, line count, category coverage where available, deduplication and split manifest.

The cited 18-million-description corpus and approximately 44-character mean sentence length describe Toran et al.'s work. They are not SpendSense data. The training command writes a metadata manifest with artifact path, line count, dimensionality, window, minimum frequency, subword settings, epoch count, threads and timestamp. FastText's Python API does not expose a portable random-seed argument for skip-gram training; exact bitwise reproducibility should not be claimed. Pin dependency versions and corpus hash for reproducible reruns.

## Anchors and fuzzy matching

Anchor terms should be reviewed and mapped to the existing category taxonomy. Candidate Indian-context anchors can cover food/cafes, fuel/transit, utilities/billers, education, healthcare, rent, salary/income, transfers and refunds. For each match, retain anchor, cosine score, configured threshold and vote. Similarity thresholds must be selected on validation data and evaluated on held-out merchants. Never automatically promote neighbors into a global merchant dictionary.

## Current implementation status

The repository now has a skip-gram training command and a separate supervised FastText artifact adapter. No trained unsupervised artifact, licensed corpus, anchor validation, or measured semantic-neighbor quality is present. The production UI therefore continues to use its conservative weak-label rules. The supervised adapter is not evidence that the intended weak-supervision plus anchored-embedding architecture has met its target.
