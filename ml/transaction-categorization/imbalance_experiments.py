"""Training-only imbalance methods for repeatable categorization experiments."""
from __future__ import annotations

from collections import Counter
from typing import Any


TEXT_VARIANTS = {
    "cafe": ("coffee shop", "café"),
    "restaurant": ("dining place", "food outlet"),
    "petrol": ("fuel station",),
    "electricity": ("power bill",),
    "tuition": ("education fee",),
}


def semantic_text_augment(training_rows: list[dict]) -> list[dict]:
    """Return original train rows plus one clearly marked, origin-linked text variant where applicable."""
    output = list(training_rows)
    for index, row in enumerate(training_rows):
        source = row["narration"]
        lowered = source.lower()
        for token, replacements in TEXT_VARIANTS.items():
            if token in lowered:
                replacement = replacements[index % len(replacements)]
                synthetic = dict(row)
                synthetic["narration"] = source.replace(token, replacement)
                synthetic["synthetic"] = True
                synthetic["origin_id"] = row.get("origin_id", row.get("id", f"train-{index}"))
                output.append(synthetic)
                break
    return output


def resample_training_vectors(vectors: Any, labels: list[int], method: str, seed: int = 17):
    """Resample only the already-separated training feature matrix."""
    if method == "none":
        return vectors, labels, {"before": dict(Counter(labels)), "after": dict(Counter(labels))}
    try:
        from imblearn.over_sampling import RandomOverSampler, SMOTE
    except ImportError as cause:
        raise RuntimeError("Install imbalanced-learn for controlled resampling experiments") from cause
    if method == "random_oversampler":
        sampler = RandomOverSampler(random_state=seed)
    elif method == "smote":
        counts = Counter(labels)
        minority = min(counts.values()) if counts else 0
        if minority < 2:
            raise ValueError("SMOTE requires at least two training samples in each resampled class")
        sampler = SMOTE(random_state=seed, k_neighbors=min(5, minority - 1))
    else:
        raise ValueError("method must be none, random_oversampler, or smote")
    sampled_vectors, sampled_labels = sampler.fit_resample(vectors, labels)
    final_labels = list(int(value) for value in sampled_labels)
    return sampled_vectors, final_labels, {"before": dict(Counter(labels)), "after": dict(Counter(final_labels)), "method": method}
