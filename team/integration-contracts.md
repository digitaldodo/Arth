# SpendSense — Shared Inter-Module Integration Contracts

**Rule:** Modules communicate exclusively through typed contracts in `@arth/contracts` / `@spendsense/financial-modules` or HTTP/service adapters—never by importing another module's internal database queries or duplicating formulas.

> **Status Note:** The contracts below document the agreed design specification for team review prior to freezing in `@arth/contracts` and `packages/financial-modules/src/shared/contracts.ts`.

---

## 1. Module A → All Modules (Normalized Transaction & Recurring Data)

- **Producer:** Module A (Ansh Gupta)
- **Consumers:** Modules B, C, D, E
- **Data Ownership:** `public.transactions` (core ledger), `public.merchant_rules`, `public.transaction_links`
- **Provided Shapes (already in `@arth/contracts/src/transactions.ts` + `recurring-payments` contract)**:
  - `TransactionDTO`: `{ id, amount_paise, type: 'income' | 'expense', category_id, category_name, transaction_date: 'YYYY-MM-DD', payment_method: 'online' | 'cash' | 'upi', necessity: 'essential' | 'optional' | 'luxury' | null, description, account_id, ingestion_source, categorization_method, category_verified }`
  - `RecurringCandidate` (`packages/financial-modules/src/modules/recurring-payments/contracts/types.ts`): `{ merchantReference, expectedAmountPaise, expectedIntervalDays, anomalyScore, reviewStatus: 'needs_review' | 'confirmed' | 'dismissed' }`
- **Categorization Endpoint (`POST /api/v1/categorization/suggest`)**:
  - Request: `{ narration: string, cleanMerchant?: string, amountPaise?: number, type: 'income' | 'expense' }`
  - Response: `{ categoryId: string | null, categoryName: string, necessity: NecessityClass | null, confidence: number, method: CategorizationMethod, modelVersion: string, evidence: CategorizationEvidenceDTO[], needsConfirmation: boolean }`
  - Error: `{ statusCode: 400 | 401 | 500, error: string, message: string }`

---

## 2. Module B → Module C & Module D (Cash-Flow Baseline & Safe-to-Spend)

- **Producer:** Module B (Arun Kushwah)
- **Consumers:** Module C (for FOIR/surplus capacity), Module D (for purchase liquidity check)
- **Provider Interface (`packages/financial-modules/src/modules/safe-to-spend/contracts/types.ts`)**:
  - `SafeToSpendResult`:
    - `availableBalancePaise`: `Paise`
    - `expectedIncomePaise`: `Paise`
    - `unpaidBillsPaise`: `Paise`
    - `essentialForecastPaise`: `Paise`
    - `activeEmisPaise`: `Paise`
    - `scheduledSavingsPaise`: `Paise`
    - `cashBufferPaise`: `Paise`
    - `safeToSpendPaise`: `Paise`
    - `excludedAlreadyPaidItems`: `Array<{ id: string; label: string; amountPaise: Paise; reason: string }>`
    - `assumptions`: `string[]`
  - `CashFlowBaseline`:
    - `avgMonthlyNetIncomePaise`: `Paise`
    - `essentialMonthlyBaselinePaise`: `Paise`
    - `currentAvailableLiquidityPaise`: `Paise`
    - `emergencyReservePaise`: `Paise`
    - `monthsObserved`: `number`
- **Failure / Unconfigured Behavior**: Returns `{ status: 'unavailable', reason: 'provider_not_configured' | 'unsupported_input' }` (or HTTP `422`) when starting balances or history are missing rather than fabricating numbers.

---

## 3. Module C → Module B & Module D (EMI Obligations & Loan Simulation)

- **Producer:** Module C (Akshat Kumar)
- **Consumers:** Module B (subtracts active EMIs in Safe-to-Spend without double counting), Module D (evaluates EMI-backed proposed purchases)
- **Provider Interfaces**:
  1. `EmiCommitmentProvider.getActiveObligations(userId, token)`:
     - Response: `{ totalMonthlyEmiPaise: Paise, obligations: Array<{ id: string; lender: string; monthlyEmiPaise: Paise; dueDayOfMonth: number; remainingMonths: number }> }`
  2. `EmiSimulatorProvider.evaluate(input: EmiAffordabilityInput)`:
     - Request: `{ netMonthlyIncomePaise: Paise, existingEmisPaise: Paise[], fixedObligationsPaise: Paise[], essentialsPaise: Paise[], proposedPrincipalPaise: Paise, annualInterestRateBasisPoints: number, tenureMonths: number, emergencyFundPaise: Paise }`
     - Response (`Output`): `{ monthlyEmiPaise: Paise, totalRepaymentPaise: Paise, totalInterestPaise: Paise, sustainability: 'comfortable' | 'stretched' | 'unsustainable', personalizedFoirPercent: number, remainingMonthlyCashPaise: Paise, stressScenarios: Array<{ label: string; stressedRateBps?: number; incomeShockPercent?: number; stressedEmiPaise: Paise; stressedFoirPercent: number; remainingCashPaise: Paise; verdict: string }>, explanation: ExplainableOutput }`
- **Error Contract**: HTTP `400` (`ValidationError`) if principal `<= 0`, rate `< 0`, or tenure `<= 0` / `> 480`.

---

## 4. Module D → Module B (Scheduled Goal Commitments)

- **Producer:** Module D (Ayush Chaudhary)
- **Consumer:** Module B (deducts active scheduled goal savings from Safe-to-Spend)
- **Provider Interface**:
  - `GoalCommitmentProvider.getScheduledSavings(userId, token)`:
    - Response: `{ totalMonthlyContributionPaise: Paise, goals: Array<{ id: string; name: string; priorityTier: 1 | 2 | 3; monthlyContributionPaise: Paise; targetDate: string }> }`
- **Double-Counting Rule**: Module D also exposes current-month recorded `goal_contributions` amounts so Module B only deducts the *remaining* unpaid goal allocation for the active cycle.

---

## 5. Documents Intake API + Ledger → Module E (Verified Tax Facts)

- **Producers:** Existing `backend/src/modules/documents/` (`documentsRoutes`) + Core Ledger
- **Consumer:** Module E (Dev Chaudhary)
- **Endpoints Consumed (Read-Only)**:
  - `GET /api/v1/financial/documents`
  - `GET /api/v1/financial/documents/:id/fields`
  - `GET /api/v1/transactions?type=income&start_date=YYYY-04-01&end_date=YYYY-03-31`
- **Data Contract**:
  - Only `verification_status === 'verified'` fields matching the selected `tax_year` / `assessment_year` (`AY20XX-YY` or `TY20XX-YY`) may substantiate tax recommendations; unverified fields trigger `status: 'needs_verification'`.
  - Monetary values in `tax_extracted_fields.field_value.amount_paise` are integer paise strings; `tax-engine.ts` converts/operates deterministically in `bigint`.
  - **Prohibition:** Module E must NOT register duplicate `/api/v1/financial/documents*` handlers or write directly to `financial_documents`.
