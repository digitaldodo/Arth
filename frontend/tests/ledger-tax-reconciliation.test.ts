import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hintLedgerCredit, safeLedgerDescription, taxYearDateRange } from '../src/features/tax/ledger-tax-reconciliation';

test('tax-year ledger ranges map assessment years to the prior financial year', () => {
  assert.deepEqual(taxYearDateRange('AY2026-27'), { start: '2025-04-01', end: '2026-03-31' });
  assert.deepEqual(taxYearDateRange('TY2026-27'), { start: '2026-04-01', end: '2027-03-31' });
  assert.equal(taxYearDateRange('AY2026'), null);
});

test('ledger narration creates a review hint and does not classify ambiguous credits as income', () => {
  assert.equal(hintLedgerCredit('SALARY APR'), 'possible_salary');
  assert.equal(hintLedgerCredit('INT PAID FD'), 'possible_interest');
  assert.equal(hintLedgerCredit('UPI REFUND'), 'possible_refund');
  assert.equal(hintLedgerCredit('NEFT from unknown sender'), 'review');
});

test('ledger descriptions redact PAN and long digit identifiers before tax-profile persistence', () => {
  assert.equal(safeLedgerDescription('HDFC  ABCDE1234F  123456789012'), 'HDFC [PAN] [account/reference]');
  assert.equal(safeLedgerDescription(null), '');
});
