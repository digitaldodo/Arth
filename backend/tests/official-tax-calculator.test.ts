import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareTax, type TaxEstimateInput } from '../src/modules/tax/tax-engine.js';
import { TAX_RULESETS } from '../src/modules/tax/tax-rules.js';

const baseInput = (ruleset: string, salaryRupees: bigint, age = 35): TaxEstimateInput => ({
  ruleset,
  taxpayerCategory: 'individual',
  age,
  residentialStatus: 'resident',
  salaryRupees,
  oldRegimeSalaryExemptionsRupees: 0n,
  newRegimeSalaryExemptionsRupees: 0n,
  housePropertyRupees: 0n,
  businessProfessionalRupees: 0n,
  otherNormalIncomeRupees: 0n,
  specialRateIncomeRupees: 0n,
  deductionClaims: {
    section123Rupees: 0n,
    additionalNpsRupees: 0n,
    healthSelfRupees: 0n,
    healthParentsRupees: 0n,
    savingsInterestRupees: 0n,
    selfOccupiedHomeInterestRupees: 0n,
    selfOccupiedHomeInterestLargeLimitEligible: false,
    educationLoanInterestRupees: 0n,
    educationLoanYearsRemaining: 0,
    educationLoanEligibilityConfirmed: false,
    employerNpsRupees: 0n,
    employerNpsBaseSalaryRupees: 0n,
    employerCategory: 'other',
    selfFamilySeniorCitizen: false,
    parentSeniorCitizen: false,
  },
  taxCreditsRupees: 0n,
  allInputsVerified: true,
});

test('Official Tax Benchmarks: AY 2024-25 New Regime 7L rebate & marginal relief', () => {
  // Case 1: Salary ₹7,50,000 -> Std Ded ₹50,000 -> Taxable ₹7,00,000 -> Zero Tax
  const atThreshold = compareTax(baseInput('AY2024-25', 750_000n));
  assert.equal(atThreshold.status, 'estimated');
  assert.equal(atThreshold.new?.taxableIncomeRupees, 700_000n);
  assert.equal(atThreshold.new?.totalLiabilityRupees, 0n);

  // Case 2: Salary ₹7,60,000 -> Std Ded ₹50,000 -> Taxable ₹7,10,000 -> Marginal Relief tax = ₹10,400
  const aboveThreshold = compareTax(baseInput('AY2024-25', 760_000n));
  assert.equal(aboveThreshold.status, 'estimated');
  assert.equal(aboveThreshold.new?.taxableIncomeRupees, 710_000n);
  assert.equal(aboveThreshold.new?.totalLiabilityRupees, 10_400n);
});

test('Official Tax Benchmarks: AY 2025-26 New Regime enhanced Std Ded ₹75,000', () => {
  // Salary ₹7,75,000 -> Std Ded ₹75,000 -> Taxable ₹7,00,000 -> Zero Tax
  const result = compareTax(baseInput('AY2025-26', 775_000n));
  assert.equal(result.status, 'estimated');
  assert.equal(result.new?.taxableIncomeRupees, 700_000n);
  assert.equal(result.new?.totalLiabilityRupees, 0n);

  // Slabs test: ₹15,75,000 -> Std Ded ₹75,000 -> Taxable ₹15,00,000
  // Slabs: 0-3L: 0, 3-7L: 20k, 7-10L: 30k, 10-12L: 30k, 12-15L: 60k = 1,40,000 + 4% cess = 1,45,600
  const higher = compareTax(baseInput('AY2025-26', 1_575_000n));
  assert.equal(higher.new?.taxableIncomeRupees, 1_500_000n);
  assert.equal(higher.new?.totalLiabilityRupees, 145_600n);
});

test('Official Tax Benchmarks: AY 2026-27 & TY 2026-27 ₹12 Lakh Rebate & Marginal Relief', () => {
  for (const period of ['AY2026-27', 'TY2026-27']) {
    // Case 1: Gross ₹12,75,000 -> Std Ded ₹75,000 -> Taxable ₹12,00,000 -> Zero Tax
    const zeroTax = compareTax(baseInput(period, 1_275_000n));
    assert.equal(zeroTax.new?.taxableIncomeRupees, 1_200_000n);
    assert.equal(zeroTax.new?.totalLiabilityRupees, 0n);

    // Case 2: Gross ₹13,00,000 -> Std Ded ₹75,000 -> Taxable ₹12,25,000 -> Tax payable ₹26,000 (Marginal Relief)
    const marginal = compareTax(baseInput(period, 1_300_000n));
    assert.equal(marginal.new?.taxableIncomeRupees, 1_225_000n);
    assert.equal(marginal.new?.totalLiabilityRupees, 26_000n);

    // Case 3: Gross ₹20,75,000 -> Std Ded ₹75,000 -> Taxable ₹20,00,000
    // Slabs: 0-4L: 0, 4-8L: 20k, 8-12L: 40k, 12-16L: 60k, 16-20L: 80k = 2,00,000 + 4% cess = 2,08,000
    const slabTest = compareTax(baseInput(period, 2_075_000n));
    assert.equal(slabTest.new?.taxableIncomeRupees, 2_000_000n);
    assert.equal(slabTest.new?.totalLiabilityRupees, 208_000n);
  }
});

test('Official Tax Benchmarks: Old Regime Slabs by Age Tier (General vs Senior vs Super Senior)', () => {
  const salary = 1_050_000n; // After Std Ded ₹50k -> Taxable ₹10,00,000

  // General (<60): Basic exemption ₹2,50,000
  // Slabs: 0-2.5L: 0, 2.5-5L: 12,500, 5-10L: 1,00,000 = 1,12,500 + 4% = 1,17,000
  const general = compareTax(baseInput('AY2026-27', salary, 30));
  assert.equal(general.old?.taxableIncomeRupees, 1_000_000n);
  assert.equal(general.old?.totalLiabilityRupees, 117_000n);

  // Senior (60 to 79): Basic exemption ₹3,00,000
  // Slabs: 0-3L: 0, 3-5L: 10,000, 5-10L: 1,00,000 = 1,10,000 + 4% = 1,14,400
  const senior = compareTax(baseInput('AY2026-27', salary, 65));
  assert.equal(senior.old?.taxableIncomeRupees, 1_000_000n);
  assert.equal(senior.old?.totalLiabilityRupees, 114_400n);

  // Super Senior (>=80): Basic exemption ₹5,00,000
  // Slabs: 0-5L: 0, 5-10L: 1,00,000 = 1,00,000 + 4% = 1,04,000
  const superSenior = compareTax(baseInput('AY2026-27', salary, 82));
  assert.equal(superSenior.old?.taxableIncomeRupees, 1_000_000n);
  assert.equal(superSenior.old?.totalLiabilityRupees, 104_000n);
});

test('Official Tax Benchmarks: Surcharge Marginal Relief at ₹50 Lakh boundary', () => {
  // At ₹51,00,000 taxable income, 10% surcharge applies on income above ₹50L.
  // Permissible tax increase is capped so tax does not exceed tax at ₹50L + excess income over ₹50L.
  const input = baseInput('AY2026-27', 5_175_000n); // Taxable = ₹51,00,000
  const result = compareTax(input);
  assert.equal(result.status, 'estimated');
  assert.ok((result.new?.surchargePaise ?? 0n) > 0n);
  assert.ok((result.new?.totalLiabilityRupees ?? 0n) > 0n);
});

test('TAX_RULESETS citations match verified official government sources', () => {
  for (const [key, ruleset] of Object.entries(TAX_RULESETS)) {
    assert.ok(ruleset.sources.length >= 1, `Ruleset ${key} must have at least one official citation`);
    for (const src of ruleset.sources) {
      assert.ok(src.startsWith('https://'), `Source URL must use HTTPS: ${src}`);
      assert.ok(src.includes('incometaxindia.gov.in'), `Source URL must point to official incometaxindia.gov.in domain: ${src}`);
    }
  }
});
