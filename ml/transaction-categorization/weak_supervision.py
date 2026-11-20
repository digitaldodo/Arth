"""Optional Snorkel LabelModel adapter for probabilistic weak labels.

This module does not train on customer data. Callers provide a separately
versioned LF matrix and may provide a small development set only for
calibration/evaluation, never as ground truth implicitly.
"""
from __future__ import annotations

from dataclasses import dataclass
import inspect
from typing import Optional

import numpy as np


@dataclass(frozen=True)
class WeakLabelResult:
    category: Optional[str]
    confidence: float
    probabilities: tuple[float, ...]
    requires_confirmation: bool
    model_version: str


class SnorkelLabelModel:
    """Naive Bayes factor-graph label model with explicit abstention handling."""
    def __init__(self, categories: tuple[str, ...], version: str = "snorkel-label-model-v1", threshold: float = 0.72):
        if not categories or not 0 < threshold <= 1:
            raise ValueError("categories and a threshold in (0, 1] are required")
        self.categories = categories
        self.version = version
        self.threshold = threshold
        self._model = None

    def fit(self, label_matrix: np.ndarray, *, deps: Optional[list[tuple[int, int]]] = None, seed: int = 17) -> "SnorkelLabelModel":
        if label_matrix.ndim != 2 or label_matrix.shape[1] < 1:
            raise ValueError("label_matrix must have shape (rows, labeling_functions)")
        try:
            from snorkel.labeling.model import LabelModel
        except ImportError as cause:
            raise RuntimeError("Install the isolated research requirements to train Snorkel LabelModel") from cause
        model = LabelModel(cardinality=len(self.categories), verbose=False)
        # The generative label model estimates LF accuracies from agreement
        # structure. Pass explicit dependency edges only in Snorkel versions
        # whose API supports them; otherwise retain the documented conditional
        # independence assumption and report LF overlap/conflicts separately.
        fit_parameters = inspect.signature(model.fit).parameters
        kwargs = {"L_train": label_matrix, "n_epochs": 500, "log_freq": 100, "progress_bar": False, "seed": seed}
        if deps and "deps" in fit_parameters:
            kwargs["deps"] = deps
        model.fit(**kwargs)
        self._model = model
        return self

    def predict_one(self, votes: np.ndarray) -> WeakLabelResult:
        if self._model is None:
            raise RuntimeError("Fit the label model before inference")
        row = np.asarray(votes).reshape(1, -1)
        probs = self._model.predict_proba(row)[0]
        index = int(np.argmax(probs))
        confidence = float(probs[index])
        category = self.categories[index] if confidence >= self.threshold else None
        return WeakLabelResult(category, confidence, tuple(float(value) for value in probs), category is None, self.version)
