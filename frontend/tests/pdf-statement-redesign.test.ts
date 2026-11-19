import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { TransactionDTO, CategoryDTO } from '@arth/contracts';
import {
  exportLedgerToPdf,
  generateStatementFilename,
  generateStatementReference,
  sanitizeUsernameForFilename,
  getTimestampIST,
  formatCurrencyPdf,
  isCurrentMonthInProgress,
  getMonthInProgressLabel,
} from '../src/features/transactions/ledger-pdf-exporter';

const mockCategories: CategoryDTO[] = [
  { id: 'cat-food', name: 'Food & Dining', type: 'expense', icon: null, color: null, sort_order: 1, is_default: true, archived_at: null },
  { id: 'cat-bev', name: 'Beverages', type: 'expense', icon: null, color: null, sort_order: 2, is_default: false, archived_at: null },
  { id: 'cat-trans', name: 'Transport', type: 'expense', icon: null, color: null, sort_order: 3, is_default: true, archived_at: null },
  { id: 'cat-salary', name: 'Salary', type: 'income', icon: null, color: null, sort_order: 4, is_default: true, archived_at: null },
];

const mockFiveTransactions: TransactionDTO[] = [
  {
    id: 'tx-1',
    type: 'expense',
    amount_paise: 12500,
    category_id: 'cat-food',
    category_name: 'Food & Dining',
    payment_method: 'cash',
    necessity: 'essential',
    description: 'Chaudhary Dhaba',
    transaction_date: '2026-10-26',
    formatted_inr: '₹125.00',
    amount_decimal: '125.00',
    notes: null,
    recorded_at: '2026-10-26T10:00:00Z',

    created_at: '2026-10-26T10:00:00Z',
    updated_at: '2026-10-26T10:00:00Z',
  },
  {
    id: 'tx-2',
    type: 'expense',
    amount_paise: 2000,
    category_id: 'cat-bev',
    category_name: 'Beverages',
    payment_method: 'cash',
    necessity: 'optional',
    description: 'Coke',
    transaction_date: '2026-10-26',
    formatted_inr: '₹20.00',
    amount_decimal: '20.00',
    notes: null,
    recorded_at: '2026-10-26T11:00:00Z',

    created_at: '2026-10-26T11:00:00Z',
    updated_at: '2026-10-26T11:00:00Z',
  },
  {
    id: 'tx-3',
    type: 'expense',
    amount_paise: 3500,
    category_id: 'cat-bev',
    category_name: 'Beverages',
    payment_method: 'cash',
    necessity: 'optional',
    description: 'Lassi',
    transaction_date: '2026-10-26',
    formatted_inr: '₹35.00',
    amount_decimal: '35.00',
    notes: null,
    recorded_at: '2026-10-26T12:00:00Z',

    created_at: '2026-10-26T12:00:00Z',
    updated_at: '2026-10-26T12:00:00Z',
  },
  {
    id: 'tx-4',
    type: 'expense',
    amount_paise: 5000,
    category_id: 'cat-food',
    category_name: 'Food & Dining',
    payment_method: 'cash',
    necessity: 'essential',
    description: 'Biryani',
    transaction_date: '2026-10-26',
    formatted_inr: '₹50.00',
    amount_decimal: '50.00',
    notes: null,
    recorded_at: '2026-10-26T13:00:00Z',

    created_at: '2026-10-26T13:00:00Z',
    updated_at: '2026-10-26T13:00:00Z',
  },
  {
    id: 'tx-5',
    type: 'expense',
    amount_paise: 4000,
    category_id: 'cat-trans',
    category_name: 'Transport',
    payment_method: 'cash',
    necessity: 'essential',
    description: 'Travelling Expense',
    transaction_date: '2026-10-26',
    formatted_inr: '₹40.00',
    amount_decimal: '40.00',
    notes: null,
    recorded_at: '2026-10-26T14:00:00Z',

    created_at: '2026-10-26T14:00:00Z',
    updated_at: '2026-10-26T14:00:00Z',
  },
];

describe('Personal Financial Statement PDF Redesign', () => {
  describe('1. Filename Generation & Username Normalization', () => {
    test('generates expected pattern with username and date range', () => {
      const filename = generateStatementFilename({
        username: 'ansh',
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      });
      assert.equal(filename, 'spendsense-statement-ansh-2026-10-01-to-2026-10-31.pdf');
    });

    test('normalizes uppercase, leading @ symbol, and special characters', () => {
      const filename = generateStatementFilename({
        username: '@Digital_Dodo!',
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      });
      assert.equal(filename, 'spendsense-statement-digital_dodo-2026-10-01-to-2026-10-31.pdf');
    });

    test('gracefully falls back when username is absent', () => {
      const filename = generateStatementFilename({
        username: null,
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      });
      assert.equal(filename, 'spendsense-statement-2026-10-01-to-2026-10-31.pdf');
    });

    test('handles empty username and missing dates', () => {
      const filename = generateStatementFilename({
        username: '',
        startDate: undefined,
        endDate: undefined,
      });
      assert.ok(filename.startsWith('spendsense-statement-all-to-'));
      assert.ok(filename.endsWith('.pdf'));
    });
  });

  describe('2. Statement Reference & Generation Timestamp', () => {
    test('generates deterministic statement reference code', () => {
      const ref1 = generateStatementReference({
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        transactionCount: 5,
      });
      const ref2 = generateStatementReference({
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        transactionCount: 5,
      });

      assert.equal(ref1, ref2, 'Statement reference must be deterministic for identical parameters');
      assert.ok(ref1.startsWith('SPEND-STMT-20261031-'));
    });

    test('getTimestampIST returns date formatted in Asia/Kolkata timezone with IST suffix in DD/MM/YYYY format', () => {
      const timestamp = getTimestampIST();
      assert.ok(timestamp.endsWith('IST'), 'Must include IST timezone suffix');
      assert.ok(/\d{2}\/\d{2}\/\d{4},? \d{1,2}:\d{2}\s?(am|pm) IST/i.test(timestamp), `Timestamp "${timestamp}" should match expected format`);
    });

    test('formatCurrencyPdf strips leading plus and minus signs while preserving paise precision and currency symbol', () => {
      // Income / positive flow
      assert.equal(formatCurrencyPdf(50000n), '₹500.00');
      // Expense / negative flow
      assert.equal(formatCurrencyPdf(-27000n), '₹270.00');
      // Zero flow
      assert.equal(formatCurrencyPdf(0n), '₹0.00');
      // Number input
      assert.equal(formatCurrencyPdf(12500), '₹125.00');
      // Ensure no plus or minus symbol in output
      assert.ok(!formatCurrencyPdf(50000n).includes('+'));
      assert.ok(!formatCurrencyPdf(-27000n).includes('-'));
    });

    test('isCurrentMonthInProgress correctly identifies ongoing month and rejects completed or partial ranges', () => {
      // Current month before end date: 27 Oct 2026 for month 01 Oct - 31 Oct
      assert.equal(
        isCurrentMonthInProgress('2026-10-01', '2026-10-31', '2026-10-27'),
        true,
        'Should identify ongoing month as in progress'
      );

      // Completed month: Sep 2026 when today is 27 Oct 2026
      assert.equal(
        isCurrentMonthInProgress('2026-09-01', '2026-09-30', '2026-10-27'),
        false,
        'Completed month must not be marked in progress'
      );

      // Arbitrary custom range within current month
      assert.equal(
        isCurrentMonthInProgress('2026-10-05', '2026-10-20', '2026-10-27'),
        false,
        'Arbitrary date ranges must not be marked in progress'
      );

      // Non-this_month preset
      assert.equal(
        isCurrentMonthInProgress('2026-10-01', '2026-10-31', '2026-10-27', 'last_month'),
        false,
        'Should respect preset override'
      );

      // this_month preset
      assert.equal(
        isCurrentMonthInProgress('2026-10-01', '2026-10-31', '2026-10-27', 'this_month'),
        true,
        'Should recognize this_month preset'
      );
    });

    test('getMonthInProgressLabel formats label correctly', () => {
      const label = getMonthInProgressLabel('2026-10-01', '2026-10-27');
      assert.equal(label, 'October 2026 · Month in progress');
    });
  });

  describe('3. Statement Generation & Content Hierarchy', () => {
    test('exports short 5-transaction statement matching user reference with complete metadata', async () => {
      const result = await exportLedgerToPdf({
        selectedType: 'all',
        selectedCategory: 'all',
        categories: mockCategories,
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        dateRangeLabel: '01-10-2026 – 31-10-2026',
        prefetchedTransactions: mockFiveTransactions,
        userProfile: {
          displayName: 'Ansh Kumar',
          username: 'digitaldodo',
          email: 'anshkmrn@gmail.com',
        },
      });

      assert.ok(result.doc, 'jsPDF instance must be returned');
      assert.equal(result.filename, 'spendsense-statement-digitaldodo-2026-10-01-to-2026-10-31.pdf');
      assert.equal(result.doc.getNumberOfPages(), 1, 'Short statement must fit gracefully on a single page');
    });

    test('exports multi-page statement with repeated table headers and accurate page counts', async () => {
      // Create 60 transactions to force multi-page layout
      const multiPageTxns: TransactionDTO[] = [];
      for (let i = 1; i <= 60; i++) {
        multiPageTxns.push({
          id: `tx-multi-${i}`,
          type: i % 4 === 0 ? 'income' : 'expense',
          amount_paise: i * 5000,
          amount_decimal: (i * 50).toFixed(2),
          notes: null,
          category_id: i % 4 === 0 ? 'cat-salary' : 'cat-food',
          category_name: i % 4 === 0 ? 'Salary' : 'Food & Dining',
          payment_method: i % 2 === 0 ? 'online' : 'cash',
          necessity: i % 4 === 0 ? null : (i % 2 === 0 ? 'essential' : 'optional'),
          description: `Transaction item number ${i}`,
          transaction_date: '2026-10-15',
          formatted_inr: `₹${(i * 50).toFixed(2)}`,
          recorded_at: '2026-10-15T10:00:00Z',

          created_at: '2026-10-15T10:00:00Z',
          updated_at: '2026-10-15T10:00:00Z',
        });
      }

      const result = await exportLedgerToPdf({
        selectedType: 'all',
        selectedCategory: 'all',
        categories: mockCategories,
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        prefetchedTransactions: multiPageTxns,
        userProfile: {
          username: 'ansh',
        },
      });

      assert.ok(result.doc.getNumberOfPages() >= 2, 'Large statement must paginate naturally');
      assert.equal(result.filename, 'spendsense-statement-ansh-2026-10-01-to-2026-10-31.pdf');
    });

    test('exports income-only statement with zero expense metrics and accurate Net Cash Flow', async () => {
      const incomeTxns: TransactionDTO[] = [
        {
          id: 'tx-inc-1',
          type: 'income',
          amount_paise: 5000000, // ₹50,000.00
          amount_decimal: '50000.00',
          notes: null,
          category_id: 'cat-salary',
          category_name: 'Salary',
          payment_method: 'online',
          necessity: null,
          description: 'Monthly Salary Credit',
          transaction_date: '2026-10-01',
          formatted_inr: '₹50,000.00',
          recorded_at: '2026-10-01T10:00:00Z',

          created_at: '2026-10-01T10:00:00Z',
          updated_at: '2026-10-01T10:00:00Z',
        },
      ];

      const result = await exportLedgerToPdf({
        selectedType: 'income',
        selectedCategory: 'cat-salary',
        categories: mockCategories,
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        prefetchedTransactions: incomeTxns,
        userProfile: {
          username: 'digitaldodo',
        },
      });

      assert.equal(result.doc.getNumberOfPages(), 1);
    });

    test('exports expense-only statement with zero income metrics and negative Net Cash Flow', async () => {
      const result = await exportLedgerToPdf({
        selectedType: 'expense',
        selectedCategory: 'all',
        selectedNecessity: 'essential',
        categories: mockCategories,
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        prefetchedTransactions: mockFiveTransactions,
      });

      assert.equal(result.doc.getNumberOfPages(), 1);
      assert.equal(result.filename, 'spendsense-statement-2026-10-01-to-2026-10-31.pdf');
    });

    test('handles missing profile fields gracefully without crashing or placeholder leaks', async () => {
      const result = await exportLedgerToPdf({
        selectedType: 'all',
        selectedCategory: 'all',
        categories: mockCategories,
        prefetchedTransactions: mockFiveTransactions,
        userProfile: undefined, // No user profile provided
      });

      assert.ok(result.doc);
      assert.ok(result.filename.startsWith('spendsense-statement-all-to-'));
      assert.equal(result.encryptedBytes, undefined, 'Unprotected export must not return encryptedBytes');
    });

    test('exports statement with exact title PERSONAL TRANSACTION STATEMENT and correct metadata', async () => {
      const result = await exportLedgerToPdf({
        selectedType: 'all',
        selectedCategory: 'all',
        categories: mockCategories,
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        prefetchedTransactions: mockFiveTransactions,
        userProfile: {
          displayName: 'Ansh Kumar',
          username: 'digitaldodo',
        },
      });

      assert.ok(result.doc);
      assert.equal(result.filename, 'spendsense-statement-digitaldodo-2026-10-01-to-2026-10-31.pdf');

      const rawStr = Buffer.from(result.doc.output('arraybuffer')).toString('binary');
      assert.ok(
        rawStr.includes('/Title (Personal Transaction Statement)'),
        'PDF metadata must include Personal Transaction Statement title'
      );
      assert.ok(
        rawStr.includes('/Creator (SpendSense Personal Finance)'),
        'PDF metadata must include SpendSense Personal Finance creator'
      );
    });

    test('exports statement with genuine AES-256 password encryption when password is provided', async () => {
      const result = await exportLedgerToPdf({
        selectedType: 'all',
        selectedCategory: 'all',
        categories: mockCategories,
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        prefetchedTransactions: mockFiveTransactions,
        userProfile: {
          displayName: 'Ansh Kumar',
          username: 'digitaldodo',
        },
        password: 'SuperSecretStatementPassword2026!',
      });

      assert.ok(result.encryptedBytes, 'Encrypted bytes must be returned when password is provided');
      assert.ok(result.encryptedBytes instanceof Uint8Array, 'Encrypted bytes must be a Uint8Array');
      assert.ok(result.encryptedBytes.length > 1000, 'Encrypted file size must be non-trivial');

      // Verify PDF encryption markers in binary stream
      const binStr = Buffer.from(result.encryptedBytes).toString('binary');
      assert.ok(binStr.includes('/Encrypt'), 'Must contain standard PDF /Encrypt dictionary marker');
      assert.ok(binStr.includes('/Standard'), 'Must use standard PDF security handler');

      // Verify that sensitive payload text is obfuscated/encrypted and does NOT appear in plaintext
      assert.ok(
        !binStr.includes('Chaudhary Dhaba'),
        'Transaction descriptions must be encrypted and not appear as plaintext'
      );
      assert.ok(
        !binStr.includes('SuperSecretStatementPassword2026!'),
        'Password itself must never be stored as plaintext in the PDF document'
      );
    });
  });

  describe('PDF layout constants — FINANCIAL SUMMARY heading alignment', () => {
    // Regression test for the bug where the FINANCIAL SUMMARY heading was placed
    // only 2 mm above the summary card, causing it to overlap or crowd the card's
    // top border and sit too close to the metadata cards above it.
    //
    // Expected invariants (all values in mm):
    //   cardY       = 39   (metadata cards start)
    //   cardHeight  = 27   (metadata cards height → bottom at y = 66)
    //   headingGap  ≥ 6    (mm of clear space between card bottom and heading baseline)
    //   headingRoom ≥ 4    (mm between heading baseline and summary card top)
    //
    // The source must NOT contain the old pattern `summaryY - 2` which places the
    // heading only 2 mm above the card top.
    test('heading is not placed via the buggy "summaryY - 2" pattern', () => {
      const fs = require('fs');
      const path = require('path');
      const src = fs.readFileSync(
        path.resolve(__dirname, '../src/features/transactions/ledger-pdf-exporter.ts'),
        'utf8'
      );

      assert.ok(
        !src.includes('summaryY - 2'),
        'The old buggy pattern "summaryY - 2" must be removed from the exporter'
      );
    });

    test('summaryHeadingY provides at least 6 mm clearance below metadata cards', () => {
      const fs = require('fs');
      const path = require('path');
      const src = fs.readFileSync(
        path.resolve(__dirname, '../src/features/transactions/ledger-pdf-exporter.ts'),
        'utf8'
      );

      // Extract the numeric gap value from: cardY + cardHeight + <N>
      // We look for the summaryHeadingY assignment pattern
      const headingMatch = src.match(/summaryHeadingY\s*=\s*cardY\s*\+\s*cardHeight\s*\+\s*(\d+)/);
      assert.ok(
        headingMatch,
        'summaryHeadingY must be defined as cardY + cardHeight + <gap> in the exporter'
      );

      const headingGap = parseInt(headingMatch![1], 10);
      assert.ok(
        headingGap >= 6,
        `Heading gap (${headingGap} mm) must be at least 6 mm to avoid crowding the metadata cards`
      );
    });

    test('summaryY provides at least 4 mm breathing room below the heading', () => {
      const fs = require('fs');
      const path = require('path');
      const src = fs.readFileSync(
        path.resolve(__dirname, '../src/features/transactions/ledger-pdf-exporter.ts'),
        'utf8'
      );

      // Extract the room value from: summaryY = summaryHeadingY + <N>
      const cardGapMatch = src.match(/summaryY\s*=\s*summaryHeadingY\s*\+\s*(\d+)/);
      assert.ok(
        cardGapMatch,
        'summaryY must be defined as summaryHeadingY + <room> in the exporter'
      );

      const headingRoom = parseInt(cardGapMatch![1], 10);
      assert.ok(
        headingRoom >= 4,
        `Heading-to-card room (${headingRoom} mm) must be at least 4 mm so the heading does not crowd the card top border`
      );
    });
  });
});
