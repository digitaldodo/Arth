# SpendSense categorization API contract

## Suggestion result

The frontend `CategorySuggestion` contract returns an existing category, a score in the range 0 to 1, classification method (`weak_supervision` or `user_correction`), supporting evidence items (`source`, `detail`), and `needsConfirmation: true`. The current rule agreement score is a transparent heuristic, not a calibrated probability. A suggestion can be absent when evidence is insufficient, conflicted, or unmapped to an existing user category.

## Transaction commit metadata

The shared transaction request accepts:

- `ingestion_source`: `manual`, `bank_statement`, `message`, or reserved `account_aggregator`.
- `parser_version` and `categorization_model_version` when applicable.
- `category_verified` to record explicit review at commit.
- `categorization_method`, `category_suggestion_confidence`, bounded `category_evidence`, and `category_was_corrected` when available.
- Existing `account_id`, `import_batch_id` and `statement_reference` where applicable.

`category_evidence` is limited to twelve short source/detail pairs by API validation. No raw message or statement content is part of this contract. The backend accepts only known source/method values and confidence within [0, 1].

## Normalized candidate

Adapters should keep raw narration transiently and emit separated candidate fields: amount as an exact decimal string for the existing paise validator, direction, transaction date, description/merchant, payment method, account, source reference, source adapter/version and parser confidence/status. Candidates are not transactions until user confirmation and commit through the existing engine.

## Future model boundary

FastText, Snorkel, XGBoost and SentenceTransformer are research or model-provider implementations, not web API dependencies. A future inference provider must return category ID/label, probability or calibrated confidence, evidence, method, model version, and abstention/confirmation state. It must not write to the ledger or make a tax determination. User corrections remain scoped and explicit.

## Layered Categorization & User Merchant Rules (Priority 3)

The classification pipeline implements a 4-tier hierarchy:
1. **Layer 1: User-Specific Merchant Rules (`user_rule`)** — Immediate precedence. Maintained on-device in `arth_user_merchant_rules_{userId}`. Triggered whenever a user edits or selects a category and opts to "Remember this merchant's category for future transactions".
2. **Layer 2: Curated Indian Merchant Heuristics (`curated_rule`)** — High-precision matching against known Indian merchants and utilities (Swiggy, Zomato, BigBasket, Blinkit, Starbucks, Uber, Ola, R S Dairy, BESCOM, etc.) with 0.95 confidence.
3. **Layer 3: Weak Supervision / FastText Embeddings (`weak_supervision`)** — Heuristic keyword labeling functions with thresholding.
4. **Layer 4: Safe Uncategorized Fallback (`none`)** — When confidence is below threshold or merchant is unknown, falls back to `category_id: null` / `necessity: null`. Missing category is never treated as an error.
