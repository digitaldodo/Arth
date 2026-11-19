# SpendSense module ownership and integration guide

This repository remains the existing Arth-origin application: its Android application ID, Supabase tables/IDs, authentication metadata, API and offline-store identifiers are preserved. Customer-facing text and the product title change to SpendSense. Shared contracts use integer paise and existing UUID v7 transaction identity.

## Module ownership

Each module lives under `packages/financial-modules/src/modules/<module>` with `README.md`, `domain/`, `contracts/`, `application/`, `adapters/`, and `tests/`. Inputs and outputs are typed. Each service has a provider boundary and returns `unavailable` while its feature flag is false or provider is missing. No teammate algorithm, formula, forecast, or invented figure is included.

| Module | Suggested owner | Key input boundary | Output boundary | Source of truth / dependencies |
|---|---|---|---|---|
| Safe-to-Spend | Team member | Paise balances, commitments, essentials, goal allocation, forecast uncertainty, risk preference | Paise figure and explanation | Existing ledger and goals; requires a separately reviewed forecast and equation |
| Counterfactual purchase simulator | Team member | Proposed amount/date, liquidity, commitments, goal references, uncertainty | Assessment and goal impact explanation | Existing ledger and future goals/forecast; no risk score is supplied |
| EMI affordability | Team member | Net income, existing EMIs, obligations, essentials, proposed EMI, rate/tenure, emergency reserve | Sustainability assessment, stress scenarios, explanation | Verified transaction and user-provided loan inputs; no FOIR formula is supplied |
| Goal planner | Team member | Goals, target dates, priority tiers, available monthly savings | Progress, shortfall, allocations | User-owned goals and ledger; tier 1/2/3 represented in contract only |
| FIRE planner | Team member | Age, expenses, inflation assumption, assets/liabilities, contributions | Scenario contract | User inputs; no return assumptions or recommendation is embedded |
| Spending forecast | Team member | Daily integer-paise time series and horizon | Forecast points and error estimate | Ledger; forecast provider must version assumptions and uncertainty |
| Recurring-payment detection | Team member | Merchant and amount/date sequence | Candidate recurrence, uncertainty, review status | Ledger; all candidates need review |
| Personalized category recommender | Shared/team | User, merchant, and transaction references | Category candidate, evidence, confidence | Existing categories and explicit user feedback; do not duplicate the categorization pipeline |
| Tax calculation and deductions | Team member | Verified financial facts, tax period, regime input | Estimate, rule version, source/explanation | Tax rules maintained separately; this scaffold contains no slabs or eligibility logic |
| Account Aggregator | Team member | FIU identity, consent handle/action | Consent status, encrypted payload reference, audit reference | Provider/FIU adapter; no sandbox is represented as production-certified |
| Behavioral interventions | Team member | Financial event/context and user preference | Positive, reviewable message/action | Product rules and user controls; no guilt-based nudges or generic chatbot |

## Integration contract

`packages/financial-modules/src/shared/contracts.ts` defines integer-paise money, references, tax periods, provenance, model metadata, explainable outputs, and the `unavailable`/`ready` response. `shared/feature-flags.ts` is the single scaffold flag list. Each module's `Provider.evaluate(input)` is the replaceable adapter boundary.

For implementation, the owner should: validate request/response schemas; keep privileged access server-side; authorize every record against the signed-in user; add domain and adapter tests; document model/ruleset version, evidence, and assumptions; return `unavailable` for missing, stale, or unverified inputs; and enable the feature only after review. Do not modify auth, transaction IDs, shared tables, RLS, or existing category taxonomy without coordination. Add database migrations append-only and preserve RLS.

## Conflicts recorded

- The novelty assessment ranks Safe-to-Spend as the overall project novelty, but the user's assigned contribution is transaction categorization. This repository follows the user's ownership boundary; the Safe-to-Spend module is a scaffold only.
- The thesis evaluation discourages SMS scraping and favors consent-driven Account Aggregator ingestion. The user's later instruction makes SMS functionality mandatory. For direct APK distribution, SpendSense implements user-selected SMS sharing/import and review. It does not claim automatic inbox access. See `ANDROID_PRIVACY_AND_PLAY_POLICY.md` and the SMS section in the novelty document.
- The strategy and thesis documents propose broader product and alternative technology directions. The existing Supabase/TypeScript/Android application remains authoritative; no stack rewrite or teammate algorithm is introduced.

## Tests and coordination

Each module has a contract test placeholder under `tests/`. The owner should replace/add tests for real behavior. The package does not use the service in production until an explicit API, authorization, privacy, and feature-flag review is complete.
