import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseIndianDate,
  inferTableDateFormat,
  normalizeStatementTable,
  tagDuplicates,
} from '../src/features/imports/statement-parser';
import { skippedRowsForImport } from '../src/features/imports/statement-skip-history';

describe('Bank Statement Import: Date Accuracy, Ledger Sync, and Batch Recovery', () => {
  describe('1. Date Normalization & Multi-Format Support', () => {
    it('parses standard Indian DD/MM/YYYY dates', () => {
      assert.equal(parseIndianDate('21/11/2026'), '2026-11-21');
      assert.equal(parseIndianDate('05-04-2026'), '2026-04-05');
      assert.equal(parseIndianDate('09.12.2025'), '2025-12-09');
      assert.equal(parseIndianDate('14 08 2026'), '2026-08-14');
    });

    it('parses alphanumeric month formats (15-Nov-2026, Nov 15 2026)', () => {
      assert.equal(parseIndianDate('15-Nov-2026'), '2026-11-15');
      assert.equal(parseIndianDate('15/Nov/2026'), '2026-11-15');
      assert.equal(parseIndianDate('15 Nov 2026'), '2026-11-15');
      assert.equal(parseIndianDate('Nov 15, 2026'), '2026-11-15');
      assert.equal(parseIndianDate('January 02, 2026'), '2026-01-02');
      assert.equal(parseIndianDate('05-Dec-25'), '2025-12-05');
    });

    it('parses native Excel serial numbers and 5-digit string serials', () => {
      // 45245 = 2023-11-15
      assert.equal(parseIndianDate(45245), '2023-11-15');
      assert.equal(parseIndianDate('45245'), '2023-11-15');
    });

    it('validates leap years and calendar day bounds strictly', () => {
      // 2024 is a leap year (Feb 29 is valid)
      assert.equal(parseIndianDate('29/02/2024'), '2024-02-29');

      // 2025 is not a leap year (Feb 29 throws)
      assert.throws(() => parseIndianDate('29/02/2025'), /Invalid calendar date/);

      // April only has 30 days (April 31 throws)
      assert.throws(() => parseIndianDate('31/04/2026'), /Invalid calendar date/);
    });

    it('infers table date format preference (DMY vs MDY) accurately from sample rows', () => {
      const dmyTable = [
        ['Date', 'Narration', 'Withdrawal', 'Deposit'],
        ['25/01/2026', 'UPI Payment', '500.00', ''],
        ['10/02/2026', 'Salary', '', '50000.00'],
      ];
      assert.equal(inferTableDateFormat(dmyTable, 0), 'dmy');

      const mdyTable = [
        ['Date', 'Narration', 'Withdrawal', 'Deposit'],
        ['01/25/2026', 'US Merchant', '500.00', ''],
        ['02/10/2026', 'Salary', '', '50000.00'],
      ];
      assert.equal(inferTableDateFormat(mdyTable, 0), 'mdy');
    });

    it('separates transaction date from value date and prefers transaction date', () => {
      const table = [
        ['Txn Date', 'Value Date', 'Narration', 'Debit', 'Credit'],
        ['10/11/2026', '12/11/2026', 'Cheque Clearing', '1500.00', ''],
      ];
      const result = normalizeStatementTable(table, 'statement.csv');
      assert.equal(result.rows.length, 1);
      assert.equal(result.rows[0].date, '2026-11-10'); // Primary ledger date
      assert.equal(result.rows[0].valueDate, '2026-11-12');
      assert.equal(result.rows[0].confidence, 'high');
    });

    it('falls back to value date when transaction date is absent and marks medium confidence', () => {
      const table = [
        ['Value Date', 'Narration', 'Debit', 'Credit'],
        ['12/11/2026', 'Late Clearing', '1500.00', ''],
      ];
      const result = normalizeStatementTable(table, 'val_only.csv');
      assert.equal(result.rows.length, 1);
      assert.equal(result.rows[0].date, '2026-11-12');
      assert.equal(result.rows[0].confidence, 'medium');
    });
  });

  describe('2. Multi-Line Narrations & Metadata Isolation', () => {
    it('merges multi-line narrations into the active transaction and does not create ghost rows', () => {
      const table = [
        ['Date', 'Narration', 'Chq/Ref No', 'Withdrawal', 'Deposit', 'Closing Balance'],
        ['15/11/2026', 'UPI/532014/Merchant', 'REF123456', '750.00', '', '45000.00'],
        ['', 'Bangalore IN / Order 98765', '', '', '', ''],
        ['16/11/2026', 'Salary Credit', 'SAL789', '', '80000.00', '125000.00'],
      ];
      const result = normalizeStatementTable(table, 'multiline.csv');
      assert.equal(result.rows.length, 2);
      assert.ok(result.rows[0].description.includes('UPI/532014/Merchant Bangalore IN / Order 98765'));
      assert.equal(result.rows[0].amountPaise, 75000);
      assert.equal(result.rows[1].amountPaise, 8000000);
    });

    it('isolates opening and closing balance metadata rows and never imports them as transactions', () => {
      const table = [
        ['Date', 'Narration', 'Debit', 'Credit', 'Balance'],
        ['01/11/2026', 'Opening Balance b/f', '', '', '10000.00'],
        ['05/11/2026', 'Grocery Store', '1200.00', '', '8800.00'],
        ['30/11/2026', 'Closing Balance c/f', '', '', '8800.00'],
      ];
      const result = normalizeStatementTable(table, 'statement_with_balances.csv');
      assert.equal(result.rows.length, 1);
      assert.equal(result.rows[0].description, 'Grocery Store');
      assert.equal(result.rows[0].amountPaise, 120000);
      assert.equal(result.openingBalancePaise, '1000000');
      assert.equal(result.closingBalancePaise, '880000');
    });
  });

  describe('3. Deduplication Across Statement Re-uploads and Cross-Sources', () => {
    it('detects existing ledger items from both server and local device cache', () => {
      const statementRows = [
        {
          key: 'row-1',
          date: '2026-11-20',
          description: 'Swiggy UPI 998811',
          amount: '450.00',
          amountPaise: 45000,
          type: 'expense' as const,
          paymentMethod: 'online' as const,
          reference: '998811',
          balance: null,
          state: 'new' as const,
          selected: true,
          categoryId: '',
          confidence: 'high' as const,
        },
        {
          key: 'row-2',
          date: '2026-11-21',
          description: 'New Fresh Transaction',
          amount: '1200.00',
          amountPaise: 120000,
          type: 'expense' as const,
          paymentMethod: 'online' as const,
          reference: null,
          balance: null,
          state: 'new' as const,
          selected: true,
          categoryId: '',
          confidence: 'high' as const,
        },
      ];

      const existingLedger = [
        {
          transaction_date: '2026-11-20',
          amount_paise: 45000,
          type: 'expense',
          description: 'Swiggy UPI 998811',
          statement_reference: '998811',
        },
      ];

      const tagged = tagDuplicates(statementRows, existingLedger, null);
      assert.equal(tagged[0].state, 'possible_duplicate');
      assert.equal(tagged[0].selected, false);
      assert.equal(tagged[1].state, 'new');
      assert.equal(tagged[1].selected, true);
    });
  });

  describe('4. Exact Batch Accounting & Mutually Exclusive Metrics', () => {
    it('satisfies detected === imported + skipped without contradictory totals', () => {
      const mockRows = Array.from({ length: 60 }, (_, i) => ({
        key: `row-${i}`,
        date: '2026-11-21',
        description: `Txn ${i}`,
        amount: '100.00',
        amountPaise: 10000,
        type: 'expense' as const,
        paymentMethod: 'online' as const,
        reference: `REF${i}`,
        balance: null,
        state: 'new' as const,
        selected: i < 44, // 44 selected, 16 skipped
        categoryId: '',
        confidence: 'high' as const,
      }));

      // Simulate importing 44 rows
      const importedRowKeys = new Set(mockRows.slice(0, 44).map((r) => r.key));
      const skipped = skippedRowsForImport(mockRows, importedRowKeys);

      assert.equal(mockRows.length, 60);
      assert.equal(importedRowKeys.size, 44);
      assert.equal(skipped.length, 16);
      assert.equal(mockRows.length, importedRowKeys.size + skipped.length);

      // Verify each skipped row has non-negative valid paise string
      for (const row of skipped) {
        assert.ok(/^\d+$/.test(row.amount_paise));
        assert.ok(BigInt(row.amount_paise) > 0n);
      }
    });

    it('ensures imported rows are NEVER captured in skipped_rows', () => {
      const rows = [
        {
          key: 'r1',
          date: '2026-11-21',
          description: 'Imported Entry',
          amount: '250.00',
          amountPaise: 25000,
          type: 'expense' as const,
          paymentMethod: 'online' as const,
          reference: null,
          balance: null,
          state: 'imported' as const,
          selected: false,
          categoryId: '',
          confidence: 'high' as const,
        },
        {
          key: 'r2',
          date: '2026-11-21',
          description: 'Skipped Entry',
          amount: '500.00',
          amountPaise: 50000,
          type: 'expense' as const,
          paymentMethod: 'online' as const,
          reference: null,
          balance: null,
          state: 'possible_duplicate' as const,
          selected: false,
          categoryId: '',
          confidence: 'high' as const,
        },
      ];

      const importedKeys = new Set(['r1']);
      const skipped = skippedRowsForImport(rows, importedKeys);

      assert.equal(skipped.length, 1);
      assert.equal(skipped[0].amount_paise, '50000');
      assert.equal(skipped[0].state, 'possible_duplicate');
    });
  });
});
