"""Experimental Snorkel pseudo-label + anchored FastText + XGBoost pipeline."""
from __future__ import annotations
from dataclasses import dataclass
from typing import Any

import numpy as np

from pipeline import CATEGORIES, LABELING_FUNCTIONS, normalize
from weak_supervision import SnorkelLabelModel


DEFAULT_ANCHORS: dict[str, tuple[str, ...]] = {
    "food_dining": ("restaurant", "cafe", "swiggy", "zomato", "food"),
    "shopping": ("market", "amazon", "flipkart", "retail", "shopping"),
    "utilities": ("electricity", "water", "broadband", "recharge", "bill"),
    "rent": ("rent", "landlord", "lease"),
    "transport": ("uber", "ola", "metro", "petrol", "fuel"),
    "education": ("school", "college", "tuition", "university"),
    "emi_loan": ("emi", "loan", "installment"),
    "healthcare": ("hospital", "pharmacy", "clinic", "diagnostic"),
    "entertainment": ("cinema", "movie", "netflix", "spotify"),
    "salary": ("salary", "payroll", "wages"),
    "other_income": ("interest", "dividend", "cashback"),
    "transfer": ("self transfer", "own account", "imps"),
    "refund": ("refund", "reversal", "reversed"),
    "other": ("transaction", "payment"),
}


def _cosine(a: np.ndarray, b: np.ndarray) -> float:
    denominator = float(np.linalg.norm(a) * np.linalg.norm(b))
    return float(np.dot(a, b) / denominator) if denominator else 0.0


def anchored_features(texts: list[str], embedding_model: Any, anchors: dict[str, tuple[str, ...]] = DEFAULT_ANCHORS) -> np.ndarray:
    """Mean subword vectors plus per-category maximum anchor cosine scores."""
    rows = []
    for text in texts:
        normalized = normalize(text)
        vectors = [np.asarray(embedding_model.get_word_vector(token), dtype=np.float32) for token in normalized.text.split() if token]
        base = np.mean(vectors, axis=0) if vectors else np.zeros(embedding_model.get_dimension(), dtype=np.float32)
        similarities = []
        for category in CATEGORIES:
            category_anchors = anchors.get(category, ())
            similarities.append(max((_cosine(base, embedding_model.get_word_vector(anchor)) for anchor in category_anchors), default=0.0))
        rows.append(np.concatenate([base, np.asarray(similarities, dtype=np.float32)]))
    return np.vstack(rows) if rows else np.empty((0, embedding_model.get_dimension() + len(CATEGORIES)), dtype=np.float32)


def labeling_matrix(texts: list[str]) -> np.ndarray:
    index = {category: number for number, category in enumerate(CATEGORIES)}
    matrix = np.full((len(texts), len(LABELING_FUNCTIONS)), -1, dtype=np.int32)
    for row_index, text in enumerate(texts):
        normalized = normalize(text)
        for column, (_name, function) in enumerate(LABELING_FUNCTIONS):
            vote = function(normalized)
            if vote in index:
                matrix[row_index, column] = index[vote]
    return matrix


@dataclass
class AnchoredHybrid:
    label_model: SnorkelLabelModel
    embedding_model: Any
    classifier: Any
    label_encoder: Any
    anchors: dict[str, tuple[str, ...]]
    version: str

    @classmethod
    def fit(cls, train_texts: list[str], embedding_path: str, *, version: str, pseudo_label_threshold: float = 0.75, seed: int = 17):
        try:
            import fasttext
            from sklearn.preprocessing import LabelEncoder
            from sklearn.utils.class_weight import compute_sample_weight
            from xgboost import XGBClassifier
        except ImportError as cause:
            raise RuntimeError("Install research-only dependencies before fitting the anchored hybrid") from cause
        embedding_model = fasttext.load_model(embedding_path)
        label_model = SnorkelLabelModel(CATEGORIES, version=f"{version}-snorkel-label").fit(labeling_matrix(train_texts), seed=seed)
        weak_results = [label_model.predict_one(votes) for votes in labeling_matrix(train_texts)]
        accepted = [(text, result.category) for text, result in zip(train_texts, weak_results)
                    if result.category is not None and result.confidence >= pseudo_label_threshold]
        if len(accepted) < 2:
            raise ValueError("Fewer than two training rows passed the weak-label threshold")
        selected_texts, selected_labels = zip(*accepted)
        if len(set(selected_labels)) < 2:
            raise ValueError("Weak-label training rows must cover at least two categories")
        encoder = LabelEncoder().fit(selected_labels)
        y = encoder.transform(selected_labels)
        classifier = XGBClassifier(
            objective="multi:softprob", num_class=len(encoder.classes_), n_estimators=300,
            max_depth=5, learning_rate=0.08, subsample=0.85, colsample_bytree=0.8,
            reg_lambda=1.0, eval_metric="mlogloss", tree_method="hist", random_state=seed,
        )
        x = anchored_features(list(selected_texts), embedding_model)
        classifier.fit(x, y, sample_weight=compute_sample_weight("balanced", y))
        return cls(label_model, embedding_model, classifier, encoder, DEFAULT_ANCHORS, version)

    def predict(self, texts: list[str], *, threshold: float = 0.65) -> list[dict]:
        features = anchored_features(texts, self.embedding_model, self.anchors)
        probabilities = self.classifier.predict_proba(features)
        results = []
        for row in probabilities:
            index = int(np.argmax(row))
            confidence = float(row[index])
            category = str(self.label_encoder.inverse_transform([index])[0]) if confidence >= threshold else None
            results.append({
                "category": category,
                "confidence": confidence,
                "requires_confirmation": category is None or confidence < 0.8,
                "model_version": self.version,
                "method": "snorkel_anchored_fasttext_xgboost",
            })
        return results
