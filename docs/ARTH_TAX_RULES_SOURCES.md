# Arth Indian Tax Rules Sources & Statutory References

**Last verified:** 2026-11-19 (Asia/Kolkata)  
**Governing statutes:** Income-tax Act, 1961 (Act No. 43 of 1961) and Income-tax Act, 2025 (Act No. 46 of 2025), read with the applicable Finance Acts.

---

## 1. Statutory Frameworks Supported

Arth implements deterministic, versioned rulesets for personal income tax calculation in India across four distinct tax periods:

1. **Assessment Year 2024–25 (Financial Year 2023–24)**
   - Framework: `income_tax_act_1961`
   - Primary enactment: [Finance Act, 2023](https://incometaxindia.gov.in/Documents/Act/Finance-Act-2023.pdf)
   - Official guidance: [CBDT Circular No. 01/2024](https://incometaxindia.gov.in/communications/circular/circular-1-2024.pdf)

2. **Assessment Year 2025–26 (Financial Year 2024–25)**
   - Framework: `income_tax_act_1961`
   - Primary enactment: [Finance (No. 2) Act, 2024](https://incometaxindia.gov.in/Documents/Act/Finance-Act-2024.pdf)

3. **Assessment Year 2026–27 (Financial Year 2025–26)**
   - Framework: `income_tax_act_1961`
   - Primary enactment: [Finance Act, 2025](https://incometaxindia.gov.in/Documents/Act/Finance-Act-2025.pdf)
   - Official guidance: [FAQs on Budget 2025 Tax Slabs and Section 87A](https://incometaxindia.gov.in/Documents/Budget/budget-2025/faqs-budget-2025.pdf)

4. **Tax Year 2026–27 (Commencing 1 April 2026)**
   - Framework: `income_tax_act_2025`
   - Primary enactment: [Income-tax Act, 2025](https://www.incometaxindia.gov.in/documents/d/guest/income_tax_act_2025_as_amended_by_fa_act_2026-pdf) read with [Finance Act, 2026](https://www.incometaxindia.gov.in/documents/d/guest/finance-act-2026-pdf-1)

---

## 2. Tax Rates & Slabs

### A. Old Tax Regime (Section 115BAC Option Out / Regular Provisions)

Applies across AY 2024–25, AY 2025–26, AY 2026–27, and TY 2026–27:

| Slab Threshold | General (< 60 yrs) | Senior (60 to 79 yrs) | Super Senior (≥ 80 yrs) |
|---|---|---|---|
| Up to ₹2,50,000 | 0% | 0% | 0% |
| ₹2,50,001 to ₹3,00,000 | 5% | 0% | 0% |
| ₹3,00,001 to ₹5,00,000 | 5% | 5% | 0% |
| ₹5,00,001 to ₹10,00,000 | 20% | 20% | 20% |
| Above ₹10,00,000 | 30% | 30% | 30% |

- **Standard Deduction (Salaried):** ₹50,000 (Section 16(ia)).
- **Rebate u/s 87A:** Resident individual with taxable income up to ₹5,00,000 receives a rebate up to ₹12,500.

### B. New Tax Regime (Section 115BAC Default / Simplified Provisions)

#### AY 2024–25 (FY 2023–24)
- **Standard deduction:** ₹50,000
- **Slabs:**
  - Up to ₹3,00,000: 0%
  - ₹3,00,001 to ₹6,00,000: 5%
  - ₹6,00,001 to ₹9,00,000: 10%
  - ₹9,00,001 to ₹12,00,000: 15%
  - ₹12,00,001 to ₹15,00,000: 20%
  - Above ₹15,00,000: 30%
- **Rebate u/s 87A:** Full rebate up to ₹7,00,000 (max ₹25,000) with statutory marginal relief for income exceeding ₹7,00,000.

#### AY 2025–26 (FY 2024–25)
- **Standard deduction:** ₹75,000 (enhanced by Finance (No. 2) Act, 2024)
- **Slabs:**
  - Up to ₹3,00,000: 0%
  - ₹3,00,001 to ₹7,00,000: 5%
  - ₹7,00,001 to ₹10,00,000: 10%
  - ₹10,00,001 to ₹12,00,000: 15%
  - ₹12,00,001 to ₹15,00,000: 20%
  - Above ₹15,00,000: 30%
- **Rebate u/s 87A:** Full rebate up to ₹7,00,000 (max ₹25,000) with marginal relief.

#### AY 2026–27 & TY 2026–27 (Income-tax Act, 2025)
- **Standard deduction:** ₹75,000
- **Slabs:**
  - Up to ₹4,00,000: 0%
  - ₹4,00,001 to ₹8,00,000: 5%
  - ₹8,00,001 to ₹12,00,000: 10%
  - ₹12,00,001 to ₹16,00,000: 15%
  - ₹16,00,001 to ₹20,00,000: 20%
  - ₹20,00,001 to ₹24,00,000: 25%
  - Above ₹24,00,000: 30%
- **Rebate u/s 87A:** Full rebate up to ₹12,00,000 (max ₹60,000) with marginal relief:
  $$\text{Tax Payable} \le (\text{Taxable Income} - ₹12,00,000)$$
  Marginal relief applies until taxable income reaches ₹12,75,000 (where normal tax without rebate equals the excess over ₹12,00,000).

---

## 3. Statutory Deductions Mapping (1961 Act vs 2025 Act)

| Deduction Head | 1961 Act Section | 2025 Act Section | Old Regime Limit | New Regime Availability |
|---|---|---|---|---|
| Standard Deduction | Section 16(ia) | Section 16 / Section 20 | ₹50,000 | ₹75,000 (AY 25–26 onwards) |
| Life insurance, EPF, PPF, ELSS, Housing loan principal | Section 80C, 80CCC, 80CCD(1) | Section 123 read with Schedule XV | ₹1,50,000 aggregate | **Not available** |
| Additional personal NPS | Section 80CCD(1B) | Section 124(3) | ₹50,000 | **Not available** |
| Employer contribution to NPS | Section 80CCD(2) | Section 124(2) | 14% (Govt) / 10% (Other) of salary | **Available** (14% Govt / 14% Other AY 25-26+) |
| Health insurance & checkup (Self/Family) | Section 80D | Section 126 | ₹25,000 (₹50,000 if senior citizen) | **Not available** |
| Health insurance & checkup (Parents) | Section 80D | Section 126 | ₹25,000 (₹50,000 if senior citizen) | **Not available** |
| Self-occupied housing loan interest | Section 24(b) | Section 22 | ₹2,00,000 (conditions met) / ₹30,000 | **Not available** |
| Higher education loan interest | Section 80E | Section 129 | 100% of interest (max 8 years) | **Not available** |
| Savings account interest (Non-senior) | Section 80TTA | Section 153 | ₹10,000 | **Not available** |
| Deposit & savings interest (Senior citizen) | Section 80TTB | Section 153 | ₹50,000 | **Not available** |
| Eligible donations | Section 80G | Section 127 | 50% or 100% with qualifying limit | **Not available** |

---

## 4. Surcharge & Health and Education Cess

### Surcharge Rates (Individual Taxpayers)
- **₹50 Lakh to ₹1 Crore:** 10%
- **₹1 Crore to ₹2 Crore:** 15%
- **₹2 Crore to ₹5 Crore:** 25%
- **Above ₹5 Crore:** 37% (Old Regime only; capped at 25% under New Regime)

### Surcharge Marginal Relief
Under Section 89A / applicable statutory provisions, when taxable income exceeds a surcharge threshold ($T$), the total tax and surcharge payable cannot exceed:
$$\text{Tax on } T + (\text{Taxable Income} - T)$$

### Health & Education Cess
- Rate: 4% applied on $(\text{Tax after Rebate} + \text{Surcharge})$.

---

## 5. Rounding Standards

- **Taxable Income (Section 288A):** Rounded to the nearest multiple of ten rupees (half a rupee or more rounded up).
- **Tax Liability (Section 288B):** Rounded to the nearest multiple of ten rupees.
- **Arithmetic Invariant:** Internal computations use exact integer paise (`bigint`). Intermediate paise values are converted to rupees using `((valuePaise + 500n) / 1000n) * 10n` to guarantee zero IEEE 754 floating-point drift.
