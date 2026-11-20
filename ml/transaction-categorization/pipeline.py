"""Weak-label categorization stages; no trained or customer-data model is bundled."""
from __future__ import annotations

from dataclasses import dataclass
import math
import re
from typing import Callable, Iterable, Optional, Protocol

ABSTAIN = None
CATEGORIES = (
    "food_dining", "shopping", "utilities", "rent", "transport", "education",
    "emi_loan", "healthcare", "entertainment", "salary", "other_income",
    "transfer", "refund", "other",
)


@dataclass(frozen=True)
class NormalizedText:
    text: str
    merchant_handle: Optional[str]
    transaction_kind: Optional[str]
    reference: Optional[str]


@dataclass(frozen=True)
class Prediction:
    category: Optional[str]
    confidence: float
    evidence: tuple[str, ...]
    model_version: str
    method: str
    requires_confirmation: bool


def normalize(raw: str) -> NormalizedText:
    """Normalize narration while separating values that can leak or overfit."""
    value = raw.lower().replace("\u00a0", " ")
    handle_match = re.search(r"[a-z0-9._-]+@[a-z]{2,}", value)
    ref_match = re.search(r"\b(?:utr|rrn|ref(?:erence)?|txn(?:\s*id)?)\s*[:#-]?\s*([a-z0-9]{6,25})\b", value)
    kind = next((k for p, k in ((r"\bupi\b", "upi"), (r"\bneft\b", "neft"), (r"\bimps\b", "imps"), (r"\brtgs\b", "rtgs"), (r"\bpos\b|\bcard\b", "card")) if re.search(p, value)), None)
    value = re.sub(r"\b(?:utr|rrn|ref(?:erence)?|txn(?:\s*id)?)\s*[:#-]?\s*[a-z0-9]{6,25}\b", " ", value)
    value = re.sub(r"\b(?:inr|rs\.?|₹)\s*[0-9,]+(?:\.[0-9]{1,2})?", " amount ", value)
    value = re.sub(r"\b[0-9]{8,}\b", " ref ", value)
    value = re.sub(r"[^a-z0-9@._-]+", " ", value)
    return NormalizedText(" ".join(value.split()), handle_match.group(0) if handle_match else None, kind, ref_match.group(1) if ref_match else None)


LabelingFunction = Callable[[NormalizedText], Optional[str]]


def _contains(text: str, *terms: str) -> bool:
    return any(re.search(r"\b" + re.escape(term) + r"\b", text) for term in terms)


def merchant_aliases(value: NormalizedText) -> Optional[str]:
    aliases = {
        "swiggy": "food_dining", "zomato": "food_dining", "zepto": "shopping",
        "blinkit": "shopping", "amazon": "shopping", "flipkart": "shopping",
        "uber": "transport", "ola": "transport", "irctc": "transport",
        "netflix": "entertainment", "spotify": "entertainment",
    }
    return next((category for merchant, category in aliases.items() if merchant in value.text or (value.merchant_handle and merchant in value.merchant_handle)), ABSTAIN)


def transaction_intent(value: NormalizedText) -> Optional[str]:
    if _contains(value.text, "refund", "reversed", "reversal"):
        return "refund"
    if _contains(value.text, "salary", "payroll"):
        return "salary"
    if _contains(value.text, "transfer", "self", "own", "account") and _contains(value.text, "to", "from", "transfer"):
        return "transfer"
    if _contains(value.text, "interest", "dividend", "cashback"):
        return "other_income"
    return ABSTAIN


def merchant_keywords(value: NormalizedText) -> Optional[str]:
    return merchant_aliases(value)


def upi_handle_patterns(value: NormalizedText) -> Optional[str]:
    if not value.merchant_handle:
        return ABSTAIN
    handle = value.merchant_handle
    handle_categories = {
        "swiggy": "food_dining", "zomato": "food_dining", "blinkit": "shopping",
        "zepto": "shopping", "uber": "transport", "ola": "transport",
    }
    return next((category for merchant, category in handle_categories.items() if merchant in handle), ABSTAIN)


def bank_narration_patterns(value: NormalizedText) -> Optional[str]:
    patterns = (
        (r"\b(?:neft|imps|rtgs)\b.*\b(?:own account|self transfer)\b", "transfer"),
        (r"\b(?:salary|payroll)\b", "salary"),
        (r"\b(?:refund|reversal|reversed|credited back)\b", "refund"),
    )
    return next((category for pattern, category in patterns if re.search(pattern, value.text)), ABSTAIN)


def known_biller_formats(value: NormalizedText) -> Optional[str]:
    if _contains(value.text, "bescom", "tneb", "billdesk", "electricity", "water bill", "gas bill", "broadband", "recharge"):
        return "utilities"
    return ABSTAIN


def direction_and_transfer(value: NormalizedText) -> Optional[str]:
    if _contains(value.text, "self transfer", "own account", "account transfer"):
        return "transfer"
    return ABSTAIN


def biller_and_context(value: NormalizedText) -> Optional[str]:
    rules = {
        "utilities": ("electricity", "water", "gas", "broadband", "recharge", "billdesk", "bescom", "tneb"),
        "rent": ("rent", "landlord"), "education": ("school", "college", "tuition", "university"),
        "emi_loan": ("emi", "loan", "installment"), "healthcare": ("hospital", "pharmacy", "clinic", "diagnostic"),
        "food_dining": ("restaurant", "cafe", "food", "dining"), "shopping": ("store", "mart", "retail"),
        "transport": ("metro", "fuel", "petrol", "toll", "cab"),
        "entertainment": ("cinema", "movie", "theatre", "gaming"),
    }
    return next((category for category, terms in rules.items() if _contains(value.text, *terms)), ABSTAIN)


LABELING_FUNCTIONS: tuple[tuple[str, LabelingFunction], ...] = (
    ("merchant_keywords", merchant_keywords),
    ("upi_handle_patterns", upi_handle_patterns),
    ("bank_narration_patterns", bank_narration_patterns),
    ("known_biller_formats", known_biller_formats),
    ("direction_and_transfer", direction_and_transfer),
    ("transaction_intent", transaction_intent),
    ("biller_and_context", biller_and_context),
)


def aggregate_weak_labels(votes: Iterable[tuple[str, Optional[str]]]) -> Prediction:
    """Weighted abstention-aware vote aggregation. Votes are not ground truth."""
    counts: dict[str, float] = {}
    evidence: list[str] = []
    for name, category in votes:
        if category not in CATEGORIES:
            continue
        counts[category] = counts.get(category, 0.0) + 1.0
        evidence.append(name)
    if not counts:
        return Prediction(None, 0.0, (), "weak-label-v1", "weak_supervision", True)
    total = sum(counts.values())
    ranked = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    top, weight = ranked[0]
    # A lone weak signal is a low-strength candidate, never a 1.0 confidence.
    confidence = 0.5 if total == 1 else weight / total
    tied = len(ranked) > 1 and math.isclose(ranked[0][1], ranked[1][1])
    accepted = top if (confidence >= 0.67 or total == 1) and not tied else None
    return Prediction(accepted, confidence, tuple(evidence), "weak-label-v1", "weak_supervision", accepted is None)


class EmbeddingModel(Protocol):
    version: str
    def predict(self, text: str) -> tuple[Optional[str], float, tuple[str, ...]]: ...


class AnchoredFastTextProvider:
    """Optional model adapter. A validated artifact must be supplied by deployment."""
    def __init__(self, model: EmbeddingModel, anchors: dict[str, tuple[str, ...]], minimum_confidence: float = 0.72):
        self._model, self._anchors, self._minimum = model, anchors, minimum_confidence

    def classify(self, text: str) -> Prediction:
        normalized = normalize(text)
        model_category, model_confidence, model_evidence = self._model.predict(normalized.text)
        anchor_hits = tuple(f"anchor:{label}" for label, terms in self._anchors.items() if any(term in normalized.text for term in terms))
        if model_category not in CATEGORIES or model_confidence < self._minimum:
            return Prediction(None, max(0.0, min(1.0, model_confidence)), model_evidence + anchor_hits, self._model.version, "anchored_fasttext", True)
        return Prediction(model_category, model_confidence, model_evidence + anchor_hits, self._model.version, "anchored_fasttext", False)
