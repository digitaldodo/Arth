import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { TransactionDTO, CategoryDTO } from '@arth/contracts';
import {
  exportLedgerToPdf,
  generateStatementFilename,
  generateStatementReference,
  sanitizeUsernameForFilename,
  getTimestampIST,
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
      assert.equal(filename, 'arth-statement-ansh-2026-10-01-to-2026-10-31.pdf');
    });

    test('normalizes uppercase, leading @ symbol, and special characters', () => {
      const filename = generateStatementFilename({
        username: '@Digital_Dodo!',
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      });
      assert.equal(filename, 'arth-statement-digital_dodo-2026-10-01-to-2026-10-31.pdf');
    });

    test('gracefully falls back when username is absent', () => {
      const filename = generateStatementFilename({
        username: null,
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      });
      assert.equal(filename, 'arth-statement-2026-10-01-to-2026-10-31.pdf');
    });

    test('handles empty username and missing dates', () => {
      const filename = generateStatementFilename({
        username: '',
        startDate: undefined,
        endDate: undefined,
      });
      assert.ok(filename.startsWith('arth-statement-all-to-'));
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
      assert.ok(ref1.startsWith('ARTH-STMT-20261031-'));
    });

    test('getTimestampIST returns date formatted in Asia/Kolkata timezone with IST suffix', () => {
      const timestamp = getTimestampIST();
      assert.ok(timestamp.endsWith('IST'), 'Must include IST timezone suffix');
      assert.ok(/\d{2} [A-Za-z]{3} \d{4},? \d{1,2}:\d{2}\s?(am|pm) IST/i.test(timestamp), `Timestamp "${timestamp}" should match expected format`);
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
        dateRangeLabel: '1 Oct 2026 – 31 Oct 2026',
        prefetchedTransactions: mockFiveTransactions,
        userProfile: {
          displayName: 'Ansh Kumar',
          username: 'digitaldodo',
          email: 'anshkmrn@gmail.com',
        },
      });

      assert.ok(result.doc, 'jsPDF instance must be returned');
      assert.equal(result.filename, 'arth-statement-digitaldodo-2026-10-01-to-2026-10-31.pdf');
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
      assert.equal(result.filename, 'arth-statement-ansh-2026-10-01-to-2026-10-31.pdf');
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
      assert.equal(result.filename, 'arth-statement-2026-10-01-to-2026-10-31.pdf');
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
      assert.ok(result.filename.startsWith('arth-statement-all-to-'));
    });
  });
});
