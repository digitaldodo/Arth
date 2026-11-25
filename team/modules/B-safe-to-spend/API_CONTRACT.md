# Module B — API & Provider Contract

**Owner:** Arun Kushwah (`2315000441`)

## 1. Endpoints Owned

- `GET /api/v1/planning/safe-to-spend?as_of=YYYY-MM-DD`
- `GET /api/v1/planning/safe-to-spend/commitments`
- `POST /api/v1/planning/safe-to-spend/commitments`
- `PATCH /api/v1/planning/safe-to-spend/commitments/:id`
- `DELETE /api/v1/planning/safe-to-spend/commitments/:id`
- `GET /api/v1/planning/spending-forecast?horizon_days=30`

### `GET /api/v1/planning/safe-to-spend` Response (`200 OK`)
```json
{
  "status": "ready",
  "cycleStart": "2026-11-01",
  "nextIncomeDate": "2026-11-30",
  "availableBalancePaise": "4500000",
  "expectedIncomePaise": "0",
  "unpaidBillsPaise": "350000",
  "remainingEssentialForecastPaise": "600000",
  "activeEmisPaise": "1200000",
  "scheduledGoalSavingsPaise": "500000",
  "cashBufferPaise": "1000000",
  "safeToSpendPaise": "850000",
  "dailyAllowancePaise": "170000",
  "excludedAlreadyPaid": [
    { "commitmentId": "uuid", "label": "Rent", "amountPaise": "1500000", "matchedTransactionId": "uuid" }
  ],
  "assumptions": ["..."],
  "explanation": { "summary": "...", "evidence": ["..."] }
}
```

### Error & Unavailable Behavior
- `401 Unauthorized`: Missing/invalid JWT.
- `422 Unprocessable Entity` (or `{ status: "unavailable", reason: "unsupported_input" }` at domain layer) when balances are unconfigured or cycle dates are invalid.

## 2. Consumed Contracts
- `EmiCommitmentProvider.getActiveObligations()` from Module C.
- `GoalCommitmentProvider.getScheduledSavings()` from Module D.
- `RecurringPayments.Provider` from Module A (optional bill suggestions, never auto-committed without review).

## 3. Exposed Contracts (Consumed by Modules C & D)
- `CashFlowBaseline`: `{ avgMonthlyNetIncomePaise, essentialMonthlyBaselinePaise, currentAvailableLiquidityPaise, emergencyReservePaise, monthsObserved }`.
