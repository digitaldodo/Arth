# SpendSense — FinRegLab 2025 Compliant Recurring Payment Detection Engine

**Date:** November 22, 2026  
**Engineering Domain:** Financial Data Engineering, Time Series Analysis, Statistical Signal Processing  
**Standards Compliance:** FinRegLab 2025 Guidelines for Automated Recurring Transaction Identification  

---

## 1. Executive Summary

Automated recurring payment detection is a fundamental capability in modern personal finance management (PFM). Identifying repeating obligations enables accurate cash-flow forecasting, subscription management, bill alerts, and financial health assessment.

However, naive implementations frequently suffer from:
1. **False Positives on Habitual Spending:** Flagging daily coffee purchases, frequent Uber rides, or habitual food deliveries as "contractual subscriptions".
2. **Failure on Variable Utilities:** Rejecting legitimate monthly utility obligations (electricity, piped gas, water, broadband) because billing amounts fluctuate from month to month.
3. **Internal Transfer Noise:** Treating monthly credit card settlements or peer transfers as merchant subscriptions.
4. **Conflating Recurrence with Essentiality:** Assuming that every recurring transaction is "essential", misclassifying streaming entertainment or club memberships as vital needs.

The SpendSense Recurring Payment Detection Engine (`frontend/src/features/categorization/recurring-detector.ts`) implements the **FinRegLab 2025 standards** for algorithmic detection of recurring financial commitments while cleanly separating recurrence from necessity classification.

---

## 2. FinRegLab 2025 Algorithmic Framework

### 2.1 Minimum Data Thresholds

Under FinRegLab 2025 guidelines, algorithmic classification of a payment series as recurring requires:
- **Minimum transaction count ($N \ge 3$):** A candidate counterparty series must contain at least 3 historical occurrences.
- **Minimum intervals ($K \ge 2$):** At least two distinct time intervals must be observable between consecutive transactions. Two transactions provide only a single interval ($K = 1$), which is mathematically insufficient to demonstrate periodicity.

### 2.2 Cadence Interval Clustering

The engine measures elapsed days $\Delta t_i = t_{i} - t_{i-1}$ between consecutive sorted transactions and classifies the median interval $\tilde{\Delta t}$ into standard financial cadences:

| Cadence | Expected Interval ($\tau$) | Target Range (Days) | Typical Indian Financial Obligations |
|---|---|---|---|
| **Weekly** | 7 days | $6 \le \tilde{\Delta t} \le 8$ | Weekly milk/newspaper subscriptions, domestic help |
| **Biweekly** | 14 days | $13 \le \tilde{\Delta t} \le 16$ | Fortnightly payroll, biweekly maid allowances |
| **Monthly** | 30 days | $25 \le \tilde{\Delta t} \le 35$ | House rent, electricity (BESCOM), broadband (Airtel), Netflix, mobile bills, EMIs |
| **Quarterly** | 91 days | $80 \le \tilde{\Delta t} \le 102$ | Society maintenance, advance water tax, mutual fund SIPs |
| **Semiannual** | 182 days | $170 \le \tilde{\Delta t} \le 195$ | School term fees, property tax installments |
| **Annual** | 365 days | $345 \le \tilde{\Delta t} \le 385$ | Term life insurance (LIC), health insurance, car insurance, Amazon Prime |
| **Custom** | $\tilde{\Delta t}$ | Otherwise | Custom periodic agreements |

### 2.3 Statistical Variance Filters (Interval & Amount CV)

The Coefficient of Variation ($CV = \frac{\sigma}{\mu}$) evaluates variance relative to the mean.

1. **Interval CV ($\text{CV}_{\text{interval}}$):**
   - For **Fixed Contracts** (Rent, Subscriptions, EMIs, Insurance): $\text{CV}_{\text{interval}} \le 0.20$.
   - For **Variable Utilities** (Electricity, Water, Gas, Telecom): $\text{CV}_{\text{interval}} \le 0.35$ (accounting for billing cycles landing on weekends or varying meter reading dates).
2. **Amount CV ($\text{CV}_{\text{amount}}$):**
   - For **Fixed Contracts**: $\text{CV}_{\text{amount}} \le 0.10$ (amounts must remain virtually identical across cycles).
   - For **Variable Utilities**: $\text{CV}_{\text{amount}} \le 0.45$ (seasonal power or water consumption naturally shifts by up to 45%).
3. **Periodicity Confidence ($\kappa$):**
   $$\kappa = \max\left(0.70, \min\left(1.0, 1.0 - \text{CV}_{\text{interval}}\right)\right)$$
   A pattern must achieve $\kappa \ge 0.70$ to be tagged as recurring.

---

## 3. Discretionary Habit Filtering & Exclusion Defense

### 3.1 Rejection of Habitual Spending

Frequent discretionary spending (such as visiting Third Wave Coffee 5 times in 2 weeks or ordering Swiggy 12 times a month) generates low intervals ($\Delta t \in \{1, 2, 4\}$ days) and high coefficient of variation ($\text{CV}_{\text{interval}} > 0.50$).

The engine explicitly identifies habitual signatures (`starbucks`, `cafe`, `coffee`, `chaayos`, `chai point`, `zomato`, `swiggy`, `mcdonalds`, `blinkit`, `zepto`, `instamart`) and rejects them from recurring contract classification unless strict contractual subscription terms are satisfied.

### 3.2 Exclusion of Internal Transfers & Credit Card Bill Settlements

Internal balance movements and credit card settlements must not distort expense analytics:
- Internal transfers (`transfer`, `neft`, `imps`, `self transfer`, `own account`)
- Credit card bill payments (`credit card payment`, `cc payment`, `card bill`, `billdesk`)
- Cash withdrawals (`atm withdrawal`, `cash withdrawal`)

These are filtered upfront and never tagged as recurring expense commitments.

---

## 4. Separation of Recurrence from Financial Necessity

A critical design rule of SpendSense is that **Recurrence does not equal Essentiality**:

| Transaction | Recurrence Pattern | Recurrence Type | True Necessity Tier | Justification |
|---|---|---|---|---|
| **Apartment Rent** | Monthly (CV $\le 0.05$) | `rent` | **`essential`** | Fundamental shelter obligation |
| **HDFC Home Loan EMI** | Monthly (CV $\le 0.01$) | `emi` | **`essential`** | Legal debt service commitment |
| **BESCOM Electricity** | Monthly (CV $\le 0.22$) | `utility` | **`essential`** | Critical household energy |
| **Netflix 4K Premium** | Monthly (CV $\le 0.02$) | `subscription` | **`optional`** | Discretionary digital entertainment |
| **Spotify Family** | Monthly (CV $\le 0.01$) | `subscription` | **`optional`** | Discretionary streaming audio |
| **Cult.fit Gym** | Monthly (CV $\le 0.04$) | `subscription` | **`optional`** | Fitness and leisure subscription |
| **Bangalore Golf Club** | Monthly / Annual | `subscription` | **`luxury`** | High-end elite social indulgence |

When `recurring-detector.ts` tags a pattern, it provides a `necessity_prediction` aligned with this matrix, which the downstream `necessity-classifier.ts` incorporates at Step 4 of its decision hierarchy.

---

## 5. Next Expected Date Prediction

For active recurring patterns, the engine calculates the anticipated next billing date:

$$t_{\text{next}} = t_{\text{latest}} + \tau_{\text{expected}}$$

This enables SpendSense to project upcoming commitments in dashboard cash-flow widgets and alert users ahead of impending debits.
