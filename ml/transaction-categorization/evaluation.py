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


def classification_metrics(expected: list[str], predicted: list[str | None], labels: list[str]) -> dict:
    if len(expected) != len(predicted):
        raise ValueError("Expected and predicted arrays must have equal length")
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
    return {"per_category": per_class, "macro_f1": sum(x["f1"] for x in per_class.values()) / len(labels) if labels else 0.0, "weighted_f1": weighted, "abstention_rate": abstentions / len(expected) if expected else 0.0, "confusion_matrix": matrix}
