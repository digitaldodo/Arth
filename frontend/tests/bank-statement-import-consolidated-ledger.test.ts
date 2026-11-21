import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeStatementTable, parseCsv, tagDuplicates } from '../src/features/imports/statement-parser.js';
import { assessPossibleDuplicate } from '../src/features/categorization/duplicates.js';
import { suggestCategory } from '../src/features/categorization/pipeline.js';
import { skippedRowsForImport } from '../src/features/imports/statement-skip-history.js';

test('1. Product Model & Architecture: Bank Statement Import directly into Consolidated Ledger', () => {
  const statementImportPath = path.resolve(process.cwd(), 'src/features/imports/StatementImport.tsx');
  const statementImportCode = fs.readFileSync(statementImportPath, 'utf8');

  // Verify NO bank account selection or account management in StatementImport.tsx
  assert.doesNotMatch(statementImportCode, /Choose a bank or card account/, 'Must not show bank account dropdown');
  assert.doesNotMatch(statementImportCode, /Add bank or card account/, 'Must not show bank account creation form');
  assert.doesNotMatch(statementImportCode, /Destination account/i, 'Must not mandate destination account selection');
  assert.doesNotMatch(statementImportCode, /CrossAccountReconciliation/, 'Must not embed cross account reconciliation');

  // Verify NO unrelated capture tabs in StatementImport
  assert.doesNotMatch(statementImportCode, /FinancialMessageCapture/, 'Must not embed FinancialMessageCapture');
  assert.doesNotMatch(statementImportCode, /<nav aria-label="Transaction capture methods"/, 'Must not have unrelated capture navigation tabs');

  // Verify Documents & Tax subheader is removed
  assert.doesNotMatch(statementImportCode, /<p[^>]*>Documents &amp; Tax<\/p>/, 'Must not label statement import as Documents & Tax');

  // Verify transactions committed to consolidated ledger have account_id: null
  assert.match(statementImportCode, /account_id:\s*null/, 'Must commit transactions with account_id: null into consolidated personal ledger');
  assert.match(statementImportCode, /ingestion_source:\s*'bank_statement'/, 'Must record ingestion_source as bank_statement');
});

test('2. Entry Points: Dashboard and Ledger both provide dedicated Import Bank Statement actions', () => {
  const dashboardPath = path.resolve(process.cwd(), 'src/features/dashboard/DashboardPage.tsx');
  const dashboardCode = fs.readFileSync(dashboardPath, 'utf8');
  assert.match(dashboardCode, /onOpenStatementImport/, 'Dashboard must accept onOpenStatementImport');
  assert.match(dashboardCode, /Import Bank Statement/, 'Dashboard must render Import Bank Statement action');

  const ledgerPath = path.resolve(process.cwd(), 'src/features/transactions/TransactionLedger.tsx');
  const ledgerCode = fs.readFileSync(ledgerPath, 'utf8');
  assert.match(ledgerCode, /handleOpenImport/, 'Ledger must accept statement import handler');
  assert.match(ledgerCode, /Import Bank Statement/, 'Ledger must render Import Bank Statement button');

  const appShellPath = path.resolve(process.cwd(), 'src/features/transactions/TransactionAppShell.tsx');
  const appShellCode = fs.readFileSync(appShellPath, 'utf8');
  assert.match(appShellCode, /StatementImportModal/, 'TransactionAppShell must integrate StatementImportModal');
  assert.match(appShellCode, /setIsStatementImportOpen\(true\)/, 'TransactionAppShell must wire modal open trigger');

  // Verify Documents & Tax does NOT render StatementImport
  assert.doesNotMatch(
    appShellCode,
    /\{activeView === 'documents'[^}]*<StatementImport/s,
    'Documents & Tax view must not embed StatementImport'
  );
});

test('3. Privacy & Security: Password handling and provenance scrubbing', () => {
  const statementImportPath = path.resolve(process.cwd(), 'src/features/imports/StatementImport.tsx');
  const statementImportCode = fs.readFileSync(statementImportPath, 'utf8');

  // Password must be conditional
  assert.match(statementImportCode, /passwordRequired &&/, 'Password form must only render when passwordRequired is true');
  assert.match(statementImportCode, /autoComplete="off"/, 'Password input must have autocomplete off');
  assert.match(statementImportCode, /sessionPasswordRef\.current = null/, 'Session password ref must be cleared on unmount');

  // Sensitive account/PAN scrubber in safeSourceName
  assert.match(statementImportCode, /safeSourceName\(name: string\)/, 'Must include safeSourceName sanitizer');
  assert.match(statementImportCode, /\[PAN\]/, 'Must scrub PAN patterns from file names');
});

test('4. Statement Extraction & Normalization with Necessity Field', () => {
  const csvContent = [
    'Date,Description,Debit,Credit,Balance,Ref',
    '15/11/2026,SWIGGY BANGALORE,450.00,,12000.00,UPI-12345678',
    '16/11/2026,REFUND FROM AMAZON,,899.00,12899.00,RET-887766',
    '17/11/2026,MONTHLY SALARY,,75000.00,87899.00,SAL-990011',
  ].join('\n');

  const parsed = normalizeStatementTable(parseCsv(csvContent), 'HDFC Bank Statement');
  assert.equal(parsed.rows.length, 3);

  // Expense row normalization & necessity initialization
  const swiggyRow = parsed.rows[0];
  assert.equal(swiggyRow.date, '2026-11-15');
  assert.equal(swiggyRow.amount, '450.00');
  assert.equal(swiggyRow.amountPaise, 45000);
  assert.equal(swiggyRow.type, 'expense');
  assert.equal(swiggyRow.necessity, 'essential', 'Expense row must default to essential necessity');
  assert.equal(swiggyRow.reference, 'UPI-12345678');

  // Refund row normalization
  const refundRow = parsed.rows[1];
  assert.equal(refundRow.type, 'income');
  assert.equal(refundRow.classification, 'refund');
  assert.equal(refundRow.necessity, null, 'Income row must have null necessity');

  // Salary income row normalization
  const salaryRow = parsed.rows[2];
  assert.equal(salaryRow.type, 'income');
  assert.equal(salaryRow.necessity, null, 'Income row must have null necessity');
});

test('5. Cross-Source Duplicate Detection: Deduplicates against SMS and manual entries', () => {
  // Existing ledger transactions from different sources (SMS, manual, previous statement)
  const existingLedger = [
    // 1. Transaction captured from Android SMS (has reference, no account_id)
    {
      transaction_date: '2026-11-15',
      amount_paise: 45000,
      type: 'expense',
      description: 'Paid Rs 450.00 to Swiggy Bangalore',
      account_id: null,
      statement_reference: 'UPI-12345678',
    },
    // 2. Transaction recorded via Quick Add manually (no reference, no account_id)
    {
      transaction_date: '2026-11-16',
      amount_paise: 25000,
      type: 'expense',
      description: 'Starbucks Coffee',
      account_id: null,
      statement_reference: null,
    },
    // 3. Past statement transaction on legacy account
    {
      transaction_date: '2026-11-17',
      amount_paise: 7500000,
      type: 'income',
      description: 'MONTHLY SALARY ACME CORP',
      account_id: 'legacy-acc-1',
      statement_reference: 'SAL-990011',
    },
  ];

  // Incoming bank statement rows
  const incomingRows = normalizeStatementTable([
    ['Date', 'Narration', 'Debit', 'Credit', 'Ref'],
    ['15/11/2026', 'SWIGGY BANGALORE UPI', '450.00', '', 'UPI-12345678'], // Matches SMS by reference!
    ['16/11/2026', 'Starbucks Coffee', '250.00', '', ''], // Matches manual entry by date + amount + description!
    ['17/11/2026', 'SALARY CREDIT ACME CORP', '', '75000.00', 'SAL-990011'], // Matches by reference across account!
    ['18/11/2026', 'NEW FRESH PURCHASE', '120.00', '', 'NEW-001'], // Brand new transaction!
  ]).rows;

  const tagged = tagDuplicates(incomingRows, existingLedger, null);

  // Row 0: matches SMS capture via reference
  assert.equal(tagged[0].state, 'possible_duplicate');
  assert.equal(tagged[0].classification, 'already_recorded');
  assert.equal(tagged[0].selected, false, 'Duplicate matching SMS must be unselected by default');

  // Row 1: matches manual Quick Add via narration + amount + date
  assert.equal(tagged[1].state, 'possible_duplicate');
  assert.equal(tagged[1].classification, 'already_recorded');
  assert.equal(tagged[1].selected, false, 'Duplicate matching manual entry must be unselected by default');

  // Row 2: matches legacy statement via reference
  assert.equal(tagged[2].state, 'possible_duplicate');
  assert.equal(tagged[2].classification, 'already_recorded');
  assert.equal(tagged[2].selected, false, 'Duplicate matching by reference must be unselected by default');

  // Row 3: genuinely new transaction
  assert.equal(tagged[3].state, 'new');
  assert.equal(tagged[3].selected, true, 'New transaction must be selected by default');
});

test('6. Categorization & Skip History Anonymization', () => {
  const dummyCategories: import('@arth/contracts').CategoryDTO[] = [
    { id: 'cat-food', name: 'Food & Dining', type: 'expense', icon: 'utensils', color: '#ff0000', sort_order: 1, is_default: true, archived_at: null },
    { id: 'cat-salary', name: 'Salary', type: 'income', icon: 'briefcase', color: '#00ff00', sort_order: 2, is_default: true, archived_at: null },
  ];

  // Suggestion matches Food & Dining for Swiggy
  const suggestion = suggestCategory('SWIGGY BANGALORE ORDER', dummyCategories, 'expense');
  assert.ok(suggestion);
  assert.equal(suggestion.category.id, 'cat-food');

  // Skip history persists only date, amount, state, and reason (no narration or PII)
  const statementRows = normalizeStatementTable([
    ['Date', 'Narration', 'Debit', 'Credit'],
    ['15/11/2026', 'CONFIDENTIAL NARRATION WITH CARD 1234', '500.00', ''],
  ]).rows;
  statementRows[0].selected = false; // deselected

  const skipped = skippedRowsForImport(statementRows);
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0].transaction_date, '2026-11-15');
  assert.equal(skipped[0].amount_paise, '50000');
  assert.equal(skipped[0].reason, 'deselected');
  assert.equal((skipped[0] as Record<string, unknown>).description, undefined, 'Narration must not be stored in skip history');
});
