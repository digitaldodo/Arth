# SpendSense — Five-Member Work Allocation & Integration Plan

**Team (Group 369):**
1. **Ansh Gupta** (`2315000330`) — Module A + Shared Integration Lead
2. **Arun Kushwah** (`2315000441`) — Module B
3. **Akshat Kumar** (`2315000205`) — Module C
4. **Ayush Chaudhary** (`2315000536`) — Module D
5. **Dev Chaudhary** (`2315000708`) — Module E

**Design Principle:** Assignments are calibrated to **actual remaining unfinished work** (~20% of remaining project effort each, ~11–13 person-days per member) across independent vertical slices (`contracts` → `domain` → `backend` → `BFF` → `frontend` → `tests`). Already-built core features (manual transaction entry, ledger CRUD, auth, dashboard summary, document intake CRUD) are reused rather than re-allocated.

---

## 1. Workload Balance & Effort Comparison

| Member | Module | Remaining Effort % | Effort Range (Person-Days) | Deliverables | Complexity | Testing Burden | Integration Burden | Reused Existing Code |
|---|---|---|---|---|---|---|---|---|
| **Ansh Gupta** | **A: Transaction Intelligence, Ingestion Hardening & ML Categorization** | ~20% | 11–13 d | 5 | High (ML pipeline + reconciliation fixes + lint/route decoupling) | High (fix 5 failing FE tests + ML eval + merchant_rules API tests) | Medium (exposes transaction/recurring/categorization read contracts + Integration Lead) | `StatementImport.tsx`, `statement-parser.ts`, `historical-reconciliation.ts`, `categorization/*`, `ml/transaction-categorization/*`, `migration 0028` (`merchant_rules`, `financial_accounts`, `import_batches`, `transaction_links`) |
| **Arun Kushwah** | **B: Safe-to-Spend & Cash-Flow Decision Engine** | ~20% | 11–13 d | 5 | High (double-counting guard + cycle forecasting) | High (domain boundary, double-counting, cycle edge cases, BFF/API tests) | High (consumes Ledger/Balances/Module C/Module D; exposes `CashFlowBaseline` to C & D) | `packages/financial-modules/src/modules/{safe-to-spend,spending-forecast}/`, `balances/balance.service.ts`, `recurring-detector.ts` |
| **Akshat Kumar** | **C: EMI Affordability & Stress Testing Engine** | ~20% | 11–13 d | 5 | Medium-High (reducing-balance BigInt math + stress scenarios + FOIR) | High (amortization precision, stress matrix, edge cases, UI & API tests) | Medium-High (consumes Module B baseline; exposes `EmiCommitmentSummary` & `simulateEmi` to B & D) | `packages/financial-modules/src/modules/emi-affordability/`, `TransactionAppShell.tsx` slot, `@arth/contracts` money helpers |
| **Ayush Chaudhary** | **D: Goal Planning & Purchase Simulation Engine** | ~20% | 11–13 d | 5 | Medium-High (priority allocation + counterfactual timeline recalculation) | High (goal math, delay months, financed vs cash purchase scenarios) | Medium-High (consumes Module B liquidity & Module C EMI simulation; exposes `GoalSavingsCommitment` to B) | `packages/financial-modules/src/modules/{goal-planner,purchase-simulator}/`, `TransactionAppShell.tsx` slot |
| **Dev Chaudhary** | **E: Integrated Tax Planning, Capital Gains & Document Verification** | ~20% | 11–13 d | 5 | High (statutory STCG/LTCG rules + cross-doc reconciliation + full UI) | High (CapGains benchmark tests, discrepancy tests, tax API route tests, UI integration) | Medium (consumes `documentsRoutes` & ledger income credits; wires `tax.routes.ts` cleanly) | `backend/src/modules/tax/{tax-engine,tax-rules,tax-deductions}.ts`, `frontend/src/features/tax/{DocumentsTaxCentre,tax-readiness,tax-document-review,ledger-tax-reconciliation}.ts` |

---

## 2. Detailed Module Assignments & File Ownership

### Module A — Ansh Gupta (`2315000330`): Transaction Intelligence, Ingestion Hardening & ML Categorization
- **Why this scope**: Basic manual transaction CRUD and CSV/PDF/OCR upload UI are already built; the actual unfinished academic work is stabilizing the 5 failing tests / 5 lint errors, decoupling orphaned import/account/reconciliation routes from `tax.routes.ts`, persisting `public.merchant_rules` to PostgreSQL, and delivering a measured, runtime-integrated ML categorization pipeline.
- **Key Deliverables**:
  1. Fix `tagDuplicates()` regression (5 failing tests in `statement-import-parser.test.ts` & `statement-ocr.test.ts`) and 5 ESLint errors (`upi-parser.ts`, `StatementImport.tsx`).
  2. Extract `/api/v1/financial/accounts`, `/api/v1/financial/import-batches*`, and `/api/v1/financial/transaction-links*` out of `tax.routes.ts` into `backend/src/modules/financial-imports/` and register in `app.ts`.
  3. Add `/api/v1/financial/merchant-rules` CRUD + past-transaction application backed by `public.merchant_rules` (`0028`), syncing with `user-merchant-rules.ts`.
  4. Expand `ml/transaction-categorization/` corpus & benchmarks, train and evaluate Snorkel + FastText / TF-IDF+XGBoost / AnchoredHybrid models, export calibrated model artifact/weights, and integrate runtime inference behind `packages/financial-modules/src/modules/personalized-categories/` + `POST /api/v1/categorization/suggest` with provenance (`categorization_method`, `category_evidence`).
  5. Wire `packages/financial-modules/src/modules/recurring-payments/` adapter over `recurring-detector.ts` to expose detected recurring series to Module B & C.
- **Owned Directories & Files**:
  - `frontend/src/features/imports/**`
  - `frontend/src/features/categorization/**`
  - `ml/transaction-categorization/**`
  - `backend/src/modules/financial-imports/**` *(new)*
  - `backend/src/modules/categorization/**` *(new)*
  - `frontend/src/app/api/backend/categorization/**` *(new)*
  - `packages/financial-modules/src/modules/personalized-categories/**`
  - `packages/financial-modules/src/modules/recurring-payments/**`
  - `supabase/migrations/0040_*.sql` *(only if merchant-rule/ML metadata columns needed)*
- **Database Tables Owned**: `public.merchant_rules`, `public.statement_import_batches`, `public.statement_import_batch_items`, `public.transaction_links`, `public.financial_accounts`, `public.account_movements`.
- **Database Tables Read-Only**: `public.transactions`, `public.categories`.
- **Tests Maintained**: `frontend/tests/{statement-*,upi-parser,categorization-pipeline,layered-categorization,reconciliation,recurring-payment-detection,historical-statement-reconciliation}.test.ts`, `ml/transaction-categorization/test_pipeline.py`, new backend tests for `financial-imports` & `categorization`.

---

### Module B — Arun Kushwah (`2315000441`): Safe-to-Spend & Cash-Flow Decision Engine
- **Why this scope**: Currently 100% scaffold/placeholder (`FeatureComingSoon` + empty `safe-to-spend/` & `spending-forecast/` modules + zero DB tables).
- **Key Deliverables**:
  1. Migration `0041_safe_to_spend_commitments.sql`: create `public.cash_flow_commitments` (expected income dates/amounts, recurring unpaid bills, cash buffer target paise, pay-cycle config) with strict RLS (`auth.uid() = user_id`).
  2. Deterministic `spending-forecast` baseline provider (rolling historical essential daily/cycle burn with uncertainty interval, excluding confirmed `transaction_links` transfers).
  3. Deterministic `safe-to-spend` engine in `packages/financial-modules/src/modules/safe-to-spend/` computing:
     `SafeToSpend = AvailableBalance + ExpectedIncome - UnpaidBills - RemainingEssentialForecast - ActiveEMIs - ScheduledGoalSavings - CashBuffer`
     with **explicit double-counting prevention** (matching paid bills/EMIs/savings transfers already recorded in the current cycle's ledger).
  4. Fastify module `backend/src/modules/safe-to-spend/` (`/api/v1/planning/safe-to-spend` & `/api/v1/planning/commitments*`) + Next.js BFF `/api/backend/planning/safe-to-spend/**`.
  5. Interactive UI in `frontend/src/features/safe-to-spend/` replacing `FeatureComingSoon`: transparent breakdown waterfall, assumption toggles, scenario what-if sliders, and double-counting audit log.
- **Owned Directories & Files**:
  - `packages/financial-modules/src/modules/safe-to-spend/**`
  - `packages/financial-modules/src/modules/spending-forecast/**`
  - `backend/src/modules/safe-to-spend/**` *(new)*
  - `frontend/src/app/api/backend/planning/safe-to-spend/**` *(new)*
  - `frontend/src/features/safe-to-spend/**` *(new)*
  - `supabase/migrations/0041_*.sql`
- **Database Tables Owned**: `public.cash_flow_commitments`.
- **Database Tables Read-Only**: `public.transactions`, `public.profiles`, `public.balance_movements`, `public.transaction_links` (and reads Module C/D contracts via service/HTTP or shared adapter).
- **Tests Maintained**: `packages/financial-modules/src/modules/{safe-to-spend,spending-forecast}/tests/*.test.ts`, new backend & frontend unit/integration tests covering double-counting protection and cycle edge cases.

---

### Module C — Akshat Kumar (`2315000205`): EMI Affordability & Stress Testing Engine
- **Why this scope**: Currently 100% scaffold/placeholder (`FeatureComingSoon` + empty `emi-affordability/` module + zero DB tables).
- **Key Deliverables**:
  1. Migration `0042_loan_obligations.sql`: create `public.loan_obligations` (lender, loan type, principal paise, annual rate bps, monthly EMI paise, remaining months, start date, rate type `fixed`/`floating`) with RLS.
  2. Deterministic BigInt/integer-paise EMI calculator & stress engine in `packages/financial-modules/src/modules/emi-affordability/`:
     - Monthly instalment, total repayment, total interest, amortization milestones.
     - Existing EMI aggregation + FOIR (`(ExistingEMIs + ProposedEMI) / NetMonthlyIncome`).
     - Baseline vs. Stress scenarios: interest rate hikes (`+100 bps`, `+200 bps`, custom), income drop shocks (`-15%`, `-25%`), remaining cash after essentials & EMIs, emergency fund coverage months, and explicit sustainability classification (`comfortable` / `stretched` / `unsustainable`) with assumptions.
  3. Expose pure `evaluateEmi` / `simulateLoan` contract consumed by Module B (monthly obligations) and Module D (financed purchase scenario).
  4. Fastify module `backend/src/modules/emi-affordability/` (`/api/v1/planning/loans*` & `/api/v1/planning/emi-affordability/evaluate`) + Next.js BFF `/api/backend/planning/emi/**`.
  5. Interactive UI in `frontend/src/features/emi-planner/` replacing `FeatureComingSoon`: existing loans register, new loan affordability simulator, baseline vs. stressed comparison table, and transparent formula/assumption panel.
- **Owned Directories & Files**:
  - `packages/financial-modules/src/modules/emi-affordability/**`
  - `backend/src/modules/emi-affordability/**` *(new)*
  - `frontend/src/app/api/backend/planning/emi/**` *(new)*
  - `frontend/src/features/emi-planner/**` *(new)*
  - `supabase/migrations/0042_*.sql`
- **Database Tables Owned**: `public.loan_obligations`.
- **Database Tables Read-Only**: `public.transactions`, `public.profiles` (for monthly income/expense context via shared contract).
- **Tests Maintained**: `packages/financial-modules/src/modules/emi-affordability/tests/*.test.ts`, new backend & frontend amortization, FOIR, stress-test, and validation test suites.

---

### Module D — Ayush Chaudhary (`2315000536`): Goal Planning & Purchase Simulation Engine
- **Why this scope**: Currently 100% scaffold/placeholder (`FeatureComingSoon` + empty `goal-planner/` & `purchase-simulator/` modules + zero DB tables).
- **Key Deliverables**:
  1. Migration `0043_financial_goals.sql`: create `public.financial_goals` (name, category/type, target paise, current saved paise, target date, priority tier 1/2/3, monthly contribution paise, status) and `public.goal_contributions` with RLS.
  2. Deterministic `goal-planner` domain engine: progress %, shortfall paise, required monthly savings, priority-based surplus allocation, and projected completion date.
  3. Deterministic `purchase-simulator` domain engine: given a proposed cash or EMI purchase (calling Module C's contract if financed, and Module B's liquidity/surplus contract), compute contribution diversion, cash buffer impact, exact completion-date delay per affected goal, and side-by-side Baseline vs. With-Purchase comparison.
  4. Fastify module `backend/src/modules/goals/` (`/api/v1/planning/goals*` & `/api/v1/planning/purchase-simulate`) + Next.js BFF `/api/backend/planning/goals/**`.
  5. Interactive UI in `frontend/src/features/goal-planner/` replacing `FeatureComingSoon`: goal tracker, contribution logging, and interactive Goal-Linked Purchase Simulator.
- **Owned Directories & Files**:
  - `packages/financial-modules/src/modules/goal-planner/**`
  - `packages/financial-modules/src/modules/purchase-simulator/**`
  - `backend/src/modules/goals/**` *(new)*
  - `frontend/src/app/api/backend/planning/goals/**` *(new)*
  - `frontend/src/features/goal-planner/**` *(new)*
  - `supabase/migrations/0043_*.sql`
- **Database Tables Owned**: `public.financial_goals`, `public.goal_contributions`.
- **Database Tables Read-Only**: `public.transactions`, `public.profiles` (and consumes Module B & C APIs/contracts).
- **Tests Maintained**: `packages/financial-modules/src/modules/{goal-planner,purchase-simulator}/tests/*.test.ts`, new backend & frontend goal projection, purchase counterfactual, and RLS/CRUD tests.

---

### Module E — Dev Chaudhary (`2315000708`): Integrated Tax Planning, Capital Gains & Document Verification
- **Why this scope**: Document metadata intake (`documentsRoutes` & `DocumentsTaxCentre.tsx`) and basic salary/deduction math (`tax-engine.ts`) already exist, but `tax.routes.ts` is unregistered/conflicting, Capital Gains returns `unsupported`, cross-document reconciliation & checklist helpers are unwired, and **no Tax Planning UI exists**.
- **Key Deliverables**:
  1. Refactor `backend/src/modules/tax/tax.routes.ts` to own **only** `/api/v1/tax/estimate`, `/api/v1/tax/profiles`, `/api/v1/tax/capital-gains`, and `/api/v1/tax/reconcile` (removing duplicate `/api/v1/financial/documents*` and Module A's `/financial/*` routes), and register `taxRoutes` via Integration Lead in `app.ts`.
  2. Implement deterministic **Capital Gains Tax Estimator** in `backend/src/modules/tax/` + `packages/financial-modules/src/modules/tax-calculation/` for defined supported Indian investments (listed equity / equity MF STCG 111A & LTCG 112A with exemption limit, debt/gold/other supported assets with holding-period classification & versioned FY/AY rules).
  3. Extend `document-extractor.ts` with `capital_gains`, `investment_statement`, and `fd_interest`/`savings_interest` extraction adapters, pass `documentKind` from `DocumentsTaxCentre.tsx`, and add cross-document discrepancy detection (Form 16 vs. AIS vs. Form 26AS vs. interest/investment statements vs. ledger income credits) with human-readable explanations.
  4. Build complete Tax Planning UI tabs/sub-components under `frontend/src/features/tax/` (integrated into `DocumentsTaxCentre.tsx` without modifying `backend/src/modules/documents/`):
     - Old vs. New Regime Comparison & Tax Summary (auto-populated from verified fields, displaying assumptions & statutory citations).
     - Capital Gains Calculator & Summary.
     - Reconciliation & Discrepancy Flagging Review Panel (wiring `tax-document-review.ts` & `ledger-tax-reconciliation.ts`).
     - Tax Preparation Checklist (wiring `deriveTaxReadiness()` from `tax-readiness.ts`).
- **Owned Directories & Files**:
  - `backend/src/modules/tax/**`
  - `packages/financial-modules/src/modules/tax-calculation/**`
  - `frontend/src/features/tax/**`
  - `frontend/src/app/api/backend/tax/**` *(new BFF route dedicated to tax)*
- **Database Tables Owned**: `public.tax_profiles`.
- **Database Tables Read-Only**: `public.financial_documents`, `public.tax_extracted_fields`, `public.transactions` (must NOT alter `backend/src/modules/documents/` CRUD or `financial_documents` schema).
- **Tests Maintained**: `backend/tests/{tax-engine,official-tax-calculator,statement-batch-validation}.test.ts`, `frontend/tests/{document-classifier,document-extractor,document-form-adapters,ledger-tax-reconciliation,tax-document-review,tax-readiness}.test.ts`, new CapGains & reconciliation tests.

---

## 3. Shared Files & Strict No-Touch Rules

### 3.1 Single-Maintainer / Joint-Approval Files (Do NOT edit independently)
| File / Path | Designated Maintainer / Gate | Rule |
|---|---|---|
| `backend/src/app.ts` | Ansh Gupta (PR-gated) | Only 2-line plugin import + `app.register(...)` per module during integration checkpoint. |
| `packages/contracts/src/*` & `packages/financial-modules/src/shared/*` | Ansh Gupta + affected consumer sign-off | Contract-first PRs merged in Week 1 before parallel feature coding. |
| `frontend/src/features/transactions/TransactionAppShell.tsx` | Ansh Gupta (PR-gated) | Each planning module replaces only its single `<FeatureComingSoon>` block via `next/dynamic`. |
| `frontend/src/app/api/backend/[...segments]/route.ts` | Frozen for new modules | New modules MUST create their own Next.js route folder (e.g., `/api/backend/planning/emi/...`) instead of editing `[...segments]/route.ts`. |
| `frontend/src/lib/api-client/index.ts` | Frozen for new modules | New modules place typed fetchers in their own `frontend/src/features/<module>/api.ts` (reusing `@arth/contracts`). |
| `backend/src/plugins/auth.ts`, `frontend/src/proxy.ts`, `frontend/src/features/auth/*` | Frozen (Auth owner only) | No module may alter JWT verification, cookies, or login flows. |
| `backend/src/modules/documents/**` | Frozen (Document Intake boundary) | Module E reads via existing `/api/v1/financial/documents*` or `tax_extracted_fields` queries; no duplicate handlers. |
| `supabase/migrations/0001`–`0039` | Immutable (Append-only rule) | Never edit existing migrations. Reserved slots: `0040` (A), `0041` (B), `0042` (C), `0043` (D). |
| `android/**`, `frontend/src/features/people/**`, `backend/src/modules/{people,categories,dashboard,balances}/**` | Frozen for synopsis modules | Consume via read-only APIs/contracts only. |

---

## 4. Inter-Module Integration Contracts

| Producer → Consumer | Interface / Endpoint | Request / Input Schema | Response / Output Schema | Error Format & Ownership |
|---|---|---|---|---|
| **Module A → Core / All** | `POST /api/v1/categorization/suggest` & `recurring-payments` domain service | `{ userId, narration, cleanMerchant?, amountPaise, type, historyWindowDays }` | `{ categoryId, categoryName, confidence, method, modelVersion, evidence[], needsConfirmation, recurringSeries[] }` | Standard Fastify `{ statusCode, error, message }`; Module A validates & owns `merchant_rules` |
| **Core Ledger + A → Module B** | Internal service / `GET /api/v1/planning/safe-to-spend` | `{ userId, referenceDateIST, horizonEndDateIST }` | `{ availableBalancePaise, expectedIncomePaise, unpaidBillsPaise, essentialForecastPaise, activeEmisPaise, scheduledSavingsPaise, bufferPaise, safeToSpendPaise, excludedPaidItems[], assumptions[] }` | Returns `unavailable` / HTTP `422` if balances unconfigured; Module B owns aggregation & double-count dedup |
| **Module B → Module C** | `CashFlowBaselineProvider.getBaseline(userId, token)` | `{ userId }` | `{ avgMonthlyNetIncomePaise, essentialMonthlyBaselinePaise, currentAvailableBalancePaise, emergencyReservePaise, dataWindowMonths }` | Returns `{ status: 'unavailable', reason }` if `< 1` month data; Module B owns computation |
| **Module C → Module B** | `EmiCommitmentProvider.getActiveObligations(userId, token)` | `{ userId }` | `{ totalMonthlyEmiPaise, obligations: [{ id, lender, monthlyEmiPaise, dueDayOfMonth, remainingMonths }] }` | Empty list if no loans; Module C owns `loan_obligations` validation |
| **Module C → Module D** | `EmiSimulatorProvider.simulatePurchaseLoan(input)` | `{ principalPaise, annualRateBps, tenureMonths, baseline }` | `{ monthlyEmiPaise, totalInterestPaise, totalRepaymentPaise, stressedEmiPaise, sustainabilityStatus }` | HTTP `400` on invalid principal/rate/tenure; Module C owns loan math |
| **Module D → Module B** | `GoalCommitmentProvider.getScheduledSavings(userId, token)` | `{ userId }` | `{ totalMonthlyGoalContributionPaise, goals: [{ id, name, monthlyContributionPaise, priorityTier }] }` | Empty list if no goals; Module D owns `financial_goals` |
| **Documents API → Module E** | `GET /api/v1/financial/documents*` + `tax-document-review.ts` | `{ userId, taxPeriod: 'AY2026-27' \| 'TY2026-27' }` | `{ verifiedFacts: VerifiedTaxSourceField[], conflicts: ConflictingField[] }` | Module E consumes read-only verified facts & flags discrepancies without mutating raw docs |

---

## 5. Collaboration Workflow & Branching Strategy

### Recommended Workflow: Feature Branches + Contract-First PRs into `main`
- **Why NOT direct commits to `main`**: With 5 developers editing TypeScript contracts, Fastify routes, SQL migrations, and React views, direct commits to `main` will cause broken builds (as seen with the current 5 lint errors and 5 failing tests on `HEAD`), migration number clashes, and unreviewed changes to shared files.
- **Recommended Process**:
  1. **Phase 0 (Days 1–2 — Joint Contract Lock)**: Merge Stabilization PR (fix 5 tests, 5 lint errors, split `tax.routes.ts`) + Contract PR locking `packages/contracts/` and `packages/financial-modules/src/shared/` + reserving migration numbers `0040`–`0043`.
  2. **Phase 1 (Days 3–8 — Parallel Isolated Feature Branches)**: Each member works on `feat/mod-a-*`, `feat/mod-b-*`, `feat/mod-c-*`, `feat/mod-d-*`, `feat/mod-e-*`, touching **only** their owned folders and writing unit tests with mocked provider adapters.
  3. **Phase 2 (Days 9–11 — Sequential Integration Checkpoints)**:
     - Checkpoint 1: Merge **Module A** & **Module E** (independent of B/C/D).
     - Checkpoint 2: Merge **Module C** (exposes EMI contract) & **Module B** (consumes C's obligation shape).
     - Checkpoint 3: Merge **Module D** (consumes B & C) + enable `financialModuleFlags` in `shared/feature-flags.ts` + swap `TransactionAppShell.tsx` dynamic views.
  4. **CI Gate on Every PR**: `pnpm typecheck && pnpm lint && pnpm test:backend && pnpm test:frontend && npx tsx --test packages/financial-modules/src/modules/*/tests/*.test.ts`.
