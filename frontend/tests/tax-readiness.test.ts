import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveTaxReadiness } from '../src/features/tax/tax-readiness.js';

const document = (id: string, documentType: string, period: string, fields: Array<{ field_key: string; value: string; status?: string }>) => ({
  id, display_name: `${id}.pdf`, document_type: documentType, tax_year: period, assessment_year: period.startsWith('AY') ? period : null,
  fields: fields.map((field, index) => ({ id: `${id}-${index}`, field_key: field.field_key, field_value: { value: field.value }, verification_status: field.status || 'verified' })),
});

test('readiness marks period-matched verified salary and TDS evidence only', () => {
  const result = deriveTaxReadiness({ period: 'AY2026-27', documents: [
    document('current', 'form16', 'AY2026-27', [
      { field_key: 'salary.gross', value: '1200000' }, { field_key: 'tax.tds', value: '50000' },
    ]),
    document('prior', 'form16', 'AY2025-26', [{ field_key: 'salary.gross', value: '1000000' }]),
  ], ledgerLoaded: false, ledgerComplete: false, ledgerReviews: [], comparisonComplete: false });
  assert.equal(result.find((item) => item.id === 'salary')?.complete, true);
  assert.equal(result.find((item) => item.id === 'tds')?.complete, true);
  assert.equal(result.find((item) => item.id === 'comparison')?.complete, false);
});

test('ledger readiness requires a complete period load and a disposition for every credit', () => {
  const base = { period: 'TY2026-27', documents: [], comparisonComplete: false };
  const incomplete = deriveTaxReadiness({ ...base, ledgerLoaded: true, ledgerComplete: false, ledgerReviews: [{ review: 'salary' }] });
  assert.equal(incomplete.find((item) => item.id === 'other_income')?.complete, false);
  const reviewed = deriveTaxReadiness({ ...base, ledgerLoaded: true, ledgerComplete: true, ledgerReviews: [{ review: 'salary' }, { review: 'refund' }] });
  assert.equal(reviewed.find((item) => item.id === 'other_income')?.complete, true);
  const pending = deriveTaxReadiness({ ...base, ledgerLoaded: true, ledgerComplete: true, ledgerReviews: [{ review: 'salary' }, { review: 'unsure' }] });
  assert.equal(pending.find((item) => item.id === 'other_income')?.complete, false);
});

test('pending deduction candidates and unreconciled AIS fields stay outstanding', () => {
  const result = deriveTaxReadiness({ period: 'AY2026-27', documents: [
    document('ais', 'ais', 'AY2026-27', [{ field_key: 'tax.credit', value: '10000', status: 'awaiting_confirmation' }]),
    document('investment', 'ppf', 'AY2026-27', [
      { field_key: 'deduction.section_80d', value: '25000' },
      { field_key: 'deduction.section_80c', value: '50000', status: 'conflicting' },
    ]),
  ], ledgerLoaded: false, ledgerComplete: false, ledgerReviews: [], comparisonComplete: false });
  assert.equal(result.find((item) => item.id === 'tax_statements')?.complete, false);
  assert.equal(result.find((item) => item.id === 'deductions')?.complete, false);
});
