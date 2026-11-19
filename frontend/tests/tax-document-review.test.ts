import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conflictingVerifiedFieldKeys, exactLedgerAmountSourceOptions, verifiedSourcesMatchingInputs, verifiedTaxFieldsForPeriod, verifiedValue, type TaxDocumentReviewRecord } from '../src/features/tax/tax-document-review.js';

const document = (id: string, period: string, value: string, status = 'verified'): TaxDocumentReviewRecord => ({
  id, display_name: `${id}.pdf`, tax_year: period, assessment_year: period.startsWith('AY') ? period : null,
  fields: [{ id: `field-${id}`, field_key: 'salary.taxable', field_value: { value }, verification_status: status }],
});

test('verified source fields are isolated to the selected assessment or tax year', () => {
  const fields = verifiedTaxFieldsForPeriod([
    document('old', 'AY2025-26', '1000000'), document('current', 'AY2026-27', '1200000'),
  ], 'AY2026-27');
  assert.equal(fields.length, 1);
  assert.equal(fields[0].document.id, 'current');
  assert.equal(verifiedValue(fields, 'salary.taxable'), '1200000');
});

test('verified values conflict only when same-period documents disagree', () => {
  const fields = verifiedTaxFieldsForPeriod([
    document('one', 'TY2026-27', '1200000'), document('two', 'TY2026-27', '1250000'),
    document('pending', 'TY2026-27', '1300000', 'awaiting_confirmation'),
  ], 'TY2026-27');
  assert.deepEqual([...conflictingVerifiedFieldKeys(fields)], ['salary.taxable']);
  assert.equal(verifiedValue(fields, 'salary.taxable'), null);
});

test('unidentified or different-period documents cannot substantiate the selected tax period', () => {
  const unknown: TaxDocumentReviewRecord = { ...document('unknown', 'TY2026-27', '900000'), tax_year: null, assessment_year: null };
  assert.deepEqual(verifiedTaxFieldsForPeriod([unknown, document('prior', 'AY2025-26', '950000')], 'TY2026-27'), []);
});

test('exact ledger amount matching returns evidence options without classifying the credit', () => {
  const fields = verifiedTaxFieldsForPeriod([document('current', 'AY2026-27', '84000')], 'AY2026-27');
  assert.equal(exactLedgerAmountSourceOptions(8_400_000, fields).length, 1);
  assert.equal(exactLedgerAmountSourceOptions(8_400_001, fields).length, 0);
  assert.equal(exactLedgerAmountSourceOptions(Number.MAX_SAFE_INTEGER + 1, fields).length, 0);
});

test('tax profile source links include only period-verified fields exactly matching an input', () => {
  const records = [document('salary', 'TY2026-27', '1200000'), document('tds', 'TY2026-27', '84000')].map((item, index) => ({
    ...item, fields: [{ ...item.fields[0], field_key: index === 0 ? 'salary.gross' : 'tax.tds' }],
  }));
  const fields = verifiedTaxFieldsForPeriod(records, 'TY2026-27');
  assert.deepEqual(verifiedSourcesMatchingInputs(fields, { salary: '1200000', credits: '84000' }).map(({ field }) => field.field_key), ['salary.gross', 'tax.tds']);
  assert.deepEqual(verifiedSourcesMatchingInputs(fields, { salary: '1200001', credits: '84000' }).map(({ field }) => field.field_key), ['tax.tds']);
});

test('education-loan deduction source requires both the matching field category and exact amount', () => {
  const source = document('loan', 'AY2026-27', '220000');
  source.fields[0].field_key = 'deduction.education_loan_interest';
  const fields = verifiedTaxFieldsForPeriod([source], 'AY2026-27');
  assert.equal(verifiedSourcesMatchingInputs(fields, { educationLoanInterest: '220000' }).length, 1);
  assert.equal(verifiedSourcesMatchingInputs(fields, { educationLoanInterest: '220001' }).length, 0);
});

test('home-loan interest source requires the matching field category and exact amount', () => {
  const source = document('home', 'AY2026-27', '180000');
  source.fields[0].field_key = 'deduction.home_loan_interest';
  const fields = verifiedTaxFieldsForPeriod([source], 'AY2026-27');
  assert.equal(verifiedSourcesMatchingInputs(fields, { homeLoanInterest: '180000' }).length, 1);
  assert.equal(verifiedSourcesMatchingInputs(fields, { homeLoanInterest: '180001' }).length, 0);
});
