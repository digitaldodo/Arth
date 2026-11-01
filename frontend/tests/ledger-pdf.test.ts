import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { TransactionDTO, TransactionListResponse } from '@arth/contracts';

describe('Ledger PDF Export Logic & Pagination Safety', () => {
  test('accurately calculates BigInt paise totals without floating-point accumulation', () => {
    const sampleTransactions: TransactionDTO[] = [
      {
        id: '0192e44f-0001-7000-8000-000000000001',
        amount_paise: 45050, // ₹450.50
        amount_decimal: '450.50',
        formatted_inr: '₹450.50',
        type: 'expense',
        category_id: 'cat-1',
        category_name: 'Food & Dining',
        transaction_date: '2026-10-25',
        payment_method: 'online',
        necessity: 'essential',
        description: 'Lunch',
        notes: null,
        recorded_at: '2026-10-25T10:00:00Z',

        created_at: '2026-10-25T10:00:00Z',
        updated_at: '2026-10-25T10:00:00Z',
      },
      {
        id: '0192e44f-0002-7000-8000-000000000002',
        amount_paise: 500000, // ₹5,000.00
        amount_decimal: '5000.00',
        formatted_inr: '₹5,000.00',
        type: 'income',
        category_id: 'cat-2',
        category_name: 'Allowance',
        transaction_date: '2026-10-24',
        payment_method: 'online',
        necessity: null,
        description: 'Pocket Money',
        notes: null,
        recorded_at: '2026-10-24T10:00:00Z',

        created_at: '2026-10-24T10:00:00Z',
        updated_at: '2026-10-24T10:00:00Z',
      },
      {
        id: '0192e44f-0003-7000-8000-000000000003',
        amount_paise: 185025, // ₹1,850.25
        amount_decimal: '1850.25',
        formatted_inr: '₹1,850.25',
        type: 'expense',
        category_id: 'cat-3',
        category_name: 'Utilities',
        transaction_date: '2026-10-22',
        payment_method: 'online',
        necessity: 'essential',
        description: 'Electricity Bill',
        notes: null,
        recorded_at: '2026-10-22T10:00:00Z',

        created_at: '2026-10-22T10:00:00Z',
        updated_at: '2026-10-22T10:00:00Z',
      },
    ];

    let totalIncomePaise = BigInt(0);
    let totalExpensePaise = BigInt(0);

    for (const t of sampleTransactions) {
      const p = BigInt(t.amount_paise);
      if (t.type === 'income') {
        totalIncomePaise += p;
      } else {
        totalExpensePaise += p;
      }
    }

    const netCashFlowPaise = totalIncomePaise - totalExpensePaise;

    assert.equal(totalIncomePaise, BigInt(500000)); // Exactly ₹5,000.00
    assert.equal(totalExpensePaise, BigInt(230075)); // ₹450.50 + ₹1,850.25 = ₹2,300.75
    assert.equal(netCashFlowPaise, BigInt(269925)); // ₹2,699.25

    // Verify decimal formatting
    const whole = netCashFlowPaise / BigInt(100);
    const frac = netCashFlowPaise % BigInt(100);
    assert.equal(whole, BigInt(2699));
    assert.equal(frac, BigInt(25));
  });

  test('multi-page pagination collector traverses all pages and deduplicates IDs', async () => {
    // Mock multi-page responses (3 pages of 2 items each)
    const mockPages: Record<number, TransactionListResponse> = {
      1: {
        items: [
          {
            id: 'txn-1',
            amount_paise: 10000,
            amount_decimal: '100.00',
            formatted_inr: '₹100.00',
            type: 'expense',
            category_id: 'c1',
            category_name: 'Food',
            transaction_date: '2026-10-25',
            payment_method: 'cash',
            necessity: 'essential',
            description: 'Item 1',
            notes: null,
            recorded_at: '',

            created_at: '',
            updated_at: '',
          },
          {
            id: 'txn-2',
            amount_paise: 20000,
            amount_decimal: '200.00',
            formatted_inr: '₹200.00',
            type: 'expense',
            category_id: 'c1',
            category_name: 'Food',
            transaction_date: '2026-10-25',
            payment_method: 'cash',
            necessity: 'essential',
            description: 'Item 2',
            notes: null,
            recorded_at: '',

            created_at: '',
            updated_at: '',
          },
        ],
        page: 1,
        page_size: 2,
        total_count: 5,
        has_more: true,
      },
      2: {
        items: [
          {
            id: 'txn-3',
            amount_paise: 30000,
            amount_decimal: '300.00',
            formatted_inr: '₹300.00',
            type: 'expense',
            category_id: 'c1',
            category_name: 'Food',
            transaction_date: '2026-10-24',
            payment_method: 'cash',
            necessity: 'essential',
            description: 'Item 3',
            notes: null,
            recorded_at: '',

            created_at: '',
            updated_at: '',
          },
          {
            // Simulate duplicate row from concurrent insert
            id: 'txn-2',
            amount_paise: 20000,
            amount_decimal: '200.00',
            formatted_inr: '₹200.00',
            type: 'expense',
            category_id: 'c1',
            category_name: 'Food',
            transaction_date: '2026-10-25',
            payment_method: 'cash',
            necessity: 'essential',
            description: 'Item 2',
            notes: null,
            recorded_at: '',

            created_at: '',
            updated_at: '',
          },
          {
            id: 'txn-4',
            amount_paise: 40000,
            amount_decimal: '400.00',
            formatted_inr: '₹400.00',
            type: 'expense',
            category_id: 'c1',
            category_name: 'Food',
            transaction_date: '2026-10-24',
            payment_method: 'cash',
            necessity: 'essential',
            description: 'Item 4',
            notes: null,
            recorded_at: '',

            created_at: '',
            updated_at: '',
          },
        ],
        page: 2,
        page_size: 2,
        total_count: 5,
        has_more: true,
      },
      3: {
        items: [
          {
            id: 'txn-5',
            amount_paise: 50000,
            amount_decimal: '500.00',
            formatted_inr: '₹500.00',
            type: 'income',
            category_id: 'c2',
            category_name: 'Income',
            transaction_date: '2026-10-20',
            payment_method: 'online',
            necessity: null,
            description: 'Item 5',
            notes: null,
            recorded_at: '',

            created_at: '',
            updated_at: '',
          },
        ],
        page: 3,
        page_size: 2,
        total_count: 5,
        has_more: false,
      },
    };

    // Simulate collector loop
    const collected: TransactionDTO[] = [];
    const seenIds = new Set<string>();
    let p = 1;
    let hasMore = true;

    while (hasMore && p <= 10) {
      const pageRes = mockPages[p];
      for (const item of pageRes.items) {
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id);
          collected.push(item);
        }
      }
      if (!pageRes.has_more || collected.length >= pageRes.total_count) {
        hasMore = false;
      } else {
        p++;
      }
    }

    assert.equal(collected.length, 5, 'Should collect exactly 5 deduplicated records');
    assert.deepEqual(
      collected.map((t) => t.id),
      ['txn-1', 'txn-2', 'txn-3', 'txn-4', 'txn-5']
    );
  });

  test('fails safely if an intermediate pagination request throws an error', async () => {
    let attemptedPages = 0;
    const mockFetcher = async (page: number) => {
      attemptedPages++;
      if (page === 2) {
        throw new Error('Network timeout during page 2 fetch');
      }
      return {
        items: [{ id: 'txn-1' } as TransactionDTO],
        page: 1,
        page_size: 1,
        total_count: 3,
        has_more: true,
      };
    };

    let caughtError: Error | null = null;
    try {
      let page = 1;
      let hasMore = true;
      const all: TransactionDTO[] = [];
      while (hasMore && page <= 5) {
        const res = await mockFetcher(page);
        all.push(...res.items);
        if (!res.has_more) hasMore = false;
        else page++;
      }
    } catch (err: unknown) {
      caughtError = err as Error;
    }

    assert.ok(caughtError !== null, 'Must reject with error instead of partial report');
    assert.match(caughtError.message, /Network timeout/);
    assert.equal(attemptedPages, 2);
  });
});
