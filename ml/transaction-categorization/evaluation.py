"""Reproducible, dependency-free metrics and temporal split utilities."""
from __future__ import annotations
from collections import Counter
from datetime import date


def temporal_split(rows: list[dict], date_key: str = "date", test_fraction: float = 0.2) -> tuple[list[dict], list[dict]]:
    ordered = sorted(rows, key=lambda row: row[date_key])
    if len(ordered) < 2 or not 0 < test_fraction < 1:
        raise ValueError("Need at least two chronologically dated rows and a fraction between zero and one")
    boundary = max(1, min(len(ordered) - 1, int(len(ordered) * (1 - test_fraction))))
    return ordered[:boundary], ordered[boundary:]


def classification_metrics(
    expected: list[str],
    predicted: list[str | None],
    labels: list[str],
    confidence: list[float | None] | None = None,
) -> dict:
    if len(expected) != len(predicted):
        raise ValueError("Expected and predicted arrays must have equal length")
    if confidence is not None and len(expected) != len(confidence):
        raise ValueError("Confidence array must have the same length as expected labels")
    abstain_label = "<abstain>"
    matrix = {label: {candidate: 0 for candidate in [*labels, abstain_label]} for label in labels}
    abstentions = 0
    for truth, prediction in zip(expected, predicted):
        if prediction is None:
            abstentions += 1
            matrix.setdefault(truth, {candidate: 0 for candidate in [*labels, abstain_label]})[abstain_label] += 1
            continue
        matrix.setdefault(truth, {}).setdefault(prediction, 0)
        matrix[truth][prediction] += 1
    per_class = {}
    for label in labels:
        tp = matrix.get(label, {}).get(label, 0)
        fp = sum(matrix.get(actual, {}).get(label, 0) for actual in matrix if actual != label)
        fn = sum(matrix.get(label, {}).values()) - tp
        precision = tp / (tp + fp) if tp + fp else 0.0
        recall = tp / (tp + fn) if tp + fn else 0.0
        per_class[label] = {"precision": precision, "recall": recall, "f1": 2 * precision * recall / (precision + recall) if precision + recall else 0.0, "support": tp + fn}
    total_support = sum(item["support"] for item in per_class.values())
    weighted = sum(item["f1"] * item["support"] for item in per_class.values()) / total_support if total_support else 0.0
    report = {"per_category": per_class, "macro_f1": sum(x["f1"] for x in per_class.values()) / len(labels) if labels else 0.0, "weighted_f1": weighted, "abstention_rate": abstentions / len(expected) if expected else 0.0, "confusion_matrix": matrix}
    if confidence is not None:
        report["confidence_calibration"] = top_label_calibration(expected, predicted, confidence)
    return report


def top_label_calibration(
    expected: list[str], predicted: list[str | None], confidence: list[float | None], bins: int = 10
) -> dict:
    """Fixed-width top-label ECE over non-abstained predictions; this is diagnostic, not a model guarantee."""
    if len(expected) != len(predicted) or len(expected) != len(confidence):
        raise ValueError("Expected, predicted, and confidence arrays must have equal length")
    if bins < 1:
        raise ValueError("bins must be positive")
    rows: list[tuple[float, bool]] = []
    for truth, prediction, score in zip(expected, predicted, confidence):
        if prediction is None or score is None:
            continue
        if not isinstance(score, (int, float)) or not 0.0 <= score <= 1.0:
            raise ValueError("Confidence values must be between zero and one")
        rows.append((float(score), truth == prediction))
    bucket_rows: list[list[tuple[float, bool]]] = [[] for _ in range(bins)]
    for score, correct in rows:
        bucket_rows[min(int(score * bins), bins - 1)].append((score, correct))
    calibration_bins = []
    ece = 0.0
    for index, bucket in enumerate(bucket_rows):
        if not bucket:
            continue
        mean_confidence = sum(score for score, _ in bucket) / len(bucket)
        accuracy = sum(correct for _, correct in bucket) / len(bucket)
        ece += len(bucket) / len(rows) * abs(accuracy - mean_confidence)
        calibration_bins.append({
            "lower_bound": index / bins,
            "upper_bound": (index + 1) / bins,
            "count": len(bucket),
            "mean_confidence": mean_confidence,
            "accuracy": accuracy,
        })
    return {
        "method": "fixed_width_top_label_ece",
        "bins": bins,
        "evaluated_predictions": len(rows),
        "excluded_abstentions": len(expected) - len(rows),
        "expected_calibration_error": ece if rows else None,
        "calibration_bins": calibration_bins,
    }
