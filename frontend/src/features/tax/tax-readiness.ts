import type { TaxDocumentReviewRecord } from './tax-document-review';

export type TaxReadinessItem = { id: string; label: string; complete: boolean; nextStep: string };
export type TaxLedgerReview = { review?: string | null };

export function deriveTaxReadiness(input: {
  period: string;
  documents: Array<TaxDocumentReviewRecord & { document_type: string }>;
  ledgerLoaded: boolean;
  ledgerComplete: boolean;
  ledgerReviews: TaxLedgerReview[];
  comparisonComplete: boolean;
}): TaxReadinessItem[] {
  const documents = input.documents.filter((document) => document.tax_year === input.period || document.assessment_year === input.period);
  const verified = documents.flatMap((document) => document.fields.filter((field) => field.verification_status === 'verified'));
  const has = (key: string) => verified.some((field) => field.field_key === key);
  const taxInfoDocs = documents.filter((document) => ['form26as', 'ais', 'tis'].includes(document.document_type));
  const pendingDeductionEvidence = documents.flatMap((document) => document.fields)
    .filter((field) => field.field_key.startsWith('deduction.') && !['verified', 'not_applicable'].includes(field.verification_status));
  const allLedgerReviewsDone = input.ledgerLoaded && input.ledgerComplete
    && input.ledgerReviews.every((entry) => Boolean(entry.review) && !['unreviewed', 'unsure'].includes(String(entry.review)));

  return [
    { id: 'salary', label: 'Gross salary information verified', complete: has('salary.gross'), nextStep: 'Add the salary document for this period and verify gross salary.' },
    { id: 'tds', label: 'TDS information verified', complete: has('tax.tds'), nextStep: 'Add Form 16, Form 16A, Form 130/131, or another TDS source for this period.' },
    { id: 'investments', label: 'Investment information verified', complete: has('deduction.section_80c') || has('deduction.employer_nps') || has('deduction.section_80ccd_1b'), nextStep: 'Review qualifying investment or employer NPS evidence for this period.' },
    { id: 'health', label: 'Health insurance evidence reviewed', complete: has('deduction.section_80d'), nextStep: 'Add and verify health insurance evidence if relevant.' },
    { id: 'housing', label: 'Housing information reviewed', complete: has('deduction.home_loan_interest') || has('housing.rent'), nextStep: 'Review rent/HRA or housing-loan records, or record that they do not apply.' },
    { id: 'other_income', label: 'Other income and ledger credits reviewed', complete: allLedgerReviewsDone, nextStep: 'Load the complete income ledger for this period and classify each credit for review.' },
    { id: 'tax_statements', label: 'AIS/TIS or tax-credit information reconciled', complete: taxInfoDocs.some((document) => document.fields.length > 0 && document.fields.every((field) => field.verification_status === 'verified')), nextStep: 'Add AIS, TIS, or Form 26AS for this period and verify its extracted fields.' },
    { id: 'deductions', label: 'Potential deductions reviewed', complete: verified.some((field) => field.field_key.startsWith('deduction.')) && pendingDeductionEvidence.length === 0, nextStep: 'Review every extracted deduction candidate and attach the corresponding evidence.' },
    { id: 'comparison', label: 'Tax regime comparison completed', complete: input.comparisonComplete, nextStep: 'Complete the estimate after resolving relevant missing information.' },
  ];
}
