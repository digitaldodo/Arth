"""Run comparable temporal holdout measurements on a supplied labeled CSV corpus."""
from __future__ import annotations
import argparse
import csv
import json
import time
from pathlib import Path

from evaluation import classification_metrics, temporal_split
from pipeline import CATEGORIES, LABELING_FUNCTIONS, aggregate_weak_labels, normalize


def weak_predict(text: str):
    normalized = normalize(text)
    start = time.perf_counter()
    result = aggregate_weak_labels((name, function(normalized)) for name, function in LABELING_FUNCTIONS)
    return result.category, result.confidence, (time.perf_counter() - start) * 1000


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("dataset", help="CSV with date, narration, label columns; no personal data without consent")
    parser.add_argument("--model", help="Optional versioned FastText model artifact")
    parser.add_argument("--embedding-artifact", help="Optional unsupervised skip-gram FastText artifact for Snorkel + anchored FastText + XGBoost")
    parser.add_argument("--imbalance-experiments", action="store_true", help="Run training-only RandomOverSampler, SMOTE, and text-augmentation experiments")
    parser.add_argument("--output", default="categorization-evaluation.json")
    args = parser.parse_args()
    rows = list(csv.DictReader(Path(args.dataset).open(encoding="utf-8-sig", newline="")))
    for row in rows:
        if not row.get("date") or not row.get("narration") or row.get("label") not in CATEGORIES:
            raise ValueError("Each CSV row needs date, narration, and a supported category label")
    train_rows, test_rows = temporal_split(rows)
    expected = [row["label"] for row in test_rows]
    report = {
        "dataset": {"rows": len(rows), "train_rows": len(train_rows), "test_rows": len(test_rows), "split": "chronological holdout", "personal_data_uploaded": False},
        "models": {},
    }

    regex_rows = [weak_predict(row["narration"]) for row in test_rows]
    report["models"]["weak_label_rules"] = {**classification_metrics(expected, [x[0] for x in regex_rows], list(CATEGORIES), [x[1] for x in regex_rows]), "mean_latency_ms": sum(x[2] for x in regex_rows) / len(regex_rows) if regex_rows else 0.0}

    label_index = {category: index for index, category in enumerate(CATEGORIES)}
    def vote_matrix(dataset):
        import numpy as np
        matrix = np.full((len(dataset), len(LABELING_FUNCTIONS)), -1, dtype=int)
        for row_index, row in enumerate(dataset):
            normalized = normalize(row["narration"])
            for lf_index, (_name, function) in enumerate(LABELING_FUNCTIONS):
                label = function(normalized)
                if label in label_index:
                    matrix[row_index, lf_index] = label_index[label]
        return matrix

    try:
        train_votes = vote_matrix(train_rows)
        test_votes = vote_matrix(test_rows)
        lf_report = {}
        for index, (name, _function) in enumerate(LABELING_FUNCTIONS):
            votes = train_votes[:, index]
            lf_report[name] = {
                "coverage": float((votes >= 0).mean()) if len(votes) else 0.0,
                "abstention_rate": float((votes < 0).mean()) if len(votes) else 0.0,
                "category_votes": {category: int((votes == label_index[category]).sum()) for category in CATEGORIES if (votes == label_index[category]).any()},
            }
        conflicts = 0
        overlapping = 0
        for row_votes in train_votes:
            active = row_votes[row_votes >= 0]
            overlapping += int(len(active) > 1)
            conflicts += int(len(set(active.tolist())) > 1)
        pair_overlap = {}
        for left in range(train_votes.shape[1]):
            for right in range(left + 1, train_votes.shape[1]):
                pair_overlap[f"{LABELING_FUNCTIONS[left][0]}::{LABELING_FUNCTIONS[right][0]}"] = int(((train_votes[:, left] >= 0) & (train_votes[:, right] >= 0)).sum())
        report["labeling_functions"] = {
            "training_rows": len(train_rows), "per_function": lf_report,
            "rows_with_multiple_votes": overlapping, "conflicting_rows": conflicts,
            "pairwise_overlap_counts": pair_overlap,
        }
        from weak_supervision import SnorkelLabelModel
        label_model = SnorkelLabelModel(CATEGORIES).fit(train_votes)
        weak_results = [label_model.predict_one(votes) for votes in test_votes]
        report["models"]["snorkel_label_model"] = {
            **classification_metrics(expected, [item.category for item in weak_results], list(CATEGORIES), [item.confidence for item in weak_results]),
            "model_version": label_model.version,
            "label_model_assumption": "conditional independence unless supported dependency edges are configured",
            "status": "measured",
        }
    except (ImportError, RuntimeError, ValueError) as cause:
        report["models"]["snorkel_label_model"] = {"status": "not_run", "reason": f"Snorkel adapter unavailable or could not fit the LF matrix: {type(cause).__name__}"}

    try:
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.preprocessing import LabelEncoder
        from sklearn.utils.class_weight import compute_sample_weight
        from xgboost import XGBClassifier
        vectorizer = TfidfVectorizer(ngram_range=(1, 2), min_df=1, max_df=1.0, max_features=50000, sublinear_tf=True, norm="l2")
        train_vectors = vectorizer.fit_transform([normalize(row["narration"]).text for row in train_rows])
        encoder = LabelEncoder().fit([row["label"] for row in train_rows])
        y_train = encoder.transform([row["label"] for row in train_rows])
        classifier = XGBClassifier(
            objective="multi:softprob", num_class=len(encoder.classes_), n_estimators=300,
            max_depth=6, learning_rate=0.08, subsample=0.85, colsample_bytree=0.8,
            reg_lambda=1.0, eval_metric="mlogloss", tree_method="hist", random_state=17,
        )
        training_started = time.perf_counter()
        classifier.fit(train_vectors, y_train, sample_weight=compute_sample_weight("balanced", y_train))
        training_seconds = time.perf_counter() - training_started
        test_vectors = vectorizer.transform([normalize(row["narration"]).text for row in test_rows])
        inference_started = time.perf_counter()
        probabilities = classifier.predict_proba(test_vectors)
        inference_ms = (time.perf_counter() - inference_started) * 1000
        confidence = [float(max(row)) for row in probabilities]
        predicted = [encoder.inverse_transform([index])[0] if confidence[row_index] >= 0.65 else None for row_index, index in enumerate(row.argmax() for row in probabilities)]
        report["models"]["tfidf_xgboost"] = {
            **classification_metrics(expected, predicted, list(CATEGORIES), confidence),
            "mean_latency_ms": inference_ms / len(test_rows) if test_rows else 0.0,
            "training_seconds": training_seconds,
            "feature_dimensions": int(train_vectors.shape[1]),
            "vocabulary_size": len(vectorizer.vocabulary_),
            "hyperparameters": classifier.get_params(),
            "status": "measured",
        }
        if args.imbalance_experiments:
            from imbalance_experiments import resample_training_vectors, semantic_text_augment
            from sklearn.feature_extraction.text import TfidfVectorizer
            for method in ("random_oversampler", "smote"):
                try:
                    sampled_vectors, sampled_labels, counts = resample_training_vectors(train_vectors, list(y_train), method)
                    balanced_model = XGBClassifier(
                        objective="multi:softprob", num_class=len(encoder.classes_), n_estimators=300,
                        max_depth=6, learning_rate=0.08, subsample=0.85, colsample_bytree=0.8,
                        reg_lambda=1.0, eval_metric="mlogloss", tree_method="hist", random_state=17,
                    ).fit(sampled_vectors, sampled_labels)
                    probabilities = balanced_model.predict_proba(test_vectors)
                    confidence = [float(max(row)) for row in probabilities]
                    predicted = [encoder.inverse_transform([index])[0] if confidence[row_index] >= 0.65 else None for row_index, index in enumerate(row.argmax() for row in probabilities)]
                    report["models"][f"tfidf_xgboost_{method}"] = {
                        **classification_metrics(expected, predicted, list(CATEGORIES), confidence),
                        "training_class_counts": counts, "status": "measured",
                    }
                except (ImportError, RuntimeError, ValueError) as cause:
                    report["models"][f"tfidf_xgboost_{method}"] = {"status": "not_run", "reason": type(cause).__name__}

            augmented = semantic_text_augment(train_rows)
            aug_vectorizer = TfidfVectorizer(ngram_range=(1, 2), min_df=1, max_df=1.0, max_features=50000, sublinear_tf=True, norm="l2")
            aug_train_vectors = aug_vectorizer.fit_transform([normalize(row["narration"]).text for row in augmented])
            aug_labels = encoder.transform([row["label"] for row in augmented])
            aug_model = XGBClassifier(
                objective="multi:softprob", num_class=len(encoder.classes_), n_estimators=300,
                max_depth=6, learning_rate=0.08, subsample=0.85, colsample_bytree=0.8,
                reg_lambda=1.0, eval_metric="mlogloss", tree_method="hist", random_state=17,
            ).fit(aug_train_vectors, aug_labels)
            probabilities = aug_model.predict_proba(aug_vectorizer.transform([normalize(row["narration"]).text for row in test_rows]))
            confidence = [float(max(row)) for row in probabilities]
            predicted = [encoder.inverse_transform([index])[0] if confidence[row_index] >= 0.65 else None for row_index, index in enumerate(row.argmax() for row in probabilities)]
            report["models"]["tfidf_xgboost_semantic_text_augmentation"] = {
                **classification_metrics(expected, predicted, list(CATEGORIES), confidence),
                "training_rows_before": len(train_rows), "training_rows_after": len(augmented),
                "synthetic_training_rows": len(augmented) - len(train_rows), "status": "measured",
            }
    except ImportError:
        report["models"]["tfidf_xgboost"] = {"status": "not_run", "reason": "scikit-learn and xgboost research dependencies are not installed"}

    try:
        from sentence_transformers import SentenceTransformer
        from sklearn.preprocessing import LabelEncoder
        from sklearn.utils.class_weight import compute_sample_weight
        from xgboost import XGBClassifier
        encoder = LabelEncoder().fit([row["label"] for row in train_rows])
        model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
        train_text = [normalize(row["narration"]).text for row in train_rows]
        test_text = [normalize(row["narration"]).text for row in test_rows]
        training_started = time.perf_counter()
        train_vectors = model.encode(train_text, convert_to_numpy=True, show_progress_bar=False)
        test_vectors = model.encode(test_text, convert_to_numpy=True, show_progress_bar=False)
        encoder_seconds = time.perf_counter() - training_started
        y_train = encoder.transform([row["label"] for row in train_rows])
        classifier = XGBClassifier(
            objective="multi:softprob", num_class=len(encoder.classes_), n_estimators=300,
            max_depth=6, learning_rate=0.08, subsample=0.85, colsample_bytree=0.8,
            reg_lambda=1.0, eval_metric="mlogloss", tree_method="hist", random_state=17,
        )
        classifier.fit(train_vectors, y_train, sample_weight=compute_sample_weight("balanced", y_train))
        inference_started = time.perf_counter()
        probabilities = classifier.predict_proba(test_vectors)
        inference_ms = (time.perf_counter() - inference_started) * 1000
        confidence = [float(max(row)) for row in probabilities]
        predicted = [encoder.inverse_transform([index])[0] if confidence[row_index] >= 0.65 else None for row_index, index in enumerate(row.argmax() for row in probabilities)]
        report["models"]["sentence_transformer_xgboost"] = {
            **classification_metrics(expected, predicted, list(CATEGORIES), confidence),
            "mean_latency_ms": inference_ms / len(test_rows) if test_rows else 0.0,
            "embedding_model": "sentence-transformers/all-MiniLM-L6-v2",
            "embedding_dimensions": int(train_vectors.shape[1]),
            "embedding_seconds": encoder_seconds,
            "status": "measured",
        }
    except (ImportError, OSError) as cause:
        report["models"]["sentence_transformer_xgboost"] = {"status": "not_run", "reason": f"Research dependencies or local model artifact unavailable: {type(cause).__name__}"}

    if args.embedding_artifact:
        try:
            from anchored_hybrid import AnchoredHybrid
            train_texts = [row["narration"] for row in train_rows]
            test_texts = [row["narration"] for row in test_rows]
            started = time.perf_counter()
            hybrid_model = AnchoredHybrid.fit(train_texts, args.embedding_artifact, version=Path(args.embedding_artifact).stem)
            training_seconds = time.perf_counter() - started
            inference_started = time.perf_counter()
            hybrid_results = hybrid_model.predict(test_texts)
            inference_ms = (time.perf_counter() - inference_started) * 1000
            report["models"]["snorkel_anchored_fasttext_xgboost"] = {
                **classification_metrics(expected, [item["category"] for item in hybrid_results], list(CATEGORIES), [item["confidence"] for item in hybrid_results]),
                "model_version": hybrid_model.version,
                "mean_latency_ms": inference_ms / len(test_rows) if test_rows else 0.0,
                "training_seconds": training_seconds,
                "embedding_artifact": Path(args.embedding_artifact).name,
                "classifier_hyperparameters": hybrid_model.classifier.get_params(),
                "status": "measured",
            }
        except (ImportError, RuntimeError, ValueError, OSError) as cause:
            report["models"]["snorkel_anchored_fasttext_xgboost"] = {"status": "not_run", "reason": f"Artifact, Snorkel model or research dependencies unavailable: {type(cause).__name__}"}
    else:
        report["models"]["snorkel_anchored_fasttext_xgboost"] = {"status": "not_run", "reason": "No unsupervised skip-gram FastText artifact supplied"}

    if args.model:
        from fasttext_adapter import FastTextArtifact
        anchors = {
            "food_dining": ("restaurant", "cafe", "swiggy", "zomato", "food"),
            "shopping": ("amazon", "flipkart", "retail", "shopping"),
            "utilities": ("electricity", "water", "broadband", "recharge"),
            "transport": ("uber", "ola", "metro", "petrol"),
            "salary": ("salary", "payroll", "credited"),
            "transfer": ("self transfer", "own account", "imps"),
        }
        provider = FastTextArtifact(args.model, Path(args.model).stem, anchors)
        start = time.perf_counter()
        fasttext_predictions = [provider.predict(normalize(row["narration"]).text) for row in test_rows]
        elapsed_ms = (time.perf_counter() - start) * 1000
        model_labels = [item[0] if item[1] >= 0.72 else None for item in fasttext_predictions]
        report["models"]["anchored_fasttext"] = {**classification_metrics(expected, model_labels, list(CATEGORIES), [item[1] for item in fasttext_predictions]), "mean_latency_ms": elapsed_ms / len(test_rows) if test_rows else 0.0}
        hybrid = []
        hybrid_confidence = []
        for weak, model in zip(regex_rows, fasttext_predictions):
            if weak[0] and weak[0] == model[0] and model[1] >= 0.72:
                hybrid.append(weak[0])
                hybrid_confidence.append(min(weak[1], model[1]))
            else:
                hybrid.append(None)
                hybrid_confidence.append(None)
        report["models"]["agreement_hybrid"] = classification_metrics(expected, hybrid, list(CATEGORIES), hybrid_confidence)
    else:
        report["models"]["anchored_fasttext"] = {"status": "not_run", "reason": "No trained model artifact supplied"}
        report["models"]["agreement_hybrid"] = {"status": "not_run", "reason": "Requires FastText artifact"}

    Path(args.output).write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
