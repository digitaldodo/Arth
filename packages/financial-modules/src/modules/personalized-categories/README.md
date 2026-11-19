# Personalized Category Recommendation

Owner: teammate / to be assigned. Feature flag: financialModuleFlags.personalizedCategories (currently false).

This package defines integration boundaries only. It contains no calculation, prediction, risk score, eligibility rule, or fabricated output. Service reports unavailable until an owner supplies a reviewed implementation.

## Integration

Implement Provider.evaluate(input) in the adapter layer, validate inputs and outputs, add domain tests, register a backend API adapter, and expose UI only after product review. Keep monetary values in integer paise. Do not alter shared auth, transaction identity, or persistence contracts without coordination.

## Owner deliverables

- Implement the assigned algorithm with validated evidence and explicit assumptions.
- Test boundaries, adverse conditions, provenance, and deterministic outputs.
- Version the provider and explain uncertainty and limitations.
- Keep the feature flag off until evidence and tests are reviewed.
