export interface TaxDocumentReviewField {
  id: string;
  field_key: string;
  field_value: { value?: string };
  verification_status: string;
  source_page?: number | null;
  source_location?: string | null;
}

export interface TaxDocumentReviewRecord {
  id: string;
  display_name: string;
  tax_year: string | null;
  assessment_year: string | null;
  fields: TaxDocumentReviewField[];
}

export interface VerifiedTaxSourceField {
  document: TaxDocumentReviewRecord;
  field: TaxDocumentReviewField;
}

/** Documents without a recognized matching tax period cannot substantiate a period-specific estimate. */
export function verifiedTaxFieldsForPeriod(documents: TaxDocumentReviewRecord[], period: string): VerifiedTaxSourceField[] {
  return documents
    .filter((document) => document.tax_year === period || document.assessment_year === period)
    .flatMap((document) => document.fields
      .filter((field) => field.verification_status === 'verified')
      .map((field) => ({ document, field })));
}

/** Conflicts are evaluated only among verified evidence for the selected year. */
export function conflictingVerifiedFieldKeys(fields: VerifiedTaxSourceField[]): Set<string> {
  const values = new Map<string, Set<string>>();
  for (const { field } of fields) {
    const value = String(field.field_value.value ?? '').trim();
    if (!value) continue;
    const entries = values.get(field.field_key) || new Set<string>();
    entries.add(value);
    values.set(field.field_key, entries);
  }
  return new Set([...values].filter(([, entries]) => entries.size > 1).map(([key]) => key));
}

export function verifiedValue(fields: VerifiedTaxSourceField[], key: string): string | null {
  const matches = new Set(fields.filter(({ field }) => field.field_key === key)
    .map(({ field }) => String(field.field_value.value ?? '').trim()).filter(Boolean));
  return matches.size === 1 ? [...matches][0] : null;
}

const INPUT_FIELD_KEYS: Record<string, string[]> = {
  salary: ['salary.gross'], credits: ['tax.tds'], section123: ['deduction.section_80c'],
  additionalNps: ['deduction.section_80ccd_1b'], healthSelf: ['deduction.section_80d'],
  healthParents: ['deduction.section_80d'], savingsInterest: ['deduction.savings_interest'],
  homeLoanInterest: ['deduction.home_loan_interest'],
  educationLoanInterest: ['deduction.education_loan_interest'],
  employerNps: ['deduction.employer_nps'],
};

/** Links only a period-scoped verified field whose whole-rupee value exactly matches a calculator input. */
export function verifiedSourcesMatchingInputs(fields: VerifiedTaxSourceField[], inputs: Record<string, string>): VerifiedTaxSourceField[] {
  const inputValues = new Map<string, Set<string>>();
  for (const [input, value] of Object.entries(inputs)) {
    if (!/^\d{1,15}$/.test(value)) continue;
    for (const key of INPUT_FIELD_KEYS[input] || []) {
      const values = inputValues.get(key) || new Set<string>();
      values.add(value);
      inputValues.set(key, values);
    }
  }
  return fields.filter(({ field }) => {
    const value = String(field.field_value.value ?? '').trim();
    return /^\d{1,15}$/.test(value) && inputValues.get(field.field_key)?.has(value);
  });
}

/** Return exact rupee-denominated document values matching this credit; this is evidence assistance, not tax classification. */
export function exactLedgerAmountSourceOptions(amountPaise: number, fields: VerifiedTaxSourceField[]): VerifiedTaxSourceField[] {
  if (!Number.isSafeInteger(amountPaise) || amountPaise < 0) return [];
  const paise = BigInt(amountPaise);
  return fields.filter(({ field }) => {
    const raw = String(field.field_value.value ?? '').trim();
    return /^\d{1,15}$/.test(raw) && BigInt(raw) * 100n === paise;
  });
}
