import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStatementTable, parseCsv, tagDuplicates } from '../src/features/imports/statement-parser.js';
import { ALL_BANK_FIXTURES } from './fixtures/statement-fixtures.js';
import { STATEMENT_ADAPTERS } from '../src/features/imports/statement-adapters.js';

describe('Statement Bank Adapters & Representative Fixtures Benchmark', () => {
  for (const fixture of ALL_BANK_FIXTURES) {
    test(`Parses ${fixture.name} with exact dates, paise amounts, and running balances`, () => {
      const table = typeof fixture.content === 'string' ? parseCsv(fixture.content) : fixture.content;
      const parsed = normalizeStatementTable(table, fixture.name);

      assert.equal(parsed.adapterId, fixture.adapterId, `Adapter for ${fixture.name} must be detected as ${fixture.adapterId}`);
      assert.equal(parsed.rows.length, fixture.expected.rowCount, `Row count for ${fixture.name} must match fixture`);

      // Verify first row details
      const firstRow = parsed.rows[0];
      assert.equal(firstRow.date, fixture.expected.firstRowDate, 'First row date must be exact');
      assert.equal(firstRow.amountPaise, fixture.expected.firstRowAmountPaise, 'First row paise amount must be exact');
      assert.equal(firstRow.type, fixture.expected.firstRowType, 'First row debit/credit direction must match');
      if (fixture.expected.firstRowReference !== undefined) {
        assert.equal(firstRow.reference, fixture.expected.firstRowReference, 'First row reference must match');
      }

      // Verify opening and closing balance
      assert.equal(parsed.openingBalancePaise, fixture.expected.openingBalancePaise, 'Opening balance must match expected');
      assert.equal(parsed.closingBalancePaise, fixture.expected.closingBalancePaise, 'Closing balance must match expected');

      // Verify summary metrics
      assert.ok(parsed.summary, 'Summary must be computed');
      assert.equal(parsed.summary?.totalDebitsPaise, fixture.expected.totalDebitsPaise, 'Total debits paise must match');
      assert.equal(parsed.summary?.totalCreditsPaise, fixture.expected.totalCreditsPaise, 'Total credits paise must match');
      assert.equal(parsed.summary?.isReconciled, true, 'Balance must reconcile completely with zero difference');
      assert.equal(parsed.summary?.reconciliationDifferencePaise, '0', 'Reconciliation difference must be 0 paise');
    });
  }

  test('Statement adapter registry manifests match registered adapters', () => {
    assert.ok(STATEMENT_ADAPTERS.length >= 11, 'Must register priority banks + credit card + generic adapter');
    for (const adapter of STATEMENT_ADAPTERS) {
      assert.ok(adapter.id, 'Adapter must have an id');
      assert.ok(adapter.bank, 'Adapter must have a bank name');
      assert.ok(adapter.supportedFormats.length > 0, 'Adapter must declare supported formats');
      assert.ok(['bank', 'credit_card'].includes(adapter.accountType), 'Account type must be valid');
    }
  });

  test('Credit card liability direction convention is correctly calculated', () => {
    const cardContent = `Credit Card Statement - Account ending ••••1234
Date,Description,Amount,Type,Balance
01/10/2026,E-COMMERCE PURCHASE,5000.00,DR,5000.00
05/10/2026,RESTAURANT DINE-IN,2000.00,DR,7000.00
10/10/2026,PAYMENT RECEIVED - THANK YOU,7000.00,CR,0.00`;
    const parsed = normalizeStatementTable(parseCsv(cardContent), 'Credit Card Statement');
    assert.equal(parsed.adapterId, 'credit_card_generic');
    assert.equal(parsed.rows.length, 3);
    assert.equal(parsed.summary?.isReconciled, true);
    assert.equal(parsed.summary?.reconciliationDifferencePaise, '0');
  });

  test('Adversarial fixture: preserves separate identical purchases when references differ', () => {
    const content = `Date,Narration,Ref No,Withdrawal Amt,Deposit Amt,Closing Balance
01/11/2026,POS GROCERY STORE,REF-A-001,500.00,,9500.00
01/11/2026,POS GROCERY STORE,REF-A-002,500.00,,9000.00`;
    const parsed = normalizeStatementTable(parseCsv(content), 'HDFC Bank');
    const tagged = tagDuplicates(parsed.rows, []);
    assert.equal(tagged.length, 2);
    assert.ok(tagged.every((row) => row.state === 'new' && row.selected), 'Separate purchases with different references must remain individually selected');
  });

  test('Adversarial fixture: flags identical purchases for review when references are missing', () => {
    const content = `Date,Narration,Ref No,Withdrawal Amt,Deposit Amt,Closing Balance
01/11/2026,POS GROCERY STORE,,500.00,,9500.00
01/11/2026,POS GROCERY STORE,,500.00,,9000.00`;
    const parsed = normalizeStatementTable(parseCsv(content), 'HDFC Bank');
    const tagged = tagDuplicates(parsed.rows, []);
    assert.equal(tagged.length, 2);
    assert.ok(tagged.every((row) => row.state === 'possible_duplicate' && !row.selected), 'Identical purchases without references must be unselected for review');
  });
});
