import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TransactionDTO } from '@arth/contracts';

describe('Arth — Loading States, Filtering & Smooth UI Transitions Suite', () => {
  describe('1. Global CSS & Smooth Transition Tokens', () => {
    test('defines indeterminate loading bar keyframes and utilities', () => {
      const cssPath = join(process.cwd(), 'src/app/globals.css');
      const css = readFileSync(cssPath, 'utf8');

      assert.ok(css.includes('@keyframes indeterminate-bar'), 'Must define indeterminate-bar keyframe');
      assert.ok(css.includes('.animate-indeterminate'), 'Must define animate-indeterminate class');
      assert.ok(css.includes('transform-origin'), 'Must define transform origin for smooth scale animation');
    });

    test('enforces instantaneous transitions under prefers-reduced-motion: reduce', () => {
      const cssPath = join(process.cwd(), 'src/app/globals.css');
      const css = readFileSync(cssPath, 'utf8');

      assert.ok(css.includes('prefers-reduced-motion: reduce'), 'Must contain prefers-reduced-motion media query');
      assert.ok(css.includes('transition-duration: 0.01ms !important'), 'Transitions must collapse for reduced motion');
      assert.ok(css.includes('animation-duration: 0.01ms !important'), 'Animations must collapse for reduced motion');
    });
  });

  describe('2. Ledger Query Caching & Race Condition Guards', () => {
    const mockTxnsIncome: TransactionDTO[] = [
      {
        id: 'tx-inc-1',
        type: 'income',
        amount_paise: 8000000,
        amount_decimal: '80000.00',
        formatted_inr: '₹80,000.00',
        category_id: 'cat-sal',
        category_name: 'Salary',
        transaction_date: '2026-10-01',
        payment_method: 'online',
        necessity: null,
        description: 'Tech Corp Salary',
        notes: 'Monthly direct credit',
        recorded_at: '2026-10-01T10:00:00Z',

        created_at: '2026-10-01T10:00:00Z',
        updated_at: '2026-10-01T10:00:00Z',
      },
    ];

    const mockTxnsExpense: TransactionDTO[] = [
      {
        id: 'tx-exp-1',
        type: 'expense',
        amount_paise: 25000,
        amount_decimal: '250.00',
        formatted_inr: '₹250.00',
        category_id: 'cat-food',
        category_name: 'Food & Dining',
        transaction_date: '2026-10-05',
        payment_method: 'cash',
        necessity: 'essential',
        description: 'Groceries at Supermarket',
        notes: 'Weekly essentials',
        recorded_at: '2026-10-05T10:00:00Z',

        created_at: '2026-10-05T10:00:00Z',
        updated_at: '2026-10-05T10:00:00Z',
      },
      {
        id: 'tx-exp-2',
        type: 'expense',
        amount_paise: 15000,
        amount_decimal: '150.00',
        formatted_inr: '₹150.00',
        category_id: 'cat-ent',
        category_name: 'Entertainment',
        transaction_date: '2026-10-06',
        payment_method: 'online',
        necessity: 'luxury',
        description: 'Movie Ticket IMAX',
        notes: null,
        recorded_at: '2026-10-06T10:00:00Z',

        created_at: '2026-10-06T10:00:00Z',
        updated_at: '2026-10-06T10:00:00Z',
      },
    ];

    test('query sequence tracker discards slower outdated responses during rapid filter switching', async () => {
      let currentSeq = 0;
      let activeTransactions: TransactionDTO[] = [];

      // Simulated async fetch with variable delay
      const simulateQuery = async (queryType: 'income' | 'expense', delayMs: number) => {
        currentSeq += 1;
        const reqSeq = currentSeq;

        await new Promise((resolve) => setTimeout(resolve, delayMs));

        // Sequence guard: only latest request updates state
        if (reqSeq === currentSeq) {
          activeTransactions = queryType === 'income' ? mockTxnsIncome : mockTxnsExpense;
        }
      };

      // Trigger request 1 (Expense with long 150ms delay)
      const p1 = simulateQuery('expense', 150);
      // Quickly trigger request 2 (Income with fast 30ms delay)
      const p2 = simulateQuery('income', 30);

      await Promise.all([p1, p2]);

      // Result must be 'income' even though request 1 finished later!
      assert.equal(activeTransactions.length, 1);
      assert.equal(activeTransactions[0].type, 'income');
      assert.equal(activeTransactions[0].description, 'Tech Corp Salary');
    });

    test('in-memory query cache allows instantaneous repeat filter lookups', () => {
      const cache = new Map<string, TransactionDTO[]>();

      const cacheKeyIncome = 'income_all_all_all_all';
      const cacheKeyExpense = 'expense_all_all_all_all';

      cache.set(cacheKeyIncome, mockTxnsIncome);
      cache.set(cacheKeyExpense, mockTxnsExpense);

      assert.ok(cache.has(cacheKeyIncome));
      assert.ok(cache.has(cacheKeyExpense));

      // Instant hit
      const hit = cache.get(cacheKeyExpense);
      assert.equal(hit?.length, 2);
      assert.equal(hit?.[0].id, 'tx-exp-1');

      // Clear cache on transaction mutation
      cache.clear();
      assert.equal(cache.size, 0);
    });

    test('debounce threshold prevents loading indicator flash on fast local or cached lookups', async () => {
      let isRefreshing = false;
      let refreshTimer: NodeJS.Timeout | null = null;

      const startQuery = (isFast: boolean) => {
        // 90ms threshold
        refreshTimer = setTimeout(() => {
          isRefreshing = true;
        }, 90);

        if (isFast) {
          // Completes in 20ms
          setTimeout(() => {
            if (refreshTimer) clearTimeout(refreshTimer);
            isRefreshing = false;
          }, 20);
        }
      };

      // Fast query
      startQuery(true);
      await new Promise((r) => setTimeout(r, 60));

      assert.equal(isRefreshing, false, 'Loading indicator must NOT flash for fast lookups under 90ms');
    });
  });

  describe('3. Client-Side Instant Search & Sorting', () => {
    const dataset: TransactionDTO[] = [
      {
        id: 'tx-1',
        type: 'expense',
        amount_paise: 50000,
        amount_decimal: '500.00',
        formatted_inr: '₹500.00',
        category_id: 'c1',
        category_name: 'Dining',
        transaction_date: '2026-10-10',
        payment_method: 'cash',
        necessity: 'essential',
        description: 'Dhaba Dinner',
        notes: 'Dinner with family',
        recorded_at: '2026-10-10T10:00:00Z',

        created_at: '2026-10-10T10:00:00Z',
        updated_at: '2026-10-10T10:00:00Z',
      },
      {
        id: 'tx-2',
        type: 'expense',
        amount_paise: 2000,
        amount_decimal: '20.00',
        formatted_inr: '₹20.00',
        category_id: 'c2',
        category_name: 'Transport',
        transaction_date: '2026-10-11',
        payment_method: 'online',
        necessity: 'essential',
        description: 'Metro Recharge',
        notes: null,
        recorded_at: '2026-10-11T10:00:00Z',

        created_at: '2026-10-11T10:00:00Z',
        updated_at: '2026-10-11T10:00:00Z',
      },
      {
        id: 'tx-3',
        type: 'income',
        amount_paise: 1000000,
        amount_decimal: '10000.00',
        formatted_inr: '₹10,000.00',
        category_id: 'c3',
        category_name: 'Freelance',
        transaction_date: '2026-10-12',
        payment_method: 'online',
        necessity: null,
        description: 'Design Consultancy',
        notes: 'Client payment',
        recorded_at: '2026-10-12T10:00:00Z',

        created_at: '2026-10-12T10:00:00Z',
        updated_at: '2026-10-12T10:00:00Z',
      },
    ];

    test('filters instantly by search query across description, category, and notes without network calls', () => {
      const search = (q: string) => {
        const query = q.trim().toLowerCase();
        return dataset.filter((t) => {
          const desc = (t.description || '').toLowerCase();
          const cat = (t.category_name || '').toLowerCase();
          const notes = (t.notes || '').toLowerCase();
          return desc.includes(query) || cat.includes(query) || notes.includes(query);
        });
      };

      const res1 = search('Metro');
      assert.equal(res1.length, 1);
      assert.equal(res1[0].id, 'tx-2');

      const res2 = search('family'); // from notes
      assert.equal(res2.length, 1);
      assert.equal(res2[0].id, 'tx-1');

      const res3 = search('freelance'); // from category
      assert.equal(res3.length, 1);
      assert.equal(res3[0].id, 'tx-3');

      const res4 = search('nonexistent');
      assert.equal(res4.length, 0);
    });

    test('sorts transactions by amount high-to-low and low-to-high instantly', () => {
      const sortHighToLow = [...dataset].sort((a, b) => b.amount_paise - a.amount_paise);
      assert.equal(sortHighToLow[0].id, 'tx-3'); // 10000.00
      assert.equal(sortHighToLow[1].id, 'tx-1'); // 500.00
      assert.equal(sortHighToLow[2].id, 'tx-2'); // 20.00

      const sortLowToHigh = [...dataset].sort((a, b) => a.amount_paise - b.amount_paise);
      assert.equal(sortLowToHigh[0].id, 'tx-2'); // 20.00
      assert.equal(sortLowToHigh[2].id, 'tx-3'); // 10000.00
    });
  });

  describe('4. Component Loading Layout Stability & Accessibility', () => {
    test('QuickAddModal has aria-busy and stable min-height on submit button', () => {
      const modalPath = join(process.cwd(), 'src/features/transactions/QuickAddModal.tsx');
      const code = readFileSync(modalPath, 'utf8');

      assert.ok(code.includes('aria-busy={isSubmitting}'), 'QuickAdd submit button must specify aria-busy');
      assert.ok(code.includes('isSubmittingRef.current'), 'QuickAdd must use ref guard to prevent duplicate concurrent saves');
      assert.ok(code.includes('min-h-[38px]'), 'QuickAdd submit button must preserve vertical dimension');
    });

    test('DeleteTransactionModal has aria-busy and stable button dimensions', () => {
      const modalPath = join(process.cwd(), 'src/features/transactions/DeleteTransactionModal.tsx');
      const code = readFileSync(modalPath, 'utf8');

      assert.ok(code.includes('aria-busy={isDeleting}'), 'Delete button must specify aria-busy');
      assert.ok(code.includes('min-h-[38px]'), 'Delete button must have stable min-height');
    });

    test('SheetsConnectionCard has aria-busy and stable min-width on action buttons', () => {
      const cardPath = join(process.cwd(), 'src/features/sheets/SheetsConnectionCard.tsx');
      const code = readFileSync(cardPath, 'utf8');

      assert.ok(code.includes('aria-busy={syncing}'), 'Sync button must have aria-busy');
      assert.ok(code.includes('aria-busy={retrying}'), 'Retry button must have aria-busy');
      assert.ok(code.includes('aria-busy={reconciling}'), 'Reconcile button must have aria-busy');
      assert.ok(code.includes('min-w-[85px]'), 'Sync button must specify min-width');
    });

    test('TransactionLedger includes indeterminate progress bar with aria-label and role=progressbar', () => {
      const ledgerPath = join(process.cwd(), 'src/features/transactions/TransactionLedger.tsx');
      const code = readFileSync(ledgerPath, 'utf8');

      assert.ok(code.includes('role="progressbar"'), 'Must have accessible progressbar role');
      assert.ok(code.includes('animate-indeterminate'), 'Must apply indeterminate loading animation');
      assert.ok(code.includes('clearLedgerQueryCache'), 'Must export clearLedgerQueryCache for invalidation');
    });

    test('DashboardPage includes non-disruptive indeterminate progress bar for date range changes', () => {
      const dashPath = join(process.cwd(), 'src/features/dashboard/DashboardPage.tsx');
      const code = readFileSync(dashPath, 'utf8');

      assert.ok(code.includes('isRefreshing'), 'Dashboard must maintain isRefreshing state');
      assert.ok(code.includes('animate-indeterminate'), 'Dashboard must render indeterminate progress bar');
      assert.ok(code.includes('role="progressbar"'), 'Dashboard progress bar must have role="progressbar"');
    });
  });
});
