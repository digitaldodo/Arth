import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStatementTable, parseCsv, parseIndianAmount, parseIndianDate, tagDuplicates } from '../src/features/imports/statement-parser.js';

test('parses Indian date formats and INR amounts without floating point conversion', () => {
  assert.equal(parseIndianDate('31/10/2026'), '2026-10-31');
  assert.equal(parseIndianDate('2026-10-31'), '2026-10-31');
  assert.equal(parseIndianDate('7-Nov-26'), '2026-11-07');
  assert.deepEqual(parseIndianAmount('₹1,23,456.78'), { amount: '123456.78', amountPaise: 12345678 });
  assert.deepEqual(parseIndianAmount('(500.25)'), { amount: '-500.25', amountPaise: 50025 });
});

test('reads quoted CSV cells and recognizes debit and credit statement columns', () => {
  const table = parseCsv('Transaction Date,Narration,Debit,Credit,Balance,UTR\n31/10/2026,"UPI, SHOP",500.00,,10000.00,ABC1\n01/11/2026,Salary,,25000.00,35000.00,ABC2');
  const parsed = normalizeStatementTable(table, 'HDFC Bank statement');
  assert.equal(parsed.bank, 'HDFC Bank');
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].type, 'expense');
  assert.equal(parsed.rows[0].description, 'UPI, SHOP');
  assert.equal(parsed.rows[0].amountPaise, 50000);
  assert.equal(parsed.rows[1].type, 'income');
  assert.equal(parsed.rows[1].reference, 'ABC2');
});

test('marks exact existing ledger matches for review without silently dropping them', () => {
  const parsed = normalizeStatementTable([
    ['Date', 'Description', 'Debit', 'Credit'],
    ['01/11/2026', 'Coffee Shop', '250.00', ''],
    ['01/11/2026', 'Coffee Shop', '250.00', ''],
  ]);
  const rows = tagDuplicates(parsed.rows, [{ transaction_date: '2026-11-01', amount_paise: 25000, type: 'expense', description: 'Coffee Shop' }]);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.state === 'possible_duplicate' && !row.selected));
});

test('keeps identical statement rows visible but unselected for intentional duplicate review', () => {
  const parsed = normalizeStatementTable([
    ['Date', 'Description', 'Debit', 'Credit'],
    ['01/11/2026', 'COFFEE SHOP', '250.00', ''],
    ['01/11/2026', 'COFFEE SHOP', '250.00', ''],
  ]);
  const rows = tagDuplicates(parsed.rows, []);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.state === 'possible_duplicate' && !row.selected));
  assert.ok(rows.every((row) => /may still be separate events/.test(row.warning || '')));
});

test('duplicate flags do not erase extraction warnings or undo imported-row status', () => {
  const parsed = normalizeStatementTable([
    ['Date', 'Description', 'Debit', 'Credit'],
    ['01/11/2026', 'SELF TRANSFER', '250.00', ''],
    ['01/11/2026', 'SELF TRANSFER', '250.00', ''],
  ]);
  parsed.rows[0].state = 'imported';
  parsed.rows[1].state = 'ambiguous';
  parsed.rows[1].warning = 'Possible transfer needs manual classification.';
  const rows = tagDuplicates(parsed.rows, []);
  assert.equal(rows[0].state, 'imported');
  assert.equal(rows[1].state, 'ambiguous');
  assert.match(rows[1].warning || '', /Possible transfer needs manual classification/);
  assert.match(rows[1].warning || '', /may still be separate events/);
});

test('uses account identity and bank references when comparing imported rows', () => {
  const parsed = normalizeStatementTable([
    ['Date', 'Description', 'Debit', 'Credit', 'UTR'],
    ['01/11/2026', 'UPI COFFEE SHOP', '250.00', '', 'REF-001'],
  ]);
  const base = { transaction_date: '2026-11-01', amount_paise: 25000, type: 'expense', description: 'UPI COFFEE SHOP', statement_reference: 'REF-001' };
  assert.equal(tagDuplicates(parsed.rows, [{ ...base, account_id: 'account-a' }], 'account-a')[0].state, 'possible_duplicate');
  assert.equal(tagDuplicates(parsed.rows, [{ ...base, account_id: 'account-a' }], 'account-b')[0].state, 'new');
  assert.equal(tagDuplicates(parsed.rows, [{ ...base, account_id: 'account-a', amount_paise: 20000 }], 'account-a')[0].state, 'new');
});

test('keeps same-day purchases with conflicting bank references distinct', () => {
  const parsed = normalizeStatementTable([
    ['Date', 'Description', 'Debit', 'Credit', 'UTR'],
    ['01/11/2026', 'POS GROCERY STORE', '125.00', '', 'REF-001'],
    ['01/11/2026', 'POS GROCERY STORE', '125.00', '', 'REF-002'],
  ]);
  const rows = tagDuplicates(parsed.rows, [{ transaction_date: '2026-11-01', amount_paise: 12500,
    type: 'expense', description: 'POS GROCERY STORE', account_id: 'account-a', statement_reference: 'OLD-REF' }], 'account-a');
  assert.ok(rows.every((row) => row.state === 'new' && row.selected), 'different references are strong evidence that these are separate purchase events');
});

test('still flags identical rows for review when a reference is missing', () => {
  const parsed = normalizeStatementTable([
    ['Date', 'Description', 'Debit', 'Credit', 'UTR'],
    ['01/11/2026', 'POS GROCERY STORE', '125.00', '', 'REF-001'],
    ['01/11/2026', 'POS GROCERY STORE', '125.00', '', ''],
  ]);
  const rows = tagDuplicates(parsed.rows, []);
  assert.ok(rows.every((row) => row.state === 'possible_duplicate' && !row.selected));
});

test('handles zero-filled debit and credit columns without misclassifying the transaction', () => {
  const parsed = normalizeStatementTable([
    ['Date', 'Description', 'Debit', 'Credit'],
    ['01/11/2026', 'UPI purchase', '125.00', '0.00'],
    ['02/11/2026', 'Interest credit', '0.00', '7.25'],
    ['03/11/2026', 'Unclear correction', '10.00', '10.00'],
  ]);
  assert.equal(parsed.rows[0].type, 'expense');
  assert.equal(parsed.rows[0].amountPaise, 12500);
  assert.equal(parsed.rows[1].type, 'income');
  assert.equal(parsed.rows[1].amountPaise, 725);
  assert.equal(parsed.rows[2].state, 'ambiguous');
  assert.equal(parsed.rows[2].selected, false);
});

test('returns an explicit warning when statement headings cannot be matched', () => {
  const parsed = normalizeStatementTable([['A', 'B'], ['x', 'y']]);
  assert.equal(parsed.rows.length, 0);
  assert.ok(parsed.warnings.some((warning) => /Could not find/.test(warning)));
});

test('flags running balance mismatches and excludes transfers and refunds from ordinary imports', () => {
  const parsed = normalizeStatementTable([
    ['Date', 'Description', 'Debit', 'Credit', 'Balance'],
    ['01/11/2026', 'SHOP', '100.00', '', '900.00'],
    ['02/11/2026', 'SHOP', '200.00', '', '750.00'],
    ['03/11/2026', 'SELF TRANSFER TO OWN ACCOUNT', '', '5000.00', '5750.00'],
    ['04/11/2026', 'MERCHANT REFUND', '', '50.00', '5800.00'],
  ]);
  assert.equal(parsed.rows[1].state, 'needs_review');
  assert.equal(parsed.rows[2].state, 'ambiguous');
  assert.equal(parsed.rows[2].selected, false);
  assert.equal(parsed.rows[3].state, 'ambiguous');
  assert.equal(parsed.rows[3].selected, false);
});

test('infers statement opening and closing balances exactly from running-balance rows', () => {
  const parsed = normalizeStatementTable([
    ['Date', 'Description', 'Debit', 'Credit', 'Balance'],
    ['01/11/2026', 'GROCERY', '100.00', '', '9,000.00'],
    ['02/11/2026', 'BUS FARE', '50.00', '', '8,950.00'],
    ['03/11/2026', 'INTEREST', '', '1.25', '8,951.25'],
  ]);
  assert.equal(parsed.openingBalancePaise, '910000');
  assert.equal(parsed.closingBalancePaise, '895125');
  assert.ok(parsed.rows.every((row) => row.state === 'new'));
});

test('bank adapter registry parses synthetic header fixtures for the nine requested Indian banks', () => {
  const fixtures: Array<{ marker: string; headers: string[] }> = [
    { marker: 'SBI', headers: ['Txn Date', 'Description', 'Debit', 'Credit', 'Balance', 'Ref No'] },
    { marker: 'HDFC Bank', headers: ['Date', 'Narration', 'Withdrawal Amt', 'Deposit Amt', 'Closing Balance', 'Chq Ref No'] },
    { marker: 'ICICI Bank', headers: ['Transaction Date', 'Transaction Remarks', 'Withdrawal Amount', 'Deposit Amount', 'Balance', 'Cheque Number'] },
    { marker: 'Axis Bank', headers: ['Tran Date', 'Particulars', 'Debit', 'Credit', 'Balance', 'Chq No'] },
    { marker: 'Kotak Mahindra', headers: ['Date', 'Description', 'Withdrawal (Dr)', 'Deposit (Cr)', 'Balance', 'Chq Ref No'] },
    { marker: 'PNB', headers: ['Transaction Date', 'Description', 'Withdrawals', 'Deposits', 'Balance', 'Cheque Number'] },
    { marker: 'Bank of Baroda', headers: ['Post Date', 'Details', 'Debit', 'Credit', 'Balance', 'Chq Ref Number'] },
    { marker: 'Canara Bank', headers: ['Tran Date', 'Particulars', 'Debit', 'Credit', 'Balance', 'Cheque No'] },
    { marker: 'IDFC FIRST Bank', headers: ['Transaction Date', 'Particulars', 'Debit', 'Credit', 'Balance', 'Reference Number'] },
  ];
  for (const fixture of fixtures) {
    const parsed = normalizeStatementTable([
      fixture.headers,
      ['01/11/2026', 'Synthetic grocery payment', '125.50', '', '874.50', 'REF123'],
    ], fixture.marker);
    assert.equal(parsed.rows.length, 1, fixture.marker);
    assert.equal(parsed.rows[0].amountPaise, 12550, fixture.marker);
    assert.equal(parsed.rows[0].type, 'expense', fixture.marker);
    assert.notEqual(parsed.adapterId, 'generic', fixture.marker);
    assert.equal(parsed.adapterValidation, 'synthetic_fixture', fixture.marker);
  }
});

test('preserves value dates, joins multi-line narration and skips repeated page headers', () => {
  const headers = ['Transaction Date', 'Value Date', 'Description', 'Debit', 'Credit', 'Balance'];
  const parsed = normalizeStatementTable([
    headers,
    ['31/10/2026', '01/11/2026', 'NEFT PAYMENT', '100.00', '', '900.00'],
    ['', '', 'CONTINUED BENEFICIARY DETAILS', '', '', ''],
    headers,
    ['02/11/2026', '03/11/2026', 'INTEREST CREDIT', '', '5.00', '905.00'],
  ], 'HDFC Bank');
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].valueDate, '2026-11-01');
  assert.match(parsed.rows[0].description, /CONTINUED BENEFICIARY DETAILS/);
  assert.equal(parsed.rows[1].valueDate, '2026-11-03');
  assert.deepEqual(parsed.warnings, []);
});

test('manual column mapping recovers an unfamiliar statement layout locally', () => {
  const table = [
    ['Details', 'Bank Ref', 'Booked', 'Value Day', 'Outflow', 'Inflow', 'Available'],
    ['UPI MARKET', 'UTR-77', '04/11/2026', '05/11/2026', '340.25', '', '9,659.75'],
  ];
  const automatic = normalizeStatementTable(table, 'Unrecognized statement');
  assert.equal(automatic.rows.length, 0);
  assert.equal(automatic.mappingRequired, true);
  const mapped = normalizeStatementTable(table, 'Unrecognized statement', {
    headerIndex: 0, date: 2, valueDate: 3, description: 0, debit: 4, credit: 5,
    amount: null, type: null, reference: 1, balance: 6,
  });
  assert.equal(mapped.rows.length, 1);
  assert.equal(mapped.rows[0].type, 'expense');
  assert.equal(mapped.rows[0].amountPaise, 34_025);
  assert.equal(mapped.rows[0].valueDate, '2026-11-05');
  assert.equal(mapped.rows[0].reference, 'UTR-77');
});
