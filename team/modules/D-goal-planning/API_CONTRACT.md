# Module D — API & Provider Contract

**Owner:** Ayush Chaudhary (`2315000536`)

## 1. Endpoints Owned

- `GET /api/v1/planning/goals`
- `POST /api/v1/planning/goals`
- `PATCH /api/v1/planning/goals/:id`
- `DELETE /api/v1/planning/goals/:id`
- `POST /api/v1/planning/goals/:id/contributions`
- `POST /api/v1/planning/purchase-simulate`

### `POST /api/v1/planning/purchase-simulate`
- **Request:**
  ```json
  {
    "purchaseName": "Laptop Upgrade",
    "purchaseAmountPaise": "12000000",
    "paymentMode": "cash",
    "downPaymentPaise": "12000000",
    "annualInterestRateBps": 0,
    "tenureMonths": 0,
    "targetGoalIds": ["uuid-1", "uuid-2"],
    "proposedDate": "2026-12-01"
  }
  ```
- **Response (`200 OK`):**
  ```json
  {
    "paymentMode": "cash",
    "liquidityImpact": {
      "currentAvailablePaise": "20000000",
      "postPurchaseAvailablePaise": "8000000",
      "bufferBreached": false
    },
    "emiImpact": null,
    "goalImpacts": [
      {
        "goalId": "uuid-1",
        "goalName": "Emergency Fund",
        "baselineCompletionDate": "2027-04-01",
        "projectedCompletionDate": "2027-07-01",
        "delayMonths": 3,
        "baselineMonthlyContributionPaise": "2000000",
        "adjustedMonthlyContributionPaise": "1200000"
      }
    ],
    "assumptions": ["..."],
    "explanation": { "summary": "...", "evidence": ["..."] }
  }
  ```
- **Errors:** `400 Bad Request` (invalid amount/date/mode), `401 Unauthorized`, `404 Not Found` (goal ID not owned by caller).

## 2. Consumed & Exposed Contracts
- **Consumes:** `CashFlowBaseline` & `SafeToSpendResult` (Module B); `EmiSimulatorProvider.evaluate()` when `paymentMode === 'emi'` (Module C).
- **Exposes:** `GoalCommitmentProvider.getScheduledSavings(userId, token)` to Module B.
