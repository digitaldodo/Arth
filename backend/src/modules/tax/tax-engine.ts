import { TAX_RULESETS, type TaxRuleset, type TaxSlab } from './tax-rules.js';
import { calculateDeductions, deductionClaimExceedsIncome, type DeductionClaims, type DeductionLine } from './tax-deductions.js';

export type Regime = 'old' | 'new';
export interface TaxEstimateInput {
  ruleset: string;
  taxpayerCategory: 'individual' | 'huf' | 'other';
  age: number;
  residentialStatus: 'resident' | 'non_resident';
  salaryRupees: bigint;
  oldRegimeSalaryExemptionsRupees: bigint;
  newRegimeSalaryExemptionsRupees: bigint;
  housePropertyRupees: bigint;
  businessProfessionalRupees: bigint;
  otherNormalIncomeRupees: bigint;
  specialRateIncomeRupees: bigint;
  deductionClaims: DeductionClaims;
  taxCreditsRupees: bigint;
  allInputsVerified: boolean;
};

export interface RegimeEstimate {
  regime: Regime;
  grossTotalIncomeRupees: bigint;
  exemptionsRupees: bigint;
  deductionsRupees: bigint;
  taxableIncomeRupees: bigint;
  taxBeforeRebatePaise: bigint;
  rebatePaise: bigint;
  surchargePaise: bigint;
  cessPaise: bigint;
  totalLiabilityRupees: bigint;
  taxCreditsRupees: bigint;
  remainingRupees: bigint;
  deductionBreakdown: DeductionLine[];
}

export interface TaxComparison {
  status: 'estimated' | 'unsupported' | 'needs_verification';
  reason: string | null;
  ruleset: { id: string; framework: string; period: string; effectiveFrom: string; verifiedOn: string; sources: string[] };
  old: RegimeEstimate | null;
  new: RegimeEstimate | null;
  recommendedRegime: Regime | null;
  differenceRupees: bigint | null;
  oldBreakEvenAdditionalDeductionRupees: bigint | null;
  oldRegimeDeductionHeadroom: Array<{ key: string; remainingLimitRupees: bigint }>;
  explanation: string[];
}

const min = (a: bigint, b: bigint) => a < b ? a : b;
const max = (a: bigint, b: bigint) => a > b ? a : b;
const abs = (value: bigint) => value < 0n ? -value : value;
const REGIME_TIE_THRESHOLD_RUPEES = 1_000n;
const roundTo10 = (value: bigint) => ((value + 5n) / 10n) * 10n;
const paiseToRupeesRounded10 = (valuePaise: bigint) => ((valuePaise + 500n) / 1000n) * 10n;

function slabTaxPaise(taxableRupees: bigint, slabs: TaxSlab[]): bigint {
  let taxPaise = 0n;
  let lower = 0n;
  for (const current of slabs) {
    const upper = current.upperRupees ?? taxableRupees;
    const segment = max(0n, min(taxableRupees, upper) - lower);
    taxPaise += segment * current.ratePercent;
    if (taxableRupees <= upper) break;
    lower = upper;
  }
  return taxPaise;
}

function ageSlabs(rules: TaxRuleset, age: number, resident: boolean): TaxSlab[] {
  if (!resident) return rules.oldSlabsByAge.general;
  if (age >= 80) return rules.oldSlabsByAge.superSenior;
  if (age >= 60) return rules.oldSlabsByAge.senior;
  return rules.oldSlabsByAge.general;
}

function surchargeRatePercent(incomeRupees: bigint, regime: Regime): { threshold: bigint; rate: bigint } {
  if (incomeRupees <= 5_000_000n) return { threshold: 5_000_000n, rate: 0n };
  if (incomeRupees <= 10_000_000n) return { threshold: 5_000_000n, rate: 10n };
  if (incomeRupees <= 20_000_000n) return { threshold: 10_000_000n, rate: 15n };
  if (regime === 'new') return { threshold: 20_000_000n, rate: 25n };
  if (incomeRupees <= 50_000_000n) return { threshold: 20_000_000n, rate: 25n };
  return { threshold: 50_000_000n, rate: 37n };
}

function calculateOne(input: TaxEstimateInput, rules: TaxRuleset, regime: Regime, eligibleDeductionsRupees: bigint, deductionBreakdown: DeductionLine[], extraDeduction = 0n): RegimeEstimate {
  const exemptions = regime === 'old' ? input.oldRegimeSalaryExemptionsRupees : input.newRegimeSalaryExemptionsRupees;
  const salaryAfterExemptions = max(0n, input.salaryRupees - exemptions);
  const salaryDeduction = min(salaryAfterExemptions, regime === 'old' ? rules.oldStandardDeductionRupees : rules.newStandardDeductionRupees);
  const gross = salaryAfterExemptions + input.housePropertyRupees + input.businessProfessionalRupees + input.otherNormalIncomeRupees;
  const regimeSpecific = eligibleDeductionsRupees + extraDeduction;
  const deductions = salaryDeduction + regimeSpecific;
  const taxable = roundTo10(max(0n, gross - deductions));
  const slabs = regime === 'old'
    ? ageSlabs(rules, input.age, input.residentialStatus === 'resident')
    : rules.newSlabs;
  const isResident = input.residentialStatus === 'resident';
  const taxAtIncome = (income: bigint) => {
    const beforeRebate = slabTaxPaise(income, slabs);
    let rebate = 0n;
    if (isResident && regime === 'old' && income <= rules.oldRebate.thresholdRupees) {
      rebate = min(beforeRebate, rules.oldRebate.maxRupees * 100n);
    } else if (isResident && regime === 'new' && income <= rules.newRebate.thresholdRupees) {
      rebate = min(beforeRebate, rules.newRebate.maxRupees * 100n);
    } else if (isResident && regime === 'new' && rules.newRebate.marginalRelief) {
      const overThreshold = income - rules.newRebate.thresholdRupees;
      rebate = beforeRebate > overThreshold * 100n ? beforeRebate - overThreshold * 100n : 0n;
    }
    return { beforeRebate, afterRebate: max(0n, beforeRebate - rebate), rebate };
  };
  const { beforeRebate: taxBeforeRebate, afterRebate: taxAfterRebate, rebate } = taxAtIncome(taxable);
  const surcharge = surchargeRatePercent(taxable, regime);
  let surchargePaise = (taxAfterRebate * surcharge.rate) / 100n;
  if (surcharge.rate > 0n) {
    const thresholdTaxPaise = taxAtIncome(surcharge.threshold).afterRebate;
    const permissibleTaxIncreasePaise = thresholdTaxPaise + (taxable - surcharge.threshold) * 100n - taxAfterRebate;
    surchargePaise = min(surchargePaise, max(0n, permissibleTaxIncreasePaise));
  }
  const cessPaise = ((taxAfterRebate + surchargePaise) * 4n) / 100n;
  const liability = paiseToRupeesRounded10(taxAfterRebate + surchargePaise + cessPaise);
  return {
    regime, grossTotalIncomeRupees: gross, exemptionsRupees: exemptions, deductionsRupees: deductions,
    taxableIncomeRupees: taxable, taxBeforeRebatePaise: taxBeforeRebate, rebatePaise: rebate,
    surchargePaise, cessPaise, totalLiabilityRupees: liability,
    taxCreditsRupees: input.taxCreditsRupees, deductionBreakdown,
    remainingRupees: liability - input.taxCreditsRupees,
  };
}

export function compareTax(input: TaxEstimateInput): TaxComparison {
  const rules = TAX_RULESETS[input.ruleset];
  const unsupported = (reason: string, status: 'unsupported' | 'needs_verification' = 'unsupported'): TaxComparison => ({
    status, reason, ruleset: rules ? { id: rules.id, framework: rules.framework, period: rules.period, effectiveFrom: rules.effectiveFrom, verifiedOn: rules.verifiedOn, sources: rules.sources } : { id: input.ruleset, framework: 'unknown', period: input.ruleset, effectiveFrom: 'unknown', verifiedOn: 'unknown', sources: [] },
    old: null, new: null, recommendedRegime: null, differenceRupees: null,
    oldBreakEvenAdditionalDeductionRupees: null, oldRegimeDeductionHeadroom: [], explanation: [],
  });
  if (!rules) return unsupported('No verified ruleset exists for the selected period.');
  if (input.taxpayerCategory !== 'individual') return unsupported('This ruleset currently supports individual taxpayers only.');
  if (input.age < 18 || input.age > 120) return unsupported('Enter a valid age to use this calculation.');
  if ([input.salaryRupees, input.oldRegimeSalaryExemptionsRupees, input.newRegimeSalaryExemptionsRupees, input.housePropertyRupees, input.businessProfessionalRupees, input.otherNormalIncomeRupees, input.specialRateIncomeRupees, input.taxCreditsRupees].some((value) => value < 0n) || deductionClaimExceedsIncome(input.deductionClaims, input.age)) return unsupported('Income, exemption, deduction and tax-credit amounts cannot be negative.');
  if (input.oldRegimeSalaryExemptionsRupees > input.salaryRupees || input.newRegimeSalaryExemptionsRupees > input.salaryRupees) return unsupported('Salary exemptions cannot exceed gross salary.');
  if (input.deductionClaims.employerNpsBaseSalaryRupees > input.salaryRupees) return unsupported('The employer NPS salary base cannot exceed gross salary.');
  if (input.specialRateIncomeRupees > 0n) return unsupported('Special-rate income such as capital gains requires a separate ruleset and is not included in this comparison.');
  if (input.businessProfessionalRupees > 0n) return unsupported('Business/professional income requires regime-option and income-head rules that this calculation does not yet model.');
  if (!input.allInputsVerified) return unsupported('Verify the income and deduction documents before treating this estimate as a recommendation.', 'needs_verification');

  const deductions = calculateDeductions(input.deductionClaims, rules, input.age, input.residentialStatus === 'resident');
  const old = calculateOne(input, rules, 'old', deductions.oldTotalRupees, deductions.old);
  const newer = calculateOne(input, rules, 'new', deductions.newTotalRupees, deductions.new);
  const delta = old.totalLiabilityRupees - newer.totalLiabilityRupees;
  const recommendation = abs(delta) <= REGIME_TIE_THRESHOLD_RUPEES ? null : delta > 0n ? 'new' : 'old';
  const oldRegimeDeductionHeadroom = deductions.old
    .filter((line) => line.maximumRupees !== null && line.regime === 'old')
    .map((line) => ({ key: line.key, remainingLimitRupees: max(0n, line.maximumRupees! - line.allowedRupees) }))
    .filter((line) => line.remainingLimitRupees > 0n);
  const maxExtra = oldRegimeDeductionHeadroom.reduce((sum, line) => sum + line.remainingLimitRupees, 0n);
  let breakEven: bigint | null = null;
  if (recommendation === 'new' && maxExtra > 0n) {
    let low = 0n, high = maxExtra;
    if (calculateOne(input, rules, 'old', deductions.oldTotalRupees, deductions.old, high).totalLiabilityRupees <= newer.totalLiabilityRupees) {
      while (low < high) {
        const mid = (low + high) / 2n;
        if (calculateOne(input, rules, 'old', deductions.oldTotalRupees, deductions.old, mid).totalLiabilityRupees <= newer.totalLiabilityRupees) high = mid;
        else low = mid + 1n;
      }
      breakEven = low;
    }
  }
  const explanation = [
    `Ruleset ${rules.id} applies ${rules.period} under ${rules.framework}, effective from ${rules.effectiveFrom}; rules last verified ${rules.verifiedOn}.`,
    `Old-regime estimate uses ₹${old.deductionsRupees.toString()} deductions including its standard deduction and itemized claims after statutory limits.`,
    `New-regime estimate uses ₹${newer.deductionsRupees.toString()} deductions including its standard deduction and eligible employer NPS contribution after its salary-base limit.`,
    recommendation === 'new'
      ? `The new regime is estimated ₹${delta.toString()} lower because its total liability is ₹${newer.totalLiabilityRupees.toString()} versus ₹${old.totalLiabilityRupees.toString()} under the old regime; taxable income is ₹${newer.taxableIncomeRupees.toString()} versus ₹${old.taxableIncomeRupees.toString()}.`
      : recommendation === 'old'
        ? `The old regime is estimated ₹${abs(delta).toString()} lower because its total liability is ₹${old.totalLiabilityRupees.toString()} versus ₹${newer.totalLiabilityRupees.toString()} under the new regime; supported old-regime claims reduce taxable income to ₹${old.taxableIncomeRupees.toString()} versus ₹${newer.taxableIncomeRupees.toString()}.`
        : `No regime is recommended: estimated liabilities differ by ₹${abs(delta).toString()}, within Arth's ₹${REGIME_TIE_THRESHOLD_RUPEES.toString()} comparison threshold.`,
    breakEven === null && recommendation === 'new' ? 'No break-even deduction was found within the additional eligible amount supplied.' : '',
  ].filter(Boolean);
  return {
    status: 'estimated', reason: null,
    ruleset: { id: rules.id, framework: rules.framework, period: rules.period, effectiveFrom: rules.effectiveFrom, verifiedOn: rules.verifiedOn, sources: rules.sources },
    old, new: newer, recommendedRegime: recommendation, differenceRupees: delta,
    oldBreakEvenAdditionalDeductionRupees: breakEven, oldRegimeDeductionHeadroom, explanation,
  };
}

export function serializeTaxComparison(value: TaxComparison): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item)) as Record<string, unknown>;
}
