# Module C — API & Provider Contract

**Owner:** Akshat Kumar (`2315000205`)

## 1. Endpoints Owned

- `GET /api/v1/planning/emi-affordability/loans`
- `POST /api/v1/planning/emi-affordability/loans`
- `PATCH /api/v1/planning/emi-affordability/loans/:id`
- `DELETE /api/v1/planning/emi-affordability/loans/:id`
- `POST /api/v1/planning/emi-affordability/evaluate`

### `POST /api/v1/planning/emi-affordability/evaluate`
- **Request:**
  ```json
  {
    "netMonthlyIncomePaise": "12000000",
    "essentialsMonthlyPaise": "4000000",
    "existingEmisPaise": ["1500000"],
    "proposedPrincipalPaise": "50000000",
    "annualInterestRateBps": 950,
    "tenureMonths": 36,
    "emergencyFundPaise": "30000000",
    "rateStressBps": [100, 200],
    "incomeShockPercents": [15, 25]
  }
  ```
- **Response (`200 OK`):**
  ```json
  {
    "proposedMonthlyEmiPaise": "1601645",
    "totalRepaymentPaise": "57659220",
    "totalInterestPaise": "7659220",
    "baseline": {
      "totalEmisPaise": "3101645",
      "foirPercent": 25.85,
      "remainingCashPaise": "4898355",
      "emergencyRunwayMonths": 4.2,
      "sustainability": "comfortable"
    },
    "stressScenarios": [
      {
        "label": "Interest +200 bps",
        "monthlyEmiPaise": "1650790",
        "foirPercent": 26.26,
        "remainingCashPaise": "4849210",
        "sustainability": "comfortable"
      }
    ],
    "assumptions": ["Reducing-balance monthly compounding", "..."],
    "explanation": { "summary": "...", "evidence": ["..."] }
  }
  ```
- **Errors:** `400 Bad Request` on invalid principal (`<= 0`), negative interest rate, or tenure outside `1..480` months; `401 Unauthorized`.

## 2. Exposed Contracts (Consumed by Modules B & D)
- `EmiCommitmentProvider.getActiveObligations(userId, token)` → consumed by Module B.
- `EmiSimulatorProvider.evaluate(input)` → consumed by Module D for financed purchase simulations.
