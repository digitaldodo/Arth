import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeStatementTable,
  parseIndianAmount,
  parseIndianDate,
  parseCsv,
  extractTableFromPdfItems,
  tagDuplicates,
  isStatementMetadataOrSummary,
} from '../src/features/imports/statement-parser.js';
import {
  merchantFingerprint,
  normalizeNarration,
  suggestCategory,
} from '../src/features/categorization/pipeline.js';
import { assessPossibleDuplicate } from '../src/features/categorization/duplicates.js';
import { findReconciliationCandidates } from '../src/features/imports/reconciliation.js';

test('1. Missing description: row with date and amount but no description cell (sparse or short array)', () => {
  const table = [
    ['Date', 'Narration', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance'],
    ['15/11/2026'], // Row shorter than descCol (descCol = 1)
    ['16/11/2026', undefined, '500.00', '', '10000.00'], // Undefined in descCol
    ['17/11/2026', null, '300.00', '', '9700.00'], // Null in descCol
  ];

  const result = normalizeStatementTable(table as unknown[][], 'HDFC Bank Statement');
  // Row 1 is skipped (no amount/narration)
  // Rows 2 & 3 have date & amount but missing description: must be safely parsed as 'Unspecified Transaction'
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].description, 'Unspecified Transaction');
  assert.equal(result.rows[0].classification, 'needs_review');
  assert.equal(result.rows[0].state, 'needs_review');
  assert.equal(result.rows[0].selected, false);
  assert.equal(result.rows[0].exclusionReason, 'Missing transaction description');

  assert.equal(result.rows[1].description, 'Unspecified Transaction');
  assert.equal(result.rows[1].classification, 'needs_review');
  assert.equal(result.rows[1].state, 'needs_review');
});

test('2. Null description: row with explicit null description', () => {
  const table = [
    ['Date', 'Narration', 'Debit', 'Credit', 'Balance'],
    ['15/11/2026', null, '1200.00', '', '25000.00'],
  ];
  const result = normalizeStatementTable(table as unknown[][], 'Generic Statement');
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].description, 'Unspecified Transaction');
  assert.equal(result.rows[0].amountPaise, 120000);
});

test('3. Empty description: row with empty string description', () => {
  const table = [
    ['Date', 'Narration', 'Debit', 'Credit', 'Balance'],
    ['15/11/2026', '   ', '450.00', '', '15000.00'],
  ];
  const result = normalizeStatementTable(table, 'Generic Statement');
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].description, 'Unspecified Transaction');
  assert.equal(result.rows[0].amountPaise, 45000);
});

test('4. Missing reference number: row without reference or nullish reference', () => {
  const table = [
    ['Date', 'Narration', 'Debit', 'Credit', 'Ref No', 'Balance'],
    ['15/11/2026', 'Grocery Store Purchase', '950.00', '', undefined, '14050.00'],
    ['16/11/2026', 'Cafe Coffee Day', '250.00', '', null, '13800.00'],
    ['17/11/2026', 'Medical Shop', '120.00', '', '', '13680.00'],
  ];
  const result = normalizeStatementTable(table as unknown[][], 'Generic Statement');
  assert.equal(result.rows.length, 3);
  assert.equal(result.rows[0].reference, null);
  assert.equal(result.rows[1].reference, null);
  assert.equal(result.rows[2].reference, null);
});

test('5. Empty debit column: credit-only transactions with debit empty, null, or undefined', () => {
  const table = [
    ['Date', 'Narration', 'Debit', 'Credit', 'Balance'],
    ['15/11/2026', 'Client Invoice Payment', '', '50000.00', '63680.00'],
    ['16/11/2026', 'Cashback Credited', null, '100.00', '63780.00'],
    ['17/11/2026', 'Refund Amazon', undefined, '499.00', '64279.00'],
  ];
  const result = normalizeStatementTable(table as unknown[][], 'Generic Statement');
  assert.equal(result.rows.length, 3);
  assert.equal(result.rows[0].type, 'income');
  assert.equal(result.rows[0].amountPaise, 5000000);
  assert.equal(result.rows[1].type, 'income');
  assert.equal(result.rows[1].amountPaise, 10000);
  assert.equal(result.rows[2].type, 'income');
  assert.equal(result.rows[2].amountPaise, 49900);
});

test('6. Empty credit column: debit-only transactions with credit empty, null, or undefined', () => {
  const table = [
    ['Date', 'Narration', 'Debit', 'Credit', 'Balance'],
    ['15/11/2026', 'Electricity Bill', '2300.00', '', '61979.00'],
    ['16/11/2026', 'Internet Broadband', '1180.00', null, '60799.00'],
    ['17/11/2026', 'Fuel Petrol Pump', '1500.00', undefined, '59299.00'],
  ];
  const result = normalizeStatementTable(table as unknown[][], 'Generic Statement');
  assert.equal(result.rows.length, 3);
  assert.equal(result.rows[0].type, 'expense');
  assert.equal(result.rows[0].amountPaise, 230000);
  assert.equal(result.rows[1].type, 'expense');
  assert.equal(result.rows[1].amountPaise, 118000);
  assert.equal(result.rows[2].type, 'expense');
  assert.equal(result.rows[2].amountPaise, 150000);
});

test('7. Missing optional balance: rows with absent, null, or non-numeric balance', () => {
  const table = [
    ['Date', 'Narration', 'Debit', 'Credit'],
    ['15/11/2026', 'Uber Ride', '340.00', ''],
    ['16/11/2026', 'Zomato Food', '520.00', ''],
  ];
  const result = normalizeStatementTable(table, 'Generic Statement');
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].balance, null);
  assert.equal(result.rows[1].balance, null);
});

test('8. Numeric Excel cells: numbers passed for amounts, dates, and references', () => {
  const table = [
    ['Date', 'Narration', 'Debit', 'Credit', 'Ref No', 'Balance'],
    ['15/11/2026', 'Hardware Store', 1450.5, null, 9876543210, 50000],
    ['16/11/2026', 'Interest Credit', null, 250.75, 1122334455, 50250.75],
  ];
  const result = normalizeStatementTable(table as unknown[][], 'Generic Statement');
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].amount, '1450.50');
  assert.equal(result.rows[0].amountPaise, 145050);
  assert.equal(result.rows[0].reference, '9876543210');

  assert.equal(result.rows[1].amount, '250.75');
  assert.equal(result.rows[1].amountPaise, 25075);
  assert.equal(result.rows[1].reference, '1122334455');
});

test('9. Blank spreadsheet rows: empty arrays, sparse holes, and arrays of nulls', () => {
  const table = [
    ['Date', 'Narration', 'Debit', 'Credit', 'Balance'],
    [],
    [null, undefined, '', '   ', null],
    new Array(10), // Sparse array hole
    ['15/11/2026', 'Valid Transaction', '600.00', '', '49400.00'],
    [],
    ['16/11/2026', 'Another Transaction', '400.00', '', '49000.00'],
  ];
  const result = normalizeStatementTable(table as unknown[][], 'Generic Statement');
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].description, 'Valid Transaction');
  assert.equal(result.rows[1].description, 'Another Transaction');
});

test('10. Multi-line PDF narrations without date: continuation text appended safely', () => {
  const table = [
    ['Date', 'Narration', 'Debit', 'Credit', 'Balance'],
    ['15/11/2026', 'UPI-SWIGGY-BANGALORE-ORDER456', '380.00', '', '48620.00'],
    ['', 'REF: UPI/CR/998877665544/PAYMENT TO SWIGGY', '', '', ''],
    ['16/11/2026', 'NETFLIX SUBSCRIPTION', '649.00', '', '47971.00'],
  ];
  const result = normalizeStatementTable(table, 'Generic Statement');
  assert.equal(result.rows.length, 2);
  assert.match(result.rows[0].description, /SWIGGY.*REF: UPI\/CR\/998877665544/);
  assert.equal(result.rows[0].reference, '998877665544');
});

test('11. Repeated page headers: table header row appearing on page breaks', () => {
  const table = [
    ['Date', 'Narration', 'Debit', 'Credit', 'Balance'],
    ['15/11/2026', 'Transaction Page 1', '100.00', '', '47871.00'],
    ['Date', 'Narration', 'Debit', 'Credit', 'Balance'], // Repeated header
    ['16/11/2026', 'Transaction Page 2', '200.00', '', '47671.00'],
  ];
  const result = normalizeStatementTable(table, 'Generic Statement');
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].description, 'Transaction Page 1');
  assert.equal(result.rows[1].description, 'Transaction Page 2');
});

test('12. Missing category: transactions with absent category column or empty category', () => {
  const table = [
    ['Date', 'Narration', 'Debit', 'Credit', 'Category', 'Balance'],
    ['15/11/2026', 'Unknown Merchant 1', '150.00', '', '', '47521.00'],
    ['16/11/2026', 'Unknown Merchant 2', '250.00', '', null, '47271.00'],
    ['17/11/2026', 'Food Stall', '350.00', '', undefined, '46921.00'],
  ];
  const result = normalizeStatementTable(table as unknown[][], 'Generic Statement');
  assert.equal(result.rows.length, 3);
  assert.equal(result.rows[0].categoryId, '');
  assert.equal(result.rows[1].categoryId, '');
  assert.equal(result.rows[2].categoryId, '');
});

test('13. Missing necessity: transactions with absent necessity column or empty necessity', () => {
  const table = [
    ['Date', 'Narration', 'Debit', 'Credit', 'Necessity', 'Balance'],
    ['15/11/2026', 'Groceries', '1200.00', '', '', '45721.00'],
    ['16/11/2026', 'Movie Tickets', '600.00', '', null, '45121.00'],
    ['17/11/2026', 'Salary Income', '', '80000.00', 'essential', '125121.00'], // Income never has necessity
  ];
  const result = normalizeStatementTable(table as unknown[][], 'Generic Statement');
  assert.equal(result.rows.length, 3);
  assert.equal(result.rows[0].necessity, null);
  assert.equal(result.rows[1].necessity, null);
  assert.equal(result.rows[2].necessity, null, 'Income row must never have necessity');
});

test('14. Valid debit/credit with absent optional metadata', () => {
  // Only date, narration, debit
  const table = [
    ['Date', 'Narration', 'Debit'],
    ['15/11/2026', 'Simple Tea Shop', '20.00'],
  ];
  const result = normalizeStatementTable(table, 'Generic Statement');
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].date, '2026-11-15');
  assert.equal(result.rows[0].description, 'Simple Tea Shop');
  assert.equal(result.rows[0].amountPaise, 2000);
  assert.equal(result.rows[0].reference, null);
  assert.equal(result.rows[0].valueDate, null);
  assert.equal(result.rows[0].balance, null);
});

test('15. Invalid transaction rows: rejected safely without throwing runtime errors', () => {
  const table = [
    ['Date', 'Narration', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance'],
    ['Page 1 of 3'], // Metadata single-column row (the original bug trigger!)
    ['Statement of Account for Period 01/11/2026 to 30/11/2026'],
    ['Opening Balance: 50,000.00'],
    ['Invalid Date Format', 'Some Description', '100.00', '', '50100.00'], // Bad date
    ['15/11/2026', 'Zero Amount Row', '0.00', '0.00', '50000.00'], // Zero amount -> skipped
    ['15/11/2026', 'Dashes in Amount', '-', '-', '50000.00'], // Non-numeric dash -> skipped
    ['15/11/2026', 'Total Withdrawal: 25,000.00', '25000.00', '', '25000.00'], // Summary row -> skipped
    ['Closing Balance: 25,000.00'],
    ['End of Statement'],
  ];
  const result = normalizeStatementTable(table, 'HDFC Bank Statement');
  // None of the metadata or zero rows should be auto-selected for import
  assert.equal(result.rows.filter((r) => r.selected).length, 0);
  // Bad date row is preserved for manual user review/correction (Priority 8 & Priority 1 non-discard rule)
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].state, 'needs_review');
  assert.equal(result.rows[0].classification, 'extraction_problem');
  assert.ok(result.warnings.length > 0);
});

test('16. Helper robustness: parseIndianAmount handles nullish, empty, and numeric types safely', () => {
  assert.throws(() => parseIndianAmount(undefined), /Amount is not a valid INR value/);
  assert.throws(() => parseIndianAmount(null), /Amount is not a valid INR value/);
  assert.throws(() => parseIndianAmount(''), /Amount is not a valid INR value/);
  assert.throws(() => parseIndianAmount('   '), /Amount is not a valid INR value/);

  // Numbers (from XLSX)
  const numResult = parseIndianAmount(1234.56);
  assert.equal(numResult.amount, '1234.56');
  assert.equal(numResult.amountPaise, 123456);

  const negNumResult = parseIndianAmount(-99.9);
  assert.equal(negNumResult.amount, '-99.90');
  assert.equal(negNumResult.amountPaise, 9990);
});

test('17. Helper robustness: parseIndianDate handles nullish, Date objects, and formats safely', () => {
  assert.throws(() => parseIndianDate(undefined), /Date value is missing or empty/);
  assert.throws(() => parseIndianDate(null), /Date value is missing or empty/);
  assert.throws(() => parseIndianDate(''), /Date value is missing or empty/);

  const jsDate = new Date(Date.UTC(2026, 10, 15));
  assert.equal(parseIndianDate(jsDate), '2026-11-15');

  assert.equal(parseIndianDate('15/11/2026'), '2026-11-15');
  assert.equal(parseIndianDate('15-Nov-2026'), '2026-11-15');
  assert.equal(parseIndianDate('2026-11-15 14:30:00'), '2026-11-15');
});

test('18. Helper robustness: isStatementMetadataOrSummary handles nullish and primitive types', () => {
  assert.equal(isStatementMetadataOrSummary(undefined), false);
  assert.equal(isStatementMetadataOrSummary(null), false);
  assert.equal(isStatementMetadataOrSummary(''), false);
  assert.equal(isStatementMetadataOrSummary('   '), false);
  assert.equal(isStatementMetadataOrSummary('Opening Balance: 10,000'), true);
  assert.equal(isStatementMetadataOrSummary('Page 2 of 5'), true);
});

test('19. Categorization robustness: normalizeNarration & merchantFingerprint handle nullish safely', () => {
  assert.equal(normalizeNarration(undefined), '');
  assert.equal(normalizeNarration(null), '');
  assert.equal(normalizeNarration(''), '');
  assert.equal(normalizeNarration('SWIGGY BANGALORE'), 'swiggy bangalore');

  assert.equal(merchantFingerprint(undefined), '');
  assert.equal(merchantFingerprint(null), '');
  assert.equal(merchantFingerprint(''), '');
  assert.equal(merchantFingerprint('SWIGGY 12345 BANGALORE'), 'swiggy bangalore');

  const suggestion = suggestCategory(undefined as unknown as string, [], 'expense');
  assert.equal(suggestion, null);
});

test('20. Duplicate and reconciliation detection robustness with nullish fields', () => {
  const duplicateAssessment = assessPossibleDuplicate({
    date: '2026-11-15',
    amountPaise: 50000,
    type: 'expense',
    description: null,
    reference: null,
  }, [
    {
      transaction_date: '2026-11-15',
      amount_paise: 50000,
      type: 'expense',
      description: null,
      statement_reference: null,
    },
  ]);
  assert.equal(typeof duplicateAssessment.possibleDuplicate, 'boolean');

  const reconciliationCandidates = findReconciliationCandidates([
    {
      id: 'tx-1',
      transaction_date: '2026-11-15',
      amount_paise: 50000,
      type: 'expense',
      description: null,
      account_id: 'acc-1',
      statement_reference: null,
    },
  ], [
    { id: 'acc-1', name: 'Checking', account_type: 'bank' },
  ], new Set());
  assert.equal(reconciliationCandidates.length, 0);
});

test('21. Spatial PDF table extractor robustness with sparse and malformed text items', () => {
  const pages = [
    [],
    [
      { text: '', x: 0, y: 0 },
      { text: '   ', x: 10, y: 0 },
      { text: undefined as unknown as string, x: 20, y: 0 },
    ],
    [
      { text: 'Date', x: 10, y: 100 },
      { text: 'Narration', x: 100, y: 100 },
      { text: 'Debit', x: 250, y: 100 },
    ],
  ];
  const table = extractTableFromPdfItems(pages);
  assert.ok(Array.isArray(table));
  assert.equal(table.length, 1);
  assert.deepEqual(table[0], ['Date', 'Narration', 'Debit']);
});
