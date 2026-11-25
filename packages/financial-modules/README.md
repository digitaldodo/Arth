# SpendSense Financial Modules (`@spendsense/financial-modules`)

Boundary-only TypeScript package defining typed inputs, outputs, `Provider.evaluate()` interfaces, shared `Paise` / `Provenance` / `FinancialFact` contracts, and feature flags (`src/shared/feature-flags.ts`, all `false` by default) for SpendSense decision-support modules.

## Modules (`src/modules/`)
- **Academic Synopsis Modules**: `safe-to-spend`, `spending-forecast`, `emi-affordability`, `goal-planner`, `purchase-simulator`, `personalized-categories`, `recurring-payments`, `tax-calculation`.
- **Optional / Out-of-Scope Scaffolds**: `fire-planner`, `account-aggregator`, `behavioral-insights`.

Each module currently returns `{ status: 'unavailable', reason: 'feature_disabled' }` until its assigned owner completes implementation, testing, and review.

## Contract Tests
```bash
npx tsx --test packages/financial-modules/src/modules/*/tests/*.test.ts
```
