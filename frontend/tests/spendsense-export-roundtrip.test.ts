import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { generateTransactionsCSV } from '../src/lib/export/csv-export.js';
import { parseCsv, normalizeStatementTable, tagDuplicates } from '../src/features/imports/statement-parser.js';
import type { TransactionDTO, CategoryDTO } from '@arth/contracts';

describe('SpendSense Statement Export Round-Trip Import', () => {
  const mockCategories: CategoryDTO[] = [
    { id: 'cat-groceries', name: 'Groceries', type: 'expense', icon: null, color: null, sort_order: 1, is_default: false, archived_at: null },
    { id: 'cat-salary', name: 'Salary', type: 'income', icon: null, color: null, sort_order: 2, is_default: false, archived_at: null },
    { id: 'cat-dining', name: 'Dining', type: 'expense', icon: null, color: null, sort_order: 3, is_default: false, archived_at: null },
  ];

  const mockTransactions: TransactionDTO[] = [
    {
      id: 'tx-101',
      account_id: null,
      amount_paise: 125050, // ₹1,250.50
      amount_decimal: '1250.50',
      formatted_inr: '₹1,250.50',
      type: 'expense',
      category_id: 'cat-groceries',
      category_name: 'Groceries',
      transaction_date: '2026-11-05',
      payment_method: 'online',
      necessity: 'essential',
      description: 'NATURE BASKET SUPERMARKET',
      notes: 'Weekly fresh produce',
      recorded_at: '2026-11-05T10:00:00Z',
      created_at: '2026-11-05T10:00:00Z',
      updated_at: '2026-11-05T10:00:00Z',
    },
    {
      id: 'tx-102',
      account_id: null,
      amount_paise: 9500000, // ₹95,000.00
      amount_decimal: '95000.00',
      formatted_inr: '₹95,000.00',
      type: 'income',
      category_id: 'cat-salary',
      category_name: 'Salary',
      transaction_date: '2026-11-01',
      payment_method: 'online',
      necessity: null,
      description: 'MONTHLY PAYROLL DEPOSIT',
      notes: 'November 2026 salary',
      recorded_at: '2026-11-01T09:00:00Z',
      created_at: '2026-11-01T09:00:00Z',
      updated_at: '2026-11-01T09:00:00Z',
    },
    {
      id: 'tx-103',
      account_id: null,
      amount_paise: 42000, // ₹420.00
      amount_decimal: '420.00',
      formatted_inr: '₹420.00',
      type: 'expense',
      category_id: null, // Uncategorized
      category_name: undefined,
      transaction_date: '2026-11-12',
      payment_method: 'cash',
      necessity: null, // Unclassified
      description: 'CORNER BAKERY CAFE',
      notes: null,
      recorded_at: '2026-11-12T16:30:00Z',
      created_at: '2026-11-12T16:30:00Z',
      updated_at: '2026-11-12T16:30:00Z',
    },
  ];

  test('Exports transactions to CSV and re-imports without lossy changes or direction inversion', () => {
    // 1. Generate SpendSense CSV export
    const csvData = generateTransactionsCSV(mockTransactions, mockCategories);
    assert.ok(csvData.includes('Date,Name / Description,Category,Type,Amount (INR),Payment Method,Necessity,Notes,Status'));

    // 2. Parse back the exported CSV
    const table = parseCsv(csvData);
    const parsed = normalizeStatementTable(table, 'SpendSense Statement Export - November 2026');

    // 3. Verify parsed adapter recognition
    assert.equal(parsed.adapterId, 'spendsense', 'Must recognize SpendSense statement format');
    assert.equal(parsed.rows.length, 3, 'Must extract all 3 exported transactions');

    // Verify Transaction 1: Groceries Expense
    const row1 = parsed.rows.find((r) => r.date === '2026-11-05');
    assert.ok(row1);
    assert.equal(row1.type, 'expense');
    assert.equal(row1.amount, '1250.50');
    assert.equal(row1.amountPaise, 125050);
    assert.equal(row1.description, 'NATURE BASKET SUPERMARKET');
    assert.equal(row1.necessity, 'essential', 'Round-trip must preserve necessity');
    assert.equal(row1.categoryId, 'Groceries', 'Round-trip preserves category name');

    // Verify Transaction 2: Salary Income
    const row2 = parsed.rows.find((r) => r.date === '2026-11-01');
    assert.ok(row2);
    assert.equal(row2.type, 'income');
    assert.equal(row2.amount, '95000.00');
    assert.equal(row2.amountPaise, 9500000);
    assert.equal(row2.description, 'MONTHLY PAYROLL DEPOSIT');
    assert.equal(row2.necessity, null, 'Income transactions have null necessity');

    // Verify Transaction 3: Uncategorized Expense
    const row3 = parsed.rows.find((r) => r.date === '2026-11-12');
    assert.ok(row3);
    assert.equal(row3.type, 'expense');
    assert.equal(row3.amount, '420.00');
    assert.equal(row3.amountPaise, 42000);
    assert.equal(row3.necessity, null, 'Unclassified expense has null necessity');
  });

  test('Deduplicates re-imported SpendSense transactions against active ledger', () => {
    const csvData = generateTransactionsCSV(mockTransactions, mockCategories);
    const table = parseCsv(csvData);
    const parsed = normalizeStatementTable(table, 'SpendSense Transaction Export');

    // Tag duplicates against current ledger
    const existingLedger = mockTransactions.map((tx) => ({
      transaction_date: tx.transaction_date,
      amount_paise: tx.amount_paise,
      type: tx.type,
      description: tx.description,
      account_id: null,
      statement_reference: null,
    }));

    const taggedRows = tagDuplicates(parsed.rows, existingLedger);

    // All 3 rows must be recognized as already_recorded and unselected
    for (const row of taggedRows) {
      assert.equal(row.classification, 'already_recorded', 'Identical transactions must be marked as already recorded');
      assert.equal(row.selected, false, 'Already recorded transactions must be unselected by default');
    }
  });
});
