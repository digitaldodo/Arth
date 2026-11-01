import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { TransactionDTO } from '@arth/contracts';
import {
  sortLedgerTransactions,
  getInitialLedgerSortPreference,
  LEDGER_SORT_STORAGE_KEY,
  type LedgerSortOption,
} from '../src/features/transactions/TransactionLedger';

function makeTxn(overrides: Partial<TransactionDTO> = {}): TransactionDTO {
  return {
    id: overrides.id || `txn-${Math.random().toString(36).substring(2, 9)}`,
    amount_paise: overrides.amount_paise ?? 10000,
    amount_decimal: overrides.amount_decimal ?? '100.00',
    formatted_inr: overrides.formatted_inr ?? '₹100.00',
    type: overrides.type ?? 'expense',
    category_id: overrides.category_id ?? 'cat-1',
    category_name: overrides.category_name ?? 'General',
    transaction_date: overrides.transaction_date ?? '2026-10-31',
    payment_method: overrides.payment_method ?? 'online',
    necessity: overrides.necessity !== undefined ? overrides.necessity : 'essential',
    description: overrides.description ?? 'Test Transaction',
    notes: overrides.notes ?? null,
    recorded_at: overrides.recorded_at ?? '2026-10-31T10:00:00.000Z',
    created_at: overrides.created_at ?? '2026-10-31T10:00:00.000Z',
    updated_at: overrides.updated_at ?? '2026-10-31T10:00:00.000Z',
  };
}

describe('Ledger Transaction Ordering & Sorting Preferences', () => {
  // Mock localStorage for storage preference tests
  const storageMap = new Map<string, string>();
  const mockLocalStorage = {
    getItem: (key: string) => storageMap.get(key) ?? null,
    setItem: (key: string, val: string) => { storageMap.set(key, String(val)); },
    removeItem: (key: string) => { storageMap.delete(key); },
    clear: () => { storageMap.clear(); },
  };

  beforeEach(() => {
    storageMap.clear();
    // @ts-expect-error Mocking global window.localStorage in node environment
    globalThis.localStorage = mockLocalStorage;
    // @ts-expect-error Mocking window in node environment
    globalThis.window = { localStorage: mockLocalStorage };
  });

  // 1. Default for new users
  test('1. New users receive Newest First by default', () => {
    storageMap.clear();
    const initialSort = getInitialLedgerSortPreference();
    assert.equal(initialSort, 'date_desc');
  });

  // 2. Existing users without saved preference
  test('2. Existing users without a saved preference receive Newest First', () => {
    storageMap.delete(LEDGER_SORT_STORAGE_KEY);
    const initialSort = getInitialLedgerSortPreference();
    assert.equal(initialSort, 'date_desc');
  });

  // 3. Newest First places the latest transaction date at the top
  test('3. Newest First places the latest transaction date at the top', () => {
    const biryani = makeTxn({ description: 'Biryani', transaction_date: '2026-10-26' });
    const lassi = makeTxn({ description: 'Lassi', transaction_date: '2026-10-28' });
    const travelling = makeTxn({ description: 'Travelling', transaction_date: '2026-10-30' });
    const food = makeTxn({ description: 'Food', transaction_date: '2026-10-31' });
    const grocery = makeTxn({ description: 'Grocery', transaction_date: '2026-11-01' });

    // Scramble order
    const list = [biryani, grocery, travelling, food, lassi];
    const sorted = sortLedgerTransactions(list, 'date_desc');

    assert.equal(sorted.length, 5);
    assert.equal(sorted[0].description, 'Grocery');
    assert.equal(sorted[0].transaction_date, '2026-11-01');

    assert.equal(sorted[1].description, 'Food');
    assert.equal(sorted[1].transaction_date, '2026-10-31');

    assert.equal(sorted[2].description, 'Travelling');
    assert.equal(sorted[2].transaction_date, '2026-10-30');

    assert.equal(sorted[3].description, 'Lassi');
    assert.equal(sorted[3].transaction_date, '2026-10-28');

    assert.equal(sorted[4].description, 'Biryani');
    assert.equal(sorted[4].transaction_date, '2026-10-26');
  });

  // 4. Oldest First places earliest transaction date at the top
  test('4. Oldest First places the earliest transaction date at the top', () => {
    const biryani = makeTxn({ description: 'Biryani', transaction_date: '2026-10-26' });
    const lassi = makeTxn({ description: 'Lassi', transaction_date: '2026-10-28' });
    const travelling = makeTxn({ description: 'Travelling', transaction_date: '2026-10-30' });
    const food = makeTxn({ description: 'Food', transaction_date: '2026-10-31' });
    const grocery = makeTxn({ description: 'Grocery', transaction_date: '2026-11-01' });

    const list = [grocery, biryani, food, lassi, travelling];
    const sorted = sortLedgerTransactions(list, 'date_asc');

    assert.equal(sorted.length, 5);
    assert.equal(sorted[0].description, 'Biryani');
    assert.equal(sorted[0].transaction_date, '2026-10-26');

    assert.equal(sorted[1].description, 'Lassi');
    assert.equal(sorted[1].transaction_date, '2026-10-28');

    assert.equal(sorted[2].description, 'Travelling');
    assert.equal(sorted[2].transaction_date, '2026-10-30');

    assert.equal(sorted[3].description, 'Food');
    assert.equal(sorted[3].transaction_date, '2026-10-31');

    assert.equal(sorted[4].description, 'Grocery');
    assert.equal(sorted[4].transaction_date, '2026-11-01');
  });

  // 5. Deterministic tie-breaker for transactions on the same date
  test('5. Same-date transactions use recorded_at, created_at, and ID as deterministic tie-breakers', () => {
    const morning = makeTxn({
      id: 'txn-aaa',
      description: 'Morning Coffee',
      transaction_date: '2026-10-31',
      recorded_at: '2026-10-31T08:30:00.000Z',
      created_at: '2026-10-31T08:30:05.000Z',
    });
    const afternoon = makeTxn({
      id: 'txn-bbb',
      description: 'Afternoon Lunch',
      transaction_date: '2026-10-31',
      recorded_at: '2026-10-31T13:00:00.000Z',
      created_at: '2026-10-31T13:00:02.000Z',
    });
    const evening = makeTxn({
      id: 'txn-ccc',
      description: 'Evening Dinner',
      transaction_date: '2026-10-31',
      recorded_at: '2026-10-31T20:15:00.000Z',
      created_at: '2026-10-31T20:15:01.000Z',
    });

    // Newest First: evening -> afternoon -> morning
    const newestSorted = sortLedgerTransactions([morning, evening, afternoon], 'date_desc');
    assert.equal(newestSorted[0].description, 'Evening Dinner');
    assert.equal(newestSorted[1].description, 'Afternoon Lunch');
    assert.equal(newestSorted[2].description, 'Morning Coffee');

    // Oldest First: morning -> afternoon -> evening
    const oldestSorted = sortLedgerTransactions([morning, evening, afternoon], 'date_asc');
    assert.equal(oldestSorted[0].description, 'Morning Coffee');
    assert.equal(oldestSorted[1].description, 'Afternoon Lunch');
    assert.equal(oldestSorted[2].description, 'Evening Dinner');

    // When recorded_at is identical, fallback to created_at
    const sameRecordedEarly = makeTxn({
      id: 'txn-1',
      description: 'Sync 1',
      transaction_date: '2026-10-31',
      recorded_at: '2026-10-31T12:00:00.000Z',
      created_at: '2026-10-31T12:00:01.000Z',
    });
    const sameRecordedLate = makeTxn({
      id: 'txn-2',
      description: 'Sync 2',
      transaction_date: '2026-10-31',
      recorded_at: '2026-10-31T12:00:00.000Z',
      created_at: '2026-10-31T12:00:05.000Z',
    });

    const tieBroken = sortLedgerTransactions([sameRecordedEarly, sameRecordedLate], 'date_desc');
    assert.equal(tieBroken[0].description, 'Sync 2');
    assert.equal(tieBroken[1].description, 'Sync 1');
  });

  // 6. Sorting remains correct after applying filters
  test('6. Sorting remains correct after applying category, type, and necessity filters', () => {
    const tx1 = makeTxn({ id: '1', type: 'expense', necessity: 'essential', category_id: 'cat-groceries', transaction_date: '2026-10-25' });
    const tx2 = makeTxn({ id: '2', type: 'expense', necessity: 'essential', category_id: 'cat-groceries', transaction_date: '2026-10-29' });
    const tx3 = makeTxn({ id: '3', type: 'expense', necessity: 'optional', category_id: 'cat-dining', transaction_date: '2026-10-28' });
    const tx4 = makeTxn({ id: '4', type: 'income', category_id: 'cat-salary', transaction_date: '2026-10-31' });
    const tx5 = makeTxn({ id: '5', type: 'expense', necessity: 'essential', category_id: 'cat-groceries', transaction_date: '2026-11-01' });

    // Filter to essential expense groceries
    const filtered = [tx1, tx2, tx3, tx4, tx5].filter(
      (t) => t.type === 'expense' && t.necessity === 'essential' && t.category_id === 'cat-groceries'
    );

    const newestFiltered = sortLedgerTransactions(filtered, 'date_desc');
    assert.equal(newestFiltered.length, 3);
    assert.equal(newestFiltered[0].id, '5'); // 2026-11-01
    assert.equal(newestFiltered[1].id, '2'); // 2026-10-29
    assert.equal(newestFiltered[2].id, '1'); // 2026-10-25

    const oldestFiltered = sortLedgerTransactions(filtered, 'date_asc');
    assert.equal(oldestFiltered.length, 3);
    assert.equal(oldestFiltered[0].id, '1'); // 2026-10-25
    assert.equal(oldestFiltered[1].id, '2'); // 2026-10-29
    assert.equal(oldestFiltered[2].id, '5'); // 2026-11-01
  });

  // 7. Amount-based sorting options
  test('7. Amount-based sorting options correctly order amounts and use newest-first tie breaker', () => {
    const small = makeTxn({ id: 'small', amount_paise: 5000, transaction_date: '2026-10-30' });
    const big1 = makeTxn({ id: 'big-yesterday', amount_paise: 50000, transaction_date: '2026-10-30' });
    const big2 = makeTxn({ id: 'big-today', amount_paise: 50000, transaction_date: '2026-10-31' });
    const medium = makeTxn({ id: 'medium', amount_paise: 20000, transaction_date: '2026-10-29' });

    const highToLow = sortLedgerTransactions([small, big1, big2, medium], 'amount_desc');
    assert.equal(highToLow[0].id, 'big-today'); // 50000, 2026-10-31
    assert.equal(highToLow[1].id, 'big-yesterday'); // 50000, 2026-10-30
    assert.equal(highToLow[2].id, 'medium'); // 20000
    assert.equal(highToLow[3].id, 'small'); // 5000

    const lowToHigh = sortLedgerTransactions([small, big1, big2, medium], 'amount_asc');
    assert.equal(lowToHigh[0].id, 'small'); // 5000
    assert.equal(lowToHigh[1].id, 'medium'); // 20000
    assert.equal(lowToHigh[2].id, 'big-today'); // 50000, 2026-10-31
    assert.equal(lowToHigh[3].id, 'big-yesterday'); // 50000, 2026-10-30
  });

  // 8. Offline and online transaction lists use identical ordering semantics
  test('8. Offline and online transaction lists use identical ordering semantics', () => {
    const t1 = makeTxn({ id: '0192e100-0000-7000-0000-000000000001', transaction_date: '2026-10-26', recorded_at: '2026-10-26T10:00:00Z' });
    const t2 = makeTxn({ id: '0192e200-0000-7000-0000-000000000002', transaction_date: '2026-10-28', recorded_at: '2026-10-28T10:00:00Z' });
    const t3 = makeTxn({ id: '0192e300-0000-7000-0000-000000000003', transaction_date: '2026-10-30', recorded_at: '2026-10-30T10:00:00Z' });
    const t4 = makeTxn({ id: '0192e400-0000-7000-0000-000000000004', transaction_date: '2026-10-31', recorded_at: '2026-10-31T10:00:00Z' });
    const t5 = makeTxn({ id: '0192e500-0000-7000-0000-000000000005', transaction_date: '2026-11-01', recorded_at: '2026-11-01T10:00:00Z' });

    // In IndexedDB, records are stored in primary key (UUIDv7) ascending order: [t1, t2, t3, t4, t5]
    const indexedDbRaw = [t1, t2, t3, t4, t5];
    const offlineSorted = sortLedgerTransactions(indexedDbRaw, 'date_desc');

    // On backend/server, query orders by transaction_date DESC, recorded_at DESC, created_at DESC, id DESC
    const serverSimulated = [...indexedDbRaw].sort((a, b) => b.transaction_date.localeCompare(a.transaction_date));

    assert.deepEqual(
      offlineSorted.map((t) => t.id),
      serverSimulated.map((t) => t.id)
    );
    assert.equal(offlineSorted[0].id, t5.id); // 2026-11-01
    assert.equal(offlineSorted[4].id, t1.id); // 2026-10-26
  });

  // 9. Newly created transactions appear in the correct position
  test('9. Newly created transactions appear in the correct position', () => {
    const existing = [
      makeTxn({ id: 'a', description: 'Past 1', transaction_date: '2026-10-30' }),
      makeTxn({ id: 'b', description: 'Past 2', transaction_date: '2026-10-28' }),
    ];

    // New transaction today (2026-11-01)
    const brandNew = makeTxn({ id: 'c', description: 'Newest Today', transaction_date: '2026-11-01' });

    const withNew = sortLedgerTransactions([...existing, brandNew], 'date_desc');
    assert.equal(withNew[0].id, 'c');
    assert.equal(withNew[0].description, 'Newest Today');

    // Backdated transaction (2026-10-29)
    const backdated = makeTxn({ id: 'd', description: 'Backdated Yesterday', transaction_date: '2026-10-29' });
    const withBackdated = sortLedgerTransactions([...withNew, backdated], 'date_desc');

    assert.equal(withBackdated[0].id, 'c'); // 2026-11-01
    assert.equal(withBackdated[1].id, 'a'); // 2026-10-30
    assert.equal(withBackdated[2].id, 'd'); // 2026-10-29
    assert.equal(withBackdated[3].id, 'b'); // 2026-10-28
  });

  // 10. Changing sort order does not modify transaction records or timestamps
  test('10. Changing sort order does not modify transaction records or immutable timestamps', () => {
    const originalRecordedAt = '2026-10-30T14:22:10.500Z';
    const originalCreatedAt = '2026-10-30T14:22:15.000Z';
    const item = makeTxn({
      id: 'imm-1',
      transaction_date: '2026-10-30',
      recorded_at: originalRecordedAt,
      created_at: originalCreatedAt,
    });

    const frozenItem = Object.freeze({ ...item });
    const list = [frozenItem];

    // Sorting must not mutate records
    const sortedDesc = sortLedgerTransactions(list, 'date_desc');
    assert.equal(sortedDesc[0].recorded_at, originalRecordedAt);
    assert.equal(sortedDesc[0].created_at, originalCreatedAt);

    const sortedAsc = sortLedgerTransactions(list, 'date_asc');
    assert.equal(sortedAsc[0].recorded_at, originalRecordedAt);
    assert.equal(sortedAsc[0].created_at, originalCreatedAt);
  });

  // 11. An explicitly selected preference is preserved during normal navigation
  test('11. An explicitly selected preference is preserved and restored from localStorage', () => {
    // User explicitly selects 'date_asc'
    storageMap.set(LEDGER_SORT_STORAGE_KEY, 'date_asc');
    assert.equal(getInitialLedgerSortPreference(), 'date_asc');

    // User explicitly selects 'amount_desc'
    storageMap.set(LEDGER_SORT_STORAGE_KEY, 'amount_desc');
    assert.equal(getInitialLedgerSortPreference(), 'amount_desc');

    // Invalid preference gracefully falls back to 'date_desc'
    storageMap.set(LEDGER_SORT_STORAGE_KEY, 'corrupted_value');
    assert.equal(getInitialLedgerSortPreference(), 'date_desc');
  });
});
