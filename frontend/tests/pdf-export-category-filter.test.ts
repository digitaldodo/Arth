import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCategoryCounts,
  filterEligibleCategories,
  resolveEligibleCategory,
} from '../src/features/transactions/export-category-filter';
import type { CategoryDTO, TransactionDTO } from '@arth/contracts';

const sampleCategories: CategoryDTO[] = [
  {
    id: 'cat-food',
    name: 'Food & Dining',
    type: 'expense',
    icon: 'utensils',
    color: '#f97316',
    sort_order: 1,
    is_default: true,
    archived_at: null,
  },
  {
    id: 'cat-transport',
    name: 'Transportation',
    type: 'expense',
    icon: 'car',
    color: '#06b6d4',
    sort_order: 2,
    is_default: true,
    archived_at: null,
  },
  {
    id: 'cat-utilities',
    name: 'Bills & Utilities',
    type: 'expense',
    icon: 'zap',
    color: '#eab308',
    sort_order: 3,
    is_default: true,
    archived_at: null,
  },
  {
    id: 'cat-salary',
    name: 'Salary',
    type: 'income',
    icon: 'briefcase',
    color: '#10b981',
    sort_order: 4,
    is_default: true,
    archived_at: null,
  },
  {
    id: 'cat-freelance',
    name: 'Freelance & Consulting',
    type: 'income',
    icon: 'laptop',
    color: '#8b5cf6',
    sort_order: 5,
    is_default: false,
    archived_at: null,
  },
];

describe('PDF Export Category Scope: Eligibility Filtering', () => {
  test('computeCategoryCounts correctly tallies active transactions by category', () => {
    const transactions: TransactionDTO[] = [
      {
        id: 'tx-1',
        amount_paise: 25000,
        amount_decimal: '250.00',
        formatted_inr: '₹250.00',
        type: 'expense',
        category_id: 'cat-food',
        transaction_date: '2026-10-25',
        payment_method: 'online',
        necessity: 'essential',
        description: 'Groceries',
        notes: null,
        created_at: '2026-10-25T10:00:00.000Z',
        updated_at: '2026-10-25T10:00:00.000Z',
      },
      {
        id: 'tx-2',
        amount_paise: 15000,
        amount_decimal: '150.00',
        formatted_inr: '₹150.00',
        type: 'expense',
        category_id: 'cat-food',
        transaction_date: '2026-10-24',
        payment_method: 'online',
        necessity: 'essential',
        description: 'Lunch',
        notes: null,
        created_at: '2026-10-24T12:00:00.000Z',
        updated_at: '2026-10-24T12:00:00.000Z',
      },
      {
        id: 'tx-3',
        amount_paise: 5000000,
        amount_decimal: '50000.00',
        formatted_inr: '₹50,000.00',
        type: 'income',
        category_id: 'cat-salary',
        transaction_date: '2026-10-01',
        payment_method: 'online',
        necessity: null,
        description: 'Monthly Pay',
        notes: null,
        created_at: '2026-10-01T09:00:00.000Z',
        updated_at: '2026-10-01T09:00:00.000Z',
      },
    ];

    const counts = computeCategoryCounts(transactions);
    assert.equal(counts.get('cat-food'), 2);
    assert.equal(counts.get('cat-salary'), 1);
    assert.equal(counts.get('cat-transport'), undefined);
    assert.equal(counts.get('cat-utilities'), undefined);
    assert.equal(counts.get('cat-freelance'), undefined);
  });

  test('filterEligibleCategories excludes categories with zero matching transactions', () => {
    // Only Food and Salary have transactions
    const matchingTransactions: TransactionDTO[] = [
      {
        id: 'tx-1',
        amount_paise: 25000,
        amount_decimal: '250.00',
        formatted_inr: '₹250.00',
        type: 'expense',
        category_id: 'cat-food',
        transaction_date: '2026-10-25',
        payment_method: 'online',
        necessity: 'essential',
        description: 'Dinner',
        notes: null,
        created_at: '2026-10-25T10:00:00.000Z',
        updated_at: '2026-10-25T10:00:00.000Z',
      },
      {
        id: 'tx-2',
        amount_paise: 5000000,
        amount_decimal: '50000.00',
        formatted_inr: '₹50,000.00',
        type: 'income',
        category_id: 'cat-salary',
        transaction_date: '2026-10-01',
        payment_method: 'online',
        necessity: null,
        description: 'October Salary',
        notes: null,
        created_at: '2026-10-01T09:00:00.000Z',
        updated_at: '2026-10-01T09:00:00.000Z',
      },
    ];

    const eligible = filterEligibleCategories(sampleCategories, matchingTransactions);
    assert.equal(eligible.length, 2);
    assert.deepEqual(
      eligible.map((c) => c.id),
      ['cat-food', 'cat-salary']
    );

    // Verify Transportation, Utilities, and Freelance are excluded
    assert.ok(!eligible.some((c) => c.id === 'cat-transport'));
    assert.ok(!eligible.some((c) => c.id === 'cat-utilities'));
    assert.ok(!eligible.some((c) => c.id === 'cat-freelance'));
  });

  test('respects income-only filter: excludes all expense categories', () => {
    // Dataset containing only income records
    const incomeTransactions: TransactionDTO[] = [
      {
        id: 'tx-inc-1',
        amount_paise: 800000,
        amount_decimal: '8000.00',
        formatted_inr: '₹8,000.00',
        type: 'income',
        category_id: 'cat-freelance',
        transaction_date: '2026-10-15',
        payment_method: 'online',
        necessity: null,
        description: 'Web dev gig',
        notes: null,
        created_at: '2026-10-15T10:00:00.000Z',
        updated_at: '2026-10-15T10:00:00.000Z',
      },
    ];

    const eligible = filterEligibleCategories(sampleCategories, incomeTransactions);
    assert.equal(eligible.length, 1);
    assert.equal(eligible[0].id, 'cat-freelance');
    assert.equal(eligible[0].type, 'income');
  });

  test('respects expense-only filter: excludes all income categories', () => {
    // Dataset containing only expense records
    const expenseTransactions: TransactionDTO[] = [
      {
        id: 'tx-exp-1',
        amount_paise: 45000,
        amount_decimal: '450.00',
        formatted_inr: '₹450.00',
        type: 'expense',
        category_id: 'cat-transport',
        transaction_date: '2026-10-20',
        payment_method: 'online',
        necessity: 'essential',
        description: 'Fuel',
        notes: null,
        created_at: '2026-10-20T10:00:00.000Z',
        updated_at: '2026-10-20T10:00:00.000Z',
      },
      {
        id: 'tx-exp-2',
        amount_paise: 250000,
        amount_decimal: '2500.00',
        formatted_inr: '₹2,500.00',
        type: 'expense',
        category_id: 'cat-utilities',
        transaction_date: '2026-10-18',
        payment_method: 'online',
        necessity: 'essential',
        description: 'Electricity bill',
        notes: null,
        created_at: '2026-10-18T10:00:00.000Z',
        updated_at: '2026-10-18T10:00:00.000Z',
      },
    ];

    const eligible = filterEligibleCategories(sampleCategories, expenseTransactions);
    assert.equal(eligible.length, 2);
    assert.deepEqual(
      eligible.map((c) => c.id),
      ['cat-transport', 'cat-utilities']
    );
  });

  test('handles empty dataset gracefully with 0 eligible categories', () => {
    const eligible = filterEligibleCategories(sampleCategories, []);
    assert.equal(eligible.length, 0);
  });
});

describe('PDF Export Category Scope: Selected Category Preservation & Reset', () => {
  const eligibleCategories: CategoryDTO[] = [
    sampleCategories[0], // cat-food
    sampleCategories[3], // cat-salary
  ];

  test('preserves explicitly selected category while it remains in the eligible set', () => {
    const result = resolveEligibleCategory('cat-food', eligibleCategories);
    assert.equal(result, 'cat-food');

    const resultSalary = resolveEligibleCategory('cat-salary', eligibleCategories);
    assert.equal(resultSalary, 'cat-salary');
  });

  test('gracefully falls back to "all" when selected category is no longer eligible', () => {
    // cat-transport is not in eligibleCategories
    const result = resolveEligibleCategory('cat-transport', eligibleCategories);
    assert.equal(result, 'all');

    // cat-utilities is not in eligibleCategories
    const resultUtils = resolveEligibleCategory('cat-utilities', eligibleCategories);
    assert.equal(resultUtils, 'all');
  });

  test('maintains "all" default selection when "all" was selected', () => {
    const result = resolveEligibleCategory('all', eligibleCategories);
    assert.equal(result, 'all');
  });

  test('falls back to "all" when eligible categories list is completely empty', () => {
    const result = resolveEligibleCategory('cat-food', []);
    assert.equal(result, 'all');
  });
});

describe('PDF Export Category Scope: Multi-Page Dataset Eligibility', () => {
  test('calculates category eligibility from transactions across multiple paginated pages', () => {
    // Simulate a dataset of 75 transactions across 2 pages (50 on page 1, 25 on page 2)
    // Page 1 has only 'cat-food'
    // Page 2 introduces 'cat-transport'
    const page1Transactions: TransactionDTO[] = Array.from({ length: 50 }, (_, i) => ({
      id: `tx-p1-${i}`,
      amount_paise: 10000,
      amount_decimal: '100.00',
      formatted_inr: '₹100.00',
      type: 'expense' as const,
      category_id: 'cat-food',
      transaction_date: '2026-10-25',
      payment_method: 'online' as const,
      necessity: 'essential' as const,
      description: `Item ${i}`,
      notes: null,
      created_at: '2026-10-25T10:00:00.000Z',
      updated_at: '2026-10-25T10:00:00.000Z',
    }));

    const page2Transactions: TransactionDTO[] = Array.from({ length: 25 }, (_, i) => ({
      id: `tx-p2-${i}`,
      amount_paise: 20000,
      amount_decimal: '200.00',
      formatted_inr: '₹200.00',
      type: 'expense' as const,
      category_id: 'cat-transport',
      transaction_date: '2026-10-24',
      payment_method: 'online' as const,
      necessity: 'essential' as const,
      description: `Transport ${i}`,
      notes: null,
      created_at: '2026-10-24T10:00:00.000Z',
      updated_at: '2026-10-24T10:00:00.000Z',
    }));

    // If evaluated only from page 1, cat-transport would be missed!
    const page1OnlyEligible = filterEligibleCategories(sampleCategories, page1Transactions);
    assert.equal(page1OnlyEligible.length, 1);
    assert.equal(page1OnlyEligible[0].id, 'cat-food');

    // When evaluated from complete multi-page dataset (page 1 + page 2)
    const completeDataset = [...page1Transactions, ...page2Transactions];
    const fullEligible = filterEligibleCategories(sampleCategories, completeDataset);
    assert.equal(fullEligible.length, 2);
    assert.deepEqual(
      fullEligible.map((c) => c.id),
      ['cat-food', 'cat-transport']
    );

    const counts = computeCategoryCounts(completeDataset);
    assert.equal(counts.get('cat-food'), 50);
    assert.equal(counts.get('cat-transport'), 25);
  });
});
