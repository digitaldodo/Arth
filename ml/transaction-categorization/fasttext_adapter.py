"""Optional FastText artifact adapter. Install fasttext-wheel only in the model environment."""
from __future__ import annotations
import math
from pathlib import Path
from typing import Optional

from pipeline import CATEGORIES, Prediction, normalize


def _cosine(left, right) -> float:
    dot = sum(a * b for a, b in zip(left, right))
    left_norm = math.sqrt(sum(a * a for a in left))
    right_norm = math.sqrt(sum(b * b for b in right))
    return dot / (left_norm * right_norm) if left_norm and right_norm else 0.0


class FastTextArtifact:
    """Optional supervised classifier plus subword similarities to reviewed anchors."""
    def __init__(self, model_path: str, version: str, anchors: dict[str, tuple[str, ...]], anchor_threshold: float = 0.55):
        if not Path(model_path).is_file():
            raise FileNotFoundError("A versioned FastText model artifact is required")
        try:
            import fasttext
        except ImportError as cause:
            raise RuntimeError("Install fasttext-wheel in the isolated research environment") from cause
        self._model = fasttext.load_model(model_path)
        self.version = version
        self._anchors = anchors
        self._anchor_threshold = anchor_threshold

    def predict(self, text: str) -> tuple[Optional[str], float, tuple[str, ...]]:
        labels, probabilities = self._model.predict(text, k=3)
        ranked = []
        for label, probability in zip(labels, probabilities):
            category = label.removeprefix("__label__")
            if category in CATEGORIES:
                ranked.append((category, float(probability)))
        if not ranked:
            return None, 0.0, ()

        # FastText subword vectors allow short, misspelled and unseen UPI/merchant tokens
        # to be compared with reviewed, category-specific anchors.
        tokens = normalize(text).text.split()
        token_vectors = [self._model.get_word_vector(token) for token in tokens if token]
        if token_vectors:
            mean_vector = [sum(vector[i] for vector in token_vectors) / len(token_vectors) for i in range(len(token_vectors[0]))]
            anchor_hits = {
                category: max(((anchor, _cosine(mean_vector, self._model.get_word_vector(anchor))) for anchor in terms), key=lambda item: item[1], default=("", 0.0))
                for category, terms in self._anchors.items()
            }
            anchor_scores = {category: score for category, (_anchor, score) in anchor_hits.items()}
            ranked = [(category, probability * 0.75 + max(0.0, anchor_scores.get(category, 0.0)) * 0.25) for category, probability in ranked]
        category, score = max(ranked, key=lambda item: item[1])
        evidence = ["supervised_fasttext"]
        if token_vectors:
            anchor, similarity = anchor_hits.get(category, ("", 0.0))
            if anchor and similarity >= self._anchor_threshold:
                evidence.append(f"anchor={anchor};cosine={similarity:.4f};threshold={self._anchor_threshold:.4f}")
        return category, min(1.0, max(0.0, score)), tuple(evidence)


class FastTextProvider:
    def __init__(self, artifact: FastTextArtifact, minimum_confidence: float = 0.72):
        self.artifact = artifact
        self.minimum_confidence = minimum_confidence

    def classify(self, narration: str) -> Prediction:
        normalized = normalize(narration)
        category, confidence, evidence = self.artifact.predict(normalized.text)
        accepted = category if category in CATEGORIES and confidence >= self.minimum_confidence else None
        return Prediction(accepted, confidence, evidence, self.artifact.version, "anchored_fasttext", accepted is None)
