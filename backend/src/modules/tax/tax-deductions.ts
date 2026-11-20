import type { TaxRuleset } from './tax-rules.js';

export type DeductionClaims = {
  section123Rupees: bigint;
  additionalNpsRupees: bigint;
  healthSelfRupees: bigint;
  healthParentsRupees: bigint;
  savingsInterestRupees: bigint;
  selfOccupiedHomeInterestRupees: bigint;
  selfOccupiedHomeInterestLargeLimitEligible: boolean;
  educationLoanInterestRupees: bigint;
  educationLoanYearsRemaining: number;
  educationLoanEligibilityConfirmed: boolean;
  employerNpsRupees: bigint;
  employerNpsBaseSalaryRupees: bigint;
  employerCategory: 'government' | 'other';
  selfFamilySeniorCitizen: boolean;
  parentSeniorCitizen: boolean;
};

export type DeductionLine = { key: string; claimedRupees: bigint; allowedRupees: bigint; maximumRupees: bigint | null; regime: 'old' | 'both'; eligibility: string; source: string };

const OLD_ACT_DEDUCTION_SOURCE = 'https://www.incometax.gov.in/iec/foportal/help/individual/return-applicable-1';
const NEW_ACT_DEDUCTION_SOURCE = 'https://incometaxindia.gov.in/Documents/Act/Income-tax-Act-2025.pdf';
const min = (a: bigint, b: bigint) => a < b ? a : b;

export const EMPTY_DEDUCTION_CLAIMS: DeductionClaims = {
  section123Rupees: 0n, additionalNpsRupees: 0n, healthSelfRupees: 0n, healthParentsRupees: 0n,
  savingsInterestRupees: 0n, selfOccupiedHomeInterestRupees: 0n, selfOccupiedHomeInterestLargeLimitEligible: false,
  educationLoanInterestRupees: 0n, educationLoanYearsRemaining: 0,
  educationLoanEligibilityConfirmed: false, employerNpsRupees: 0n, employerNpsBaseSalaryRupees: 0n,
  employerCategory: 'other', selfFamilySeniorCitizen: false, parentSeniorCitizen: false,
};

/** Calculates only individually identified claims. Claimed evidence and statutory availability stay visible per line. */
export function calculateDeductions(claims: DeductionClaims, rules: TaxRuleset, age: number, residentIndividual: boolean) {
  const newAct = rules.framework === 'income_tax_act_2025';
  const source = newAct ? NEW_ACT_DEDUCTION_SOURCE : OLD_ACT_DEDUCTION_SOURCE;
  const oldHealthSelfLimit = claims.selfFamilySeniorCitizen ? 50_000n : 25_000n;
  const healthParentsLimit = claims.parentSeniorCitizen ? 50_000n : 25_000n;
  const savingsLimit = !residentIndividual ? 0n : age >= 60 ? 50_000n : 10_000n;
  const oldEmployerRate = claims.employerCategory === 'government' ? 14n : 10n;
  const npsBase = claims.employerNpsBaseSalaryRupees;
  const employerNpsOldLimit = (npsBase * oldEmployerRate) / 100n;
  const employerNpsNewLimit = (npsBase * 14n) / 100n;
  const lines: { old: DeductionLine[]; new: DeductionLine[] } = { old: [], new: [] };
  const addOld = (key: string, claimed: bigint, limit: bigint, eligibility: string) => {
    const line = { key, claimedRupees: claimed, allowedRupees: min(claimed, limit), maximumRupees: limit, regime: 'old' as const, eligibility, source };
    lines.old.push(line);
    lines.new.push({ ...line, allowedRupees: 0n, maximumRupees: 0n, eligibility: `Not available under the new regime. ${eligibility}` });
  };
  addOld('section123', claims.section123Rupees, rules.section123LimitRupees, rules.framework === 'income_tax_act_2025'
    ? 'Eligible payments listed in Schedule XV, subject to section 123 and documentary conditions.'
    : 'Qualifying payments under sections 80C, 80CCC and 80CCD(1), subject to their combined statutory ceiling and evidence.');
  addOld('additionalNps', claims.additionalNpsRupees, 50_000n, `Eligible additional contribution to the notified pension scheme under ${newAct ? 'section 124(3)' : 'section 80CCD(1B)'}; separate from the combined savings limit.`);
  addOld('healthSelf', claims.healthSelfRupees, oldHealthSelfLimit, `Eligible health-insurance premium and permitted preventive check-up for self, spouse and dependent children under ${newAct ? 'section 126' : 'section 80D'}. The senior-citizen ceiling applies only when an insured person meets the statutory age test.`);
  addOld('healthParents', claims.healthParentsRupees, healthParentsLimit, `Eligible health-insurance premium and permitted medical expenditure for parents under ${newAct ? 'section 126' : 'section 80D'}. Senior-citizen ceiling applies only when a parent meets the statutory age test.`);
  addOld('savingsInterest', claims.savingsInterestRupees, savingsLimit, !residentIndividual
    ? `This limited model does not allow the resident-individual savings-interest deduction under ${newAct ? 'section 153' : 'section 80TTA/80TTB'} for a non-resident.`
    : age >= 60
      ? `Eligible interest deduction for a resident senior citizen under ${newAct ? 'section 153' : 'section 80TTB'}, limited to qualifying interest and the ₹50,000 ceiling.`
      : `Eligible savings-account interest deduction for a resident individual under ${newAct ? 'section 153' : 'section 80TTA'}, limited to qualifying interest and the ₹10,000 ceiling.`);
  const homeInterestLimit = claims.selfOccupiedHomeInterestLargeLimitEligible ? 200_000n : 30_000n;
  addOld('selfOccupiedHomeInterest', claims.selfOccupiedHomeInterestRupees, homeInterestLimit,
    `Interest on a qualifying self-occupied property under ${newAct ? 'section 22(1)(b) and 22(2)' : 'section 24(b)'}; ₹${homeInterestLimit.toString()} limit selected from the applicable acquisition/construction and certificate conditions${newAct ? '' : ', including capital borrowed on or after 1 April 1999 for the ₹2,00,000 cap'}. House-property losses and let-out property interest are not modeled here.`);
  const educationLoanWindowOpen = claims.educationLoanEligibilityConfirmed && claims.educationLoanYearsRemaining > 0 && claims.educationLoanYearsRemaining <= 8;
  const educationLine = { key: 'educationLoanInterest', claimedRupees: claims.educationLoanInterestRupees,
    allowedRupees: educationLoanWindowOpen ? claims.educationLoanInterestRupees : 0n, maximumRupees: null, regime: 'old',
    eligibility: educationLoanWindowOpen
      ? `Qualifying interest for higher education of self or an eligible relative under ${newAct ? 'section 129' : 'section 80E'}; no rupee cap, limited to the initial year and seven succeeding years, subject to qualifying lender, relationship, course and payment conditions.`
      : `Not included: confirm a qualifying lender, eligible higher-education borrower/relative, interest paid from chargeable income and an open eight-year deduction window under ${newAct ? 'section 129' : 'section 80E'}.`, source } as const;
  lines.old.push(educationLine);
  lines.new.push({ ...educationLine, allowedRupees: 0n, maximumRupees: 0n, eligibility: `Not available under the new regime. ${educationLine.eligibility}` });
  lines.old.push({ key: 'employerNps', claimedRupees: claims.employerNpsRupees, allowedRupees: min(claims.employerNpsRupees, employerNpsOldLimit), maximumRupees: employerNpsOldLimit, regime: 'both', eligibility: `Employer contribution to the notified pension scheme under ${newAct ? 'section 124' : 'section 80CCD(2)'}; capped at ${oldEmployerRate}% of the entered salary base for the selected employer class.`, source });
  lines.new.push({ key: 'employerNps', claimedRupees: claims.employerNpsRupees, allowedRupees: min(claims.employerNpsRupees, employerNpsNewLimit), maximumRupees: employerNpsNewLimit, regime: 'both', eligibility: `Employer contribution to the notified pension scheme under ${newAct ? 'section 124(2)' : 'section 80CCD(2)'}; capped at 14% of the entered salary base under the selected new regime.`, source });
  const total = (items: DeductionLine[]) => items.reduce((sum, line) => sum + line.allowedRupees, 0n);
  return { old: lines.old, new: lines.new, oldTotalRupees: total(lines.old), newTotalRupees: total(lines.new) };
}

export function deductionClaimExceedsIncome(claims: DeductionClaims, age: number): boolean {
  return Object.values(claims).some((value) => typeof value === 'bigint' && value < 0n) || age < 18 ||
    !Number.isInteger(claims.educationLoanYearsRemaining) || claims.educationLoanYearsRemaining < 0 || claims.educationLoanYearsRemaining > 8 ||
    typeof claims.selfOccupiedHomeInterestLargeLimitEligible !== 'boolean' || typeof claims.educationLoanEligibilityConfirmed !== 'boolean';
}
