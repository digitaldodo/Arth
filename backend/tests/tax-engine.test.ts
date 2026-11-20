import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareTax, serializeTaxComparison, type TaxEstimateInput } from '../src/modules/tax/tax-engine.js';
import { EMPTY_DEDUCTION_CLAIMS } from '../src/modules/tax/tax-deductions.js';

const base = (overrides: Partial<TaxEstimateInput> = {}): TaxEstimateInput => ({
  ruleset: 'AY2026-27', taxpayerCategory: 'individual', age: 35, residentialStatus: 'resident',
  salaryRupees: 0n, oldRegimeSalaryExemptionsRupees: 0n, newRegimeSalaryExemptionsRupees: 0n,
  housePropertyRupees: 0n, businessProfessionalRupees: 0n,
  otherNormalIncomeRupees: 0n, specialRateIncomeRupees: 0n,
  deductionClaims: { ...EMPTY_DEDUCTION_CLAIMS },
  taxCreditsRupees: 0n, allInputsVerified: true, ...overrides,
});

test('AY 2026-27 new-regime rebate removes tax at the ₹12 lakh taxable-income threshold', () => {
  const result = compareTax(base({ salaryRupees: 1_275_000n }));
  assert.equal(result.status, 'estimated');
  assert.equal(result.new?.taxableIncomeRupees, 1_200_000n);
  assert.equal(result.new?.rebatePaise, 6_000_000n);
  assert.equal(result.new?.totalLiabilityRupees, 0n);
});

test('AY 2026-27 new-regime marginal relief applies just above ₹12 lakh', () => {
  const result = compareTax(base({ salaryRupees: 1_285_000n }));
  assert.equal(result.new?.taxableIncomeRupees, 1_210_000n);
  assert.equal(result.new?.totalLiabilityRupees, 10_400n);
});

test('AY 2026-27 retains the statutory rebate when tax is already below the threshold excess', () => {
  const result = compareTax(base({ salaryRupees: 1_350_000n }));
  assert.equal(result.new?.taxableIncomeRupees, 1_275_000n);
  assert.equal(result.new?.rebatePaise, 0n);
  assert.equal(result.new?.totalLiabilityRupees, 74_100n);
});

test('AY 2026-27 marginal relief matches official boundary examples through ₹12.75 lakh', () => {
  const examples = [
    [1_210_000n, 10_400n], [1_250_000n, 52_000n],
    [1_270_000n, 72_800n], [1_275_000n, 74_100n],
  ] as const;
  for (const [taxableIncome, expectedTax] of examples) {
    const result = compareTax(base({ salaryRupees: taxableIncome + 75_000n }));
    assert.equal(result.new?.taxableIncomeRupees, taxableIncome);
    assert.equal(result.new?.totalLiabilityRupees, expectedTax);
  }
});

test('tax ruleset includes its primary official source references', () => {
  const result = compareTax(base({ ruleset: 'AY2026-27' }));
  assert.ok(result.ruleset.sources.includes('https://incometaxindia.gov.in/Documents/Budget/budget-2025/faqs-budget-2025.pdf'));
  const current = compareTax(base({ ruleset: 'TY2026-27' }));
  assert.ok(current.ruleset.sources.some((source) => source.endsWith('income_tax_act_2025_as_amended_by_fa_act_2026-pdf')));
});

test('old-regime slab calculation includes standard deduction, cess and integer-rupee rounding', () => {
  const result = compareTax(base({ ruleset: 'AY2026-27', salaryRupees: 1_050_000n }));
  assert.equal(result.old?.taxableIncomeRupees, 1_000_000n);
  assert.equal(result.old?.taxBeforeRebatePaise, 11_250_000n);
  assert.equal(result.old?.cessPaise, 450_000n);
  assert.equal(result.old?.totalLiabilityRupees, 117_000n);
});

test('regimes calculate salary exemptions independently before applying standard deductions', () => {
  const result = compareTax(base({
    salaryRupees: 1_500_000n,
    oldRegimeSalaryExemptionsRupees: 100_000n,
    newRegimeSalaryExemptionsRupees: 25_000n,
  }));
  assert.equal(result.old?.exemptionsRupees, 100_000n);
  assert.equal(result.new?.exemptionsRupees, 25_000n);
  assert.equal(result.old?.grossTotalIncomeRupees, 1_400_000n);
  assert.equal(result.new?.grossTotalIncomeRupees, 1_475_000n);
  assert.equal(result.old?.taxableIncomeRupees, 1_350_000n);
  assert.equal(result.new?.taxableIncomeRupees, 1_400_000n);
});

test('rejects claimed salary exemptions greater than gross salary', () => {
  const result = compareTax(base({ salaryRupees: 100_000n, oldRegimeSalaryExemptionsRupees: 100_001n }));
  assert.equal(result.status, 'unsupported');
  assert.match(result.reason || '', /cannot exceed gross salary/i);
});

test('historical AY 2024-25 rules use historical new-regime slabs and standard deduction', () => {
  const result = compareTax(base({ ruleset: 'AY2024-25', salaryRupees: 1_550_000n }));
  assert.equal(result.ruleset.framework, 'income_tax_act_1961');
  assert.equal(result.new?.taxableIncomeRupees, 1_500_000n);
  assert.equal(result.new?.totalLiabilityRupees, 156_000n);
});

test('historical new-regime rules apply marginal rebate just above ₹7 lakh', () => {
  for (const [ruleset, salaryRupees] of [['AY2024-25', 760_000n], ['AY2025-26', 785_000n]] as const) {
    const result = compareTax(base({ ruleset, salaryRupees }));
    assert.equal(result.new?.taxableIncomeRupees, 710_000n);
    assert.equal(result.new?.totalLiabilityRupees, 10_400n);
  }
});

test('TY 2026-27 selects the 2025 Act ruleset and rejects a mismatched framework at the route boundary', () => {
  const result = compareTax(base({ ruleset: 'TY2026-27', salaryRupees: 1_275_000n }));
  assert.equal(result.ruleset.framework, 'income_tax_act_2025');
  assert.equal(result.ruleset.period, 'TY2026-27');
  assert.equal(result.ruleset.effectiveFrom, '2026-04-01');
  assert.equal(result.old?.deductionBreakdown.find((line) => line.key === 'additionalNps')?.eligibility.includes('section 124(3)'), true);
  assert.equal(result.old?.deductionBreakdown.find((line) => line.key === 'healthSelf')?.eligibility.includes('section 126'), true);
});

test('special-rate income and incomplete verification refuse a regime recommendation', () => {
  const capitalGains = compareTax(base({ specialRateIncomeRupees: 50_000n }));
  assert.equal(capitalGains.status, 'unsupported');
  assert.equal(capitalGains.recommendedRegime, null);
  const unverified = compareTax(base({ salaryRupees: 1_000_000n, allInputsVerified: false }));
  assert.equal(unverified.status, 'needs_verification');
  assert.equal(unverified.old, null);
});

test('break-even is limited to remaining statutory amounts in supported deduction categories', () => {
  const result = compareTax(base({
    salaryRupees: 1_500_000n,
    deductionClaims: { ...EMPTY_DEDUCTION_CLAIMS, section123Rupees: 100_000n },
  }));
  assert.ok(result.oldBreakEvenAdditionalDeductionRupees === null || result.oldBreakEvenAdditionalDeductionRupees <= 50_000n);
  assert.deepEqual(result.oldRegimeDeductionHeadroom.filter((item) => item.key === 'section123'), [{ key: 'section123', remainingLimitRupees: 50_000n }]);
  assert.equal(result.oldRegimeDeductionHeadroom.some((item) => item.key === 'educationLoanInterest'), false, 'Uncapped rules do not produce guessed headroom');
});

test('deductions are itemized, capped, and unavailable under the new regime where law excludes them', () => {
  const result = compareTax(base({ salaryRupees: 2_000_000n, deductionClaims: {
    ...EMPTY_DEDUCTION_CLAIMS, section123Rupees: 300_000n, additionalNpsRupees: 75_000n,
    healthSelfRupees: 45_000n, healthParentsRupees: 60_000n, savingsInterestRupees: 20_000n,
  } }));
  assert.equal(result.old?.deductionBreakdown.find((line) => line.key === 'section123')?.allowedRupees, 150_000n);
  assert.equal(result.old?.deductionBreakdown.find((line) => line.key === 'additionalNps')?.allowedRupees, 50_000n);
  assert.equal(result.old?.deductionBreakdown.find((line) => line.key === 'healthSelf')?.allowedRupees, 25_000n);
  assert.equal(result.old?.deductionBreakdown.find((line) => line.key === 'healthParents')?.allowedRupees, 25_000n);
  assert.equal(result.old?.deductionBreakdown.find((line) => line.key === 'savingsInterest')?.allowedRupees, 10_000n);
  for (const key of ['section123', 'additionalNps', 'healthSelf', 'healthParents', 'savingsInterest', 'selfOccupiedHomeInterest', 'educationLoanInterest']) {
    const line = result.new?.deductionBreakdown.find((item) => item.key === key);
    assert.equal(line?.allowedRupees, 0n);
    assert.equal(line?.maximumRupees, 0n);
    assert.match(line?.eligibility || '', /Not available under the new regime/);
  }
  assert.equal(result.new?.deductionBreakdown.find((item) => item.key === 'employerNps')?.key, 'employerNps');
});

test('senior-citizen health and interest limits and employer NPS percentages are explicit', () => {
  const result = compareTax(base({ salaryRupees: 2_000_000n, age: 62, deductionClaims: {
    ...EMPTY_DEDUCTION_CLAIMS, healthSelfRupees: 60_000n, healthParentsRupees: 70_000n,
    savingsInterestRupees: 70_000n, employerNpsRupees: 300_000n, employerNpsBaseSalaryRupees: 2_000_000n,
    employerCategory: 'government', selfFamilySeniorCitizen: true, parentSeniorCitizen: true,
  } }));
  assert.equal(result.old?.deductionBreakdown.find((line) => line.key === 'healthSelf')?.allowedRupees, 50_000n);
  assert.equal(result.old?.deductionBreakdown.find((line) => line.key === 'healthParents')?.allowedRupees, 50_000n);
  assert.equal(result.old?.deductionBreakdown.find((line) => line.key === 'savingsInterest')?.allowedRupees, 50_000n);
  assert.equal(result.old?.deductionBreakdown.find((line) => line.key === 'employerNps')?.allowedRupees, 280_000n);
  assert.equal(result.new?.deductionBreakdown.find((line) => line.key === 'employerNps')?.allowedRupees, 280_000n);
});

test('non-resident savings interest claim is excluded from this resident-only deduction model', () => {
  const result = compareTax(base({ age: 65, residentialStatus: 'non_resident', deductionClaims: { ...EMPTY_DEDUCTION_CLAIMS, savingsInterestRupees: 50_000n } }));
  assert.equal(result.old?.deductionBreakdown.find((line) => line.key === 'savingsInterest')?.allowedRupees, 0n);
});

test('rejects an employer NPS limit base above gross salary', () => {
  const result = compareTax(base({ salaryRupees: 100_000n, deductionClaims: {
    ...EMPTY_DEDUCTION_CLAIMS, employerNpsBaseSalaryRupees: 100_001n,
  } }));
  assert.equal(result.status, 'unsupported');
  assert.match(result.reason || '', /cannot exceed gross salary/i);
});

test('education loan interest is admitted only with confirmed eligibility inside its eight-year window', () => {
  const eligible = compareTax(base({ salaryRupees: 1_500_000n, deductionClaims: {
    ...EMPTY_DEDUCTION_CLAIMS, educationLoanInterestRupees: 220_000n,
    educationLoanYearsRemaining: 3, educationLoanEligibilityConfirmed: true,
  } }));
  const line = eligible.old?.deductionBreakdown.find((item) => item.key === 'educationLoanInterest');
  assert.equal(line?.allowedRupees, 220_000n, 'Qualified interest has no statutory rupee cap');
  assert.equal(line?.maximumRupees, null);
  assert.match(line?.eligibility || '', /section 80E/);
  assert.equal(eligible.new?.deductionBreakdown.find((item) => item.key === 'educationLoanInterest')?.allowedRupees, 0n);

  const unconfirmed = compareTax(base({ salaryRupees: 1_500_000n, deductionClaims: {
    ...EMPTY_DEDUCTION_CLAIMS, educationLoanInterestRupees: 220_000n, educationLoanYearsRemaining: 3,
  } }));
  assert.equal(unconfirmed.old?.deductionBreakdown.find((item) => item.key === 'educationLoanInterest')?.allowedRupees, 0n);
});

test('regime recommendations explain the calculated difference and avoid ties within the disclosed threshold', () => {
  const recommended = compareTax(base({ salaryRupees: 2_000_000n }));
  assert.ok(recommended.recommendedRegime);
  assert.ok(recommended.explanation.some((line) => line.includes('estimated ₹') && line.includes('because its total liability')));
  const tied = compareTax(base({ salaryRupees: 300_000n }));
  assert.equal(tied.differenceRupees, 0n);
  assert.equal(tied.recommendedRegime, null);
  assert.ok(tied.explanation.some((line) => line.includes('₹1000 comparison threshold')));
});

test('2025 Act education-loan deduction cites section 129 and refuses invalid year-window values', () => {
  const valid = compareTax(base({ ruleset: 'TY2026-27', salaryRupees: 1_500_000n, deductionClaims: {
    ...EMPTY_DEDUCTION_CLAIMS, educationLoanInterestRupees: 100_000n,
    educationLoanYearsRemaining: 1, educationLoanEligibilityConfirmed: true,
  } }));
  assert.match(valid.old?.deductionBreakdown.find((item) => item.key === 'educationLoanInterest')?.eligibility || '', /section 129/);
  const invalid = compareTax(base({ deductionClaims: { ...EMPTY_DEDUCTION_CLAIMS, educationLoanYearsRemaining: 9 } }));
  assert.equal(invalid.status, 'unsupported');
});

test('self-occupied home interest uses the declared ₹30,000 or ₹2,00,000 cap and stays unavailable in new regime', () => {
  const lower = compareTax(base({ deductionClaims: {
    ...EMPTY_DEDUCTION_CLAIMS, selfOccupiedHomeInterestRupees: 80_000n,
  } }));
  assert.equal(lower.old?.deductionBreakdown.find((item) => item.key === 'selfOccupiedHomeInterest')?.allowedRupees, 30_000n);
  const higher = compareTax(base({ deductionClaims: {
    ...EMPTY_DEDUCTION_CLAIMS, selfOccupiedHomeInterestRupees: 250_000n,
    selfOccupiedHomeInterestLargeLimitEligible: true,
  } }));
  const oldLine = higher.old?.deductionBreakdown.find((item) => item.key === 'selfOccupiedHomeInterest');
  assert.equal(oldLine?.allowedRupees, 200_000n);
  assert.match(oldLine?.eligibility || '', /section 24\(b\)/);
  assert.match(oldLine?.eligibility || '', /1 April 1999/);
  assert.equal(higher.new?.deductionBreakdown.find((item) => item.key === 'selfOccupiedHomeInterest')?.allowedRupees, 0n);
  const newAct = compareTax(base({ ruleset: 'TY2026-27', deductionClaims: {
    ...EMPTY_DEDUCTION_CLAIMS, selfOccupiedHomeInterestRupees: 250_000n,
    selfOccupiedHomeInterestLargeLimitEligible: true,
  } }));
  const newActLine = newAct.old?.deductionBreakdown.find((item) => item.key === 'selfOccupiedHomeInterest');
  assert.equal(newActLine?.allowedRupees, 200_000n);
  assert.match(newActLine?.eligibility || '', /section 22\(1\)\(b\) and 22\(2\)/);
  assert.doesNotMatch(newActLine?.eligibility || '', /1 April 1999/);
});

test('surcharge marginal relief is capped using tax at the applicable threshold', () => {
  const justAbove = compareTax(base({ ruleset: 'AY2026-27', salaryRupees: 5_050_010n }));
  assert.equal(justAbove.old!.surchargePaise, 700n, 'Only tax growth beyond ₹50 lakh plus the ₹10 income increase can be charged');

  const beyondOldThreshold = compareTax(base({ ruleset: 'AY2026-27', salaryRupees: 6_100_000n }));
  assert.ok(beyondOldThreshold.old!.surchargePaise > 0n, 'Full surcharge applies when income growth already exceeds surcharge growth');
});

test('estimate serialization converts every BigInt result to decimal text', () => {
  const serialized = serializeTaxComparison(compareTax(base({ salaryRupees: 800_000n })));
  assert.equal(typeof (serialized.old as { totalLiabilityRupees: unknown }).totalLiabilityRupees, 'string');
});
