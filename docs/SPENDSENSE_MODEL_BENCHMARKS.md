# SpendSense model benchmarks

## Status

No benchmark run is reported. The repository contains no supplied licensed or consented labeled Indian transaction corpus and no versioned FastText artifact. An empty or synthetic-only fixture is not evidence of real-user performance.

## Planned comparison

The research runner `ml/transaction-categorization/evaluate.py` uses a chronological holdout. It includes weak-label rules, an optional Snorkel `LabelModel`, TF-IDF unigram/bigram with XGBoost, SentenceTransformer `all-MiniLM-L6-v2` embeddings with XGBoost, optional supervised FastText evaluation, and the experimental Snorkel probabilistic labels + unsupervised anchored FastText features + XGBoost path (`anchored_hybrid.py`). Research dependencies are isolated in `requirements-research.txt`; none are required by the web or Android runtime. Model artifacts and dataset manifests must be kept outside application bundles.

Controlled class imbalance support is optional via `--imbalance-experiments`: the runner applies RandomOverSampler or SMOTE only to the already-split training feature matrix and creates clearly marked, origin-linked text variants from training rows only. SMOTE is skipped with a reason when the training representation or class support is unsuitable. These experiments have not been run on an approved dataset.

## Required report fields

Report accuracy, macro F1, weighted F1, precision, recall, per-category F1/support, confusion matrix, abstention and coverage, confidence calibration, inference latency, training time, dimensions and hyperparameters. Record model/dataset versions and a reproducible split manifest. Compare uncalibrated output as uncalibrated; do not treat raw softmax or LF agreement as a calibrated probability.

## Literature numbers vs SpendSense measurements

The novelty assessment cites Alhenshiri et al. results of 93.6% overall accuracy for SentenceTransformer + XGBoost, 87.2% for TF-IDF + XGBoost, macro F1 0.866, and weighted F1 0.857. It also cites Toran et al.'s 91% average balanced accuracy. These are literature results, not SpendSense results. The SpendSense macro-F1 target above 85% has not been measured or achieved.
