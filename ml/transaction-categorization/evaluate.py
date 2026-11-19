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

    try:
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.linear_model import LogisticRegression
        vectorizer = TfidfVectorizer(ngram_range=(1, 2), min_df=1, sublinear_tf=True)
        train_vectors = vectorizer.fit_transform([normalize(row["narration"]).text for row in train_rows])
        classifier = LogisticRegression(class_weight="balanced", max_iter=1000)
        classifier.fit(train_vectors, [row["label"] for row in train_rows])
        started = time.perf_counter()
        test_vectors = vectorizer.transform([normalize(row["narration"]).text for row in test_rows])
        probabilities = classifier.predict_proba(test_vectors)
        confidence = [float(max(row)) for row in probabilities]
        predicted = [classifier.classes_[index] if confidence[row_index] >= 0.65 else None for row_index, index in enumerate(row.argmax() for row in probabilities)]
        elapsed_ms = (time.perf_counter() - started) * 1000
        report["models"]["tfidf_logistic_regression"] = {**classification_metrics(expected, predicted, list(CATEGORIES), confidence), "mean_latency_ms": elapsed_ms / len(test_rows) if test_rows else 0.0}
    except ImportError:
        report["models"]["tfidf_logistic_regression"] = {"status": "not_run", "reason": "scikit-learn is not installed"}

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
