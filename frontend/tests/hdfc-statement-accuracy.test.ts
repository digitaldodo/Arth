import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractTableFromPdfItems,
  isStatementMetadataOrSummary,
  normalizeStatementTable,
  type PdfTextItem,
} from '../src/features/imports/statement-parser.js';

test('1. Balance Ingestion Defense: Opening, Closing, and Summary Balances are NEVER imported as transactions', () => {
  // Typical HDFC / Indian bank statement table with opening and closing balance rows
  const rawTable = [
    ['Date', 'Narration', 'Chq./Ref.No.', 'Value Dt', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance'],
    ['', 'OPENING BALANCE BROUGHT FORWARD', '', '', '', '', '1,50,250.75'],
    ['10/11/2026', 'UPI-SWIGGY-123456-BANGALORE', 'UPI-123456', '10/11/2026', '450.00', '', '1,49,800.75'],
    ['11/11/2026', 'NEFT CR-ACME CORP-SALARY-NOV', 'NEFT-998877', '11/11/2026', '', '85,000.00', '2,34,800.75'],
    ['', 'TOTAL WITHDRAWALS / DEPOSITS', '', '', '450.00', '85,000.00', ''],
    ['', 'CLOSING BALANCE CARRIED FORWARD', '', '', '', '', '2,34,800.75'],
  ];

  const parsed = normalizeStatementTable(rawTable, 'HDFC Bank Account Statement');

  // Verify only the 2 actual transactions are parsed
  assert.equal(parsed.rows.length, 2, 'Must extract exactly 2 genuine transactions, skipping opening/closing/summary balances');

  // Verify statement balances were extracted for reconciliation, not as transactions
  assert.equal(parsed.openingBalancePaise, '15025075', 'Opening balance paise must be 1,50,250.75');
  assert.equal(parsed.closingBalancePaise, '23480075', 'Closing balance paise must be 2,34,800.75');

  // Verify Swiggy transaction
  const swiggy = parsed.rows[0];
  assert.equal(swiggy.date, '2026-11-10');
  assert.equal(swiggy.type, 'expense');
  assert.equal(swiggy.amount, '450.00');
  assert.equal(swiggy.amountPaise, 45000);
  assert.equal(swiggy.balance, '1,49,800.75');

  // Verify Salary transaction
  const salary = parsed.rows[1];
  assert.equal(salary.date, '2026-11-11');
  assert.equal(salary.type, 'income');
  assert.equal(salary.amount, '85000.00');
  assert.equal(salary.amountPaise, 8500000);
  assert.equal(salary.balance, '2,34,800.75');

  // Verify reconciliation math
  assert.equal(parsed.isReconciled, true, 'Statement math must reconcile: 150250.75 + 85000 - 450 = 234800.75');
});

test('2. Strict Debit and Credit Column Disambiguation without Floating Point Errors', () => {
  const rawTable = [
    ['Date', 'Narration', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance'],
    ['01/11/2026', 'POS PURCHASE RELIANCE RETAIL', '1,299.50', '', '48,700.50'],
    ['02/11/2026', 'IMPS INWARD RRN 66554433', '', '5,000.00', '53,700.50'],
    ['03/11/2026', 'ZERO DEBIT TEST', '0.00', '', '53,700.50'],
  ];

  const parsed = normalizeStatementTable(rawTable, 'HDFC Bank Statement');

  // Row 0: Withdrawal present, Deposit empty -> expense
  assert.equal(parsed.rows[0].type, 'expense');
  assert.equal(parsed.rows[0].amountPaise, 129950);
  assert.equal(parsed.rows[0].amount, '1299.50');

  // Row 1: Deposit present, Withdrawal empty -> income
  assert.equal(parsed.rows[1].type, 'income');
  assert.equal(parsed.rows[1].amountPaise, 500000);
  assert.equal(parsed.rows[1].amount, '5000.00');

  // Row 2: 0.00 withdrawal should be ignored as non-movement
  assert.equal(parsed.rows.length, 2, 'Zero amount entries must not become transactions');
});

test('3. Spatial Table Extractor: Prevents Column Shift from Missing Cells', () => {
  // Simulate PDF items where Withdrawal is empty and Closing Balance has high X coordinate
  // In a naive text-split, "5,000.00" might shift to Withdrawal and "55,000.00" to Deposit!
  // Spatial bounding boxes anchor columns by coordinate:
  // Date: x=50, Narration: x=120, ChqRef: x=250, ValueDt: x=320, Withdrawal: x=390, Deposit: x=460, Balance: x=530
  const headerPage: PdfTextItem[] = [
    { text: 'Date', x: 50, y: 700, width: 30 },
    { text: 'Narration', x: 120, y: 700, width: 60 },
    { text: 'Chq./Ref.No.', x: 250, y: 700, width: 50 },
    { text: 'Value Dt', x: 320, y: 700, width: 40 },
    { text: 'Withdrawal Amt.', x: 390, y: 700, width: 60 },
    { text: 'Deposit Amt.', x: 460, y: 700, width: 50 },
    { text: 'Closing Balance', x: 530, y: 700, width: 60 },
    // Row 1: Expense (Deposit empty)
    { text: '05/11/2026', x: 50, y: 670, width: 50 },
    { text: 'AMAZON PAY INDIA', x: 120, y: 670, width: 90 },
    { text: 'REF112233', x: 250, y: 670, width: 50 },
    { text: '05/11/2026', x: 320, y: 670, width: 50 },
    { text: '799.00', x: 400, y: 670, width: 40 }, // In Withdrawal column (x ≈ 390-460)
    { text: '49,201.00', x: 540, y: 670, width: 50 }, // In Closing Balance column (x ≈ 530+)
    // Row 2: Income (Withdrawal empty!) Naive split would put 10,000 in Withdrawal and 59,201 in Deposit!
    { text: '06/11/2026', x: 50, y: 640, width: 50 },
    { text: 'DIVIDEND CREDIT TCS', x: 120, y: 640, width: 100 },
    { text: 'DIV9988', x: 250, y: 640, width: 40 },
    { text: '06/11/2026', x: 320, y: 640, width: 50 },
    { text: '10,000.00', x: 470, y: 640, width: 50 }, // In Deposit column (x ≈ 460-530)
    { text: '59,201.00', x: 540, y: 640, width: 50 }, // In Closing Balance column (x ≈ 530+)
  ];

  const extractedTable = extractTableFromPdfItems([headerPage]);
  assert.equal(extractedTable.length, 3, 'Must extract header + 2 data rows');

  // Verify Row 2 (Income): column 4 (Withdrawal) is empty, column 5 (Deposit) has 10,000.00
  const incomeRowCells = extractedTable[2];
  assert.equal(incomeRowCells[0], '06/11/2026', 'Date');
  assert.equal(incomeRowCells[4], '', 'Withdrawal column must remain strictly empty');
  assert.equal(incomeRowCells[5], '10,000.00', 'Deposit column must receive 10,000.00');
  assert.equal(incomeRowCells[6], '59,201.00', 'Closing balance must receive 59,201.00');

  // Normalize and verify
  const normalized = normalizeStatementTable(extractedTable, 'HDFC Spatial Test');
  assert.equal(normalized.rows.length, 2);
  assert.equal(normalized.rows[0].type, 'expense');
  assert.equal(normalized.rows[0].amount, '799.00');

  assert.equal(normalized.rows[1].type, 'income');
  assert.equal(normalized.rows[1].amount, '10000.00');
  assert.notEqual(normalized.rows[1].amount, '59,201.00', 'Closing balance must NEVER be imported as an amount');
});

test('4. Multi-Line Narration Reconstruction and Reference Extraction', () => {
  const rawTable = [
    ['Date', 'Narration', 'Chq./Ref.No.', 'Value Dt', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance'],
    ['12/11/2026', 'UPI-FLIPKART INTERNET', '', '12/11/2026', '1,499.00', '', '57,702.00'],
    ['', 'PAYMENT-BANGALORE-UPI/CR/632145897/FLIPKART', '', '', '', '', ''],
    ['', 'ORDER ID OD1234567890 REF: RRN8899001122', '', '', '', '', ''],
  ];

  const parsed = normalizeStatementTable(rawTable, 'HDFC Bank Statement');
  assert.equal(parsed.rows.length, 1, 'Continuation lines must be merged into single transaction');

  const row = parsed.rows[0];
  assert.match(row.description, /UPI-FLIPKART INTERNET PAYMENT-BANGALORE/);
  assert.match(row.description, /ORDER ID OD1234567890/);
  // Reference extracted from continuation line
  assert.ok(row.reference, 'Must extract reference from continuation lines if original was empty');
  assert.equal(row.reference, '632145897', 'Must extract UPI reference from first continuation line');
});

test('5. Metadata and Summary Exclusions: Never treat statement summary rows as transactions', () => {
  const summaryLines = [
    'STATEMENT SUMMARY',
    'Opening Balance: 50,000.00',
    'Total Withdrawals: 15,000.00',
    'Total Deposits: 25,000.00',
    'Closing Balance: 60,000.00',
    'Available Balance: 60,000.00',
    'OD Limit: 0.00',
    'Nomination Registered: YES',
    'Page 1 of 3',
    'Computer Generated Statement - Does not require signature',
    'End of Statement',
  ];

  for (const line of summaryLines) {
    assert.equal(
      isStatementMetadataOrSummary(line),
      true,
      `Line "${line}" must be identified as statement metadata/summary`
    );
  }
});

test('6. Optional Category & Necessity: Transactions default to null necessity and unclassified category', () => {
  const rawTable = [
    ['Date', 'Narration', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance'],
    ['14/11/2026', 'LOCAL GROCERY STORE CASH', '350.00', '', '57,352.00'],
  ];

  const parsed = normalizeStatementTable(rawTable, 'HDFC Statement');
  assert.equal(parsed.rows.length, 1);

  const row = parsed.rows[0];
  assert.equal(row.type, 'expense');
  assert.equal(row.necessity, null, 'Statement expense rows must initialize with necessity: null (unclassified)');
  assert.equal(row.categoryId, '', 'Initial categoryId must be empty string until user selects or rule suggests');
});

test('7. Signed Amounts and POS Debit Reversals: Negative withdrawal increases balance and is classified as income reversal', () => {
  // Real HDFC case: POS purchase reversal appears in Withdrawal Amt. with negative sign
  // Opening balance: 5,641.17
  // Row 1: Normal expense of 500.00 -> balance becomes 5,141.17
  // Row 2: POS Reversal of -101.86 in Withdrawal Amt. -> balance INCREASES to 5,243.03!
  // Row 3: Income deposit of 1,000.00 in Deposit Amt. -> balance becomes 6,243.03
  const rawTable = [
    ['Date', 'Narration', 'Chq./Ref.No.', 'Value Dt', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance'],
    ['', 'OPENING BALANCE BROUGHT FORWARD', '', '', '', '', '5,641.17'],
    ['01/11/2026', 'POS PURCHASE RELIANCE FRESH', 'REF001', '01/11/2026', '500.00', '', '5,141.17'],
    ['02/11/2026', 'POS REVERSAL SWIGGY BANGALORE', 'REF002', '02/11/2026', '-101.86', '', '5,243.03'],
    ['03/11/2026', 'SALARY CREDIT ACME', 'REF003', '03/11/2026', '', '1,000.00', '6,243.03'],
    ['', 'CLOSING BALANCE CARRIED FORWARD', '', '', '', '', '6,243.03'],
  ];

  const parsed = normalizeStatementTable(rawTable, 'HDFC Bank Statement');
  assert.equal(parsed.rows.length, 3, 'Must extract exactly 3 genuine transactions');

  // Verify Row 1: normal expense
  const expense = parsed.rows[0];
  assert.equal(expense.type, 'expense');
  assert.equal(expense.amount, '500.00');
  assert.equal(expense.amountPaise, 50000);

  // Verify Row 2: POS Reversal (-101.86 in Withdrawal)
  const reversal = parsed.rows[1];
  assert.equal(reversal.type, 'income', 'Negative withdrawal must be classified as income because it increases bank balance');
  assert.equal(reversal.amount, '101.86', 'Amount string must be absolute INR value');
  assert.equal(reversal.amountPaise, 10186, 'Amount paise must be positive integer');
  assert.equal(reversal.classification, 'reversal', 'Classification must be reversal');
  assert.equal(reversal.selected, false, 'Candidate reversal should be unselected by default for user review');
  assert.equal(reversal.warning?.includes('Reversal'), true);

  // Verify Row 3: normal income
  const income = parsed.rows[2];
  assert.equal(income.type, 'income');
  assert.equal(income.amount, '1000.00');
  assert.equal(income.amountPaise, 100000);

  // Verify Statement Reconciliation: 5641.17 - 500.00 + 101.86 + 1000.00 = 6243.03
  assert.equal(parsed.isReconciled, true, 'Running balance and statement summary must reconcile without discrepancy warnings');
});
