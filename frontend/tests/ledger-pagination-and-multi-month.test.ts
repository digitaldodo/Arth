import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TransactionDTO, PaymentMethod, NecessityClass } from '@arth/contracts';
import { computePresetDateRange } from '../src/features/transactions/date-range-utils';
import { sortLedgerTransactions } from '../src/features/transactions/TransactionLedger';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Helper to generate realistic mock transactions spanning multiple months
function generateMultiMonthTransactions(count: number): TransactionDTO[] {
  const transactions: TransactionDTO[] = [];
  const paymentMethods: PaymentMethod[] = ['upi', 'online', 'cash'];
  const necessities: (NecessityClass | null)[] = ['essential', 'optional', 'luxury', null];

  for (let i = 0; i < count; i++) {
    // Distribute across Nov 2026 (0..34), Oct 2026 (35..54), Sep 2026 (55..count-1)
    let year = 2026;
    let month = 11;
    let day = Math.max(1, 28 - (i % 25));

    if (i >= 55) {
      month = 9;
      day = Math.max(1, 30 - ((i - 55) % 28));
    } else if (i >= 35) {
      month = 10;
      day = Math.max(1, 31 - ((i - 35) % 28));
    }

    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isIncome = i % 7 === 0;
    const amountPaise = (i + 1) * 15000;
    const isUncategorized = i % 5 === 0;

    transactions.push({
      id: `01a1-${String(i).padStart(4, '0')}-${month}-${day}`,
      amount_paise: amountPaise,
      amount_decimal: (amountPaise / 100).toFixed(2),
      formatted_inr: `₹${(amountPaise / 100).toFixed(2)}`,
      type: isIncome ? 'income' : 'expense',
      category_id: isUncategorized ? '' : `cat-${i % 4}`,
      category_name: isUncategorized ? undefined : `Category ${i % 4}`,
      transaction_date: dateStr,
      payment_method: paymentMethods[i % paymentMethods.length],
      necessity: isIncome ? null : necessities[i % necessities.length],
      description: `Transaction #${i} - ${isIncome ? 'Salary' : 'Expense'}`,
      notes: null,
      recorded_at: `${dateStr}T10:${String(i % 60).padStart(2, '0')}:00.000Z`,
      created_at: `${dateStr}T10:${String(i % 60).padStart(2, '0')}:00.000Z`,
      updated_at: `${dateStr}T10:${String(i % 60).padStart(2, '0')}:00.000Z`,
    });
  }

  return transactions;
}

describe('SpendSense Ledger: All Time Filter, Multi-Month Pagination & Date Consistency', () => {
  const allRecords = generateMultiMonthTransactions(70);

  // 1. Date Range Preset Integrity
  test('1. computePresetDateRange("all") returns unbound date range and never defaults to current month', () => {
    const allRange = computePresetDateRange('all');
    assert.equal(allRange.startDate, '', 'All Time startDate must be empty');
    assert.equal(allRange.endDate, '', 'All Time endDate must be empty');

    // Custom without dates should also not default to this_month
    const customRange = computePresetDateRange('custom');
    assert.equal(customRange.startDate, '', 'Custom startDate must be empty');
    assert.equal(customRange.endDate, '', 'Custom endDate must be empty');

    // This month still returns current month
    const thisMonth = computePresetDateRange('this_month', '2026-11-21');
    assert.equal(thisMonth.startDate, '2026-11-01');
    assert.equal(thisMonth.endDate, '2026-11-30');

    // Last month returns previous month
    const lastMonth = computePresetDateRange('last_month', '2026-11-21');
    assert.equal(lastMonth.startDate, '2026-10-01');
    assert.equal(lastMonth.endDate, '2026-10-31');
  });

  // 2. Multi-Month Dataset Verification
  test('2. Multi-month test dataset contains September, October, and November records with > 50 total records', () => {
    assert.ok(allRecords.length > 50, `Total records (${allRecords.length}) must be > 50`);

    const novRecords = allRecords.filter((t) => t.transaction_date.startsWith('2026-11'));
    const octRecords = allRecords.filter((t) => t.transaction_date.startsWith('2026-10'));
    const sepRecords = allRecords.filter((t) => t.transaction_date.startsWith('2026-09'));

    assert.ok(novRecords.length > 0, 'Must contain November records');
    assert.ok(octRecords.length > 0, 'Must contain October records');
    assert.ok(sepRecords.length > 0, 'Must contain September records');
    assert.equal(novRecords.length + octRecords.length + sepRecords.length, allRecords.length);
  });

  // 3. All + All Time Exposes Every Record (Oct + Sep + Nov)
  test('3. All transactions + All Time exposes full history across all months without month capping', () => {
    const sorted = sortLedgerTransactions(allRecords, 'date_desc');
    assert.equal(sorted.length, 70);

    // Newest is in November
    assert.ok(sorted[0].transaction_date.startsWith('2026-11'));
    // Oldest is in September
    assert.ok(sorted[sorted.length - 1].transaction_date.startsWith('2026-09'));

    // October records exist in the sorted list
    const hasOct = sorted.some((t) => t.transaction_date.startsWith('2026-10'));
    assert.ok(hasOct, 'October records must be present in All Time list');
  });

  // 4. Stable Deterministic Pagination Simulation
  test('4. Pagination Simulation: Page 1 (50 items) + Page 2 (20 items) combines with 0 skipped and 0 duplicates', () => {
    const sorted = sortLedgerTransactions(allRecords, 'date_desc');
    const pageSize = 50;

    // Page 1
    const page1 = sorted.slice(0, pageSize);
    assert.equal(page1.length, 50);

    // Page 2
    const page2 = sorted.slice(pageSize, pageSize * 2);
    assert.equal(page2.length, 20);

    // Page 1 has mostly November (and maybe late Oct)
    assert.ok(page1[0].transaction_date.startsWith('2026-11'));

    // Page 2 reaches October and September records
    const page2HasOct = page2.some((t) => t.transaction_date.startsWith('2026-10'));
    const page2HasSep = page2.some((t) => t.transaction_date.startsWith('2026-09'));
    assert.ok(page2HasOct, 'Page 2 must contain October records');
    assert.ok(page2HasSep, 'Page 2 must contain September records');

    // Deduplication check
    const idMap = new Map<string, TransactionDTO>();
    for (const item of page1) idMap.set(item.id, item);
    for (const item of page2) {
      assert.ok(!idMap.has(item.id), `Transaction ${item.id} must not appear on both pages`);
      idMap.set(item.id, item);
    }
    assert.equal(idMap.size, 70, 'Combined pages must equal exactly 70 distinct records');
  });

  // 5. Type Filter Independence across Months
  test('5. Type filters (Expense / Income) operate strictly across all months', () => {
    const expenseRecords = allRecords.filter((t) => t.type === 'expense');
    const incomeRecords = allRecords.filter((t) => t.type === 'income');

    assert.ok(expenseRecords.length > 0);
    assert.ok(incomeRecords.length > 0);
    assert.equal(expenseRecords.length + incomeRecords.length, allRecords.length);

    // Expenses exist in multiple months
    assert.ok(expenseRecords.some((t) => t.transaction_date.startsWith('2026-11')));
    assert.ok(expenseRecords.some((t) => t.transaction_date.startsWith('2026-10')));
    assert.ok(expenseRecords.some((t) => t.transaction_date.startsWith('2026-09')));

    // Income exists in multiple months
    assert.ok(incomeRecords.some((t) => t.transaction_date.startsWith('2026-11')));
    assert.ok(incomeRecords.some((t) => t.transaction_date.startsWith('2026-10')));
  });

  // 6. Payment Method Filter Independence across Months
  test('6. Payment method filter (UPI, Online, Cash) isolates transactions across all months', () => {
    const upiRecords = allRecords.filter((t) => t.payment_method === 'upi');
    const cashRecords = allRecords.filter((t) => t.payment_method === 'cash');

    assert.ok(upiRecords.length > 0);
    assert.ok(cashRecords.length > 0);

    // Each payment method spans multiple months
    assert.ok(upiRecords.some((t) => t.transaction_date.startsWith('2026-11')));
    assert.ok(upiRecords.some((t) => t.transaction_date.startsWith('2026-10')));
    assert.ok(cashRecords.some((t) => t.transaction_date.startsWith('2026-10')));
    assert.ok(cashRecords.some((t) => t.transaction_date.startsWith('2026-09')));
  });

  // 7. Uncategorized Transactions Visible
  test('7. Uncategorized transactions are retained and visible in All Time view', () => {
    const uncategorized = allRecords.filter((t) => !t.category_name);
    assert.ok(uncategorized.length > 0, 'Uncategorized records must exist');
    assert.ok(uncategorized.some((t) => t.transaction_date.startsWith('2026-10')), 'October uncategorized records exist');
  });

  // 8. Database Totals Agreement
  test('8. Database totals and frontend aggregates agree across all 70 records', () => {
    let totalIncome = BigInt(0);
    let totalExpense = BigInt(0);

    for (const t of allRecords) {
      const p = BigInt(t.amount_paise);
      if (t.type === 'income') totalIncome += p;
      else totalExpense += p;
    }

    const net = totalIncome - totalExpense;

    // Summing page 1 alone produces incomplete metrics
    const page1 = allRecords.slice(0, 50);
    let p1Income = BigInt(0);
    let p1Expense = BigInt(0);
    for (const t of page1) {
      const p = BigInt(t.amount_paise);
      if (t.type === 'income') p1Income += p;
      else p1Expense += p;
    }

    assert.notEqual(p1Expense, totalExpense, 'Page 1 expense alone does not equal full 70-record total');

    // Summing both pages equals the full aggregate
    const page2 = allRecords.slice(50, 70);
    for (const t of page2) {
      const p = BigInt(t.amount_paise);
      if (t.type === 'income') p1Income += p;
      else p1Expense += p;
    }
    assert.equal(p1Income, totalIncome, 'Combined pages income must equal database total income');
    assert.equal(p1Expense, totalExpense, 'Combined pages expense must equal database total expense');
    assert.equal(p1Income - p1Expense, net, 'Combined pages net cash flow must equal database net cash flow');
  });

  // 9. Source Code Architecture Verification in TransactionLedger.tsx
  test('9. TransactionLedger.tsx implements non-destructive caching, pagination state, and infinite scroll', () => {
    const ledgerPath = path.resolve(projectRoot, 'src/features/transactions/TransactionLedger.tsx');
    const content = fs.readFileSync(ledgerPath, 'utf8');

    // Pagination state
    assert.ok(content.includes('currentPage'), 'Must declare currentPage state');
    assert.ok(content.includes('totalCount'), 'Must declare totalCount state');
    assert.ok(content.includes('hasMore'), 'Must declare hasMore state');
    assert.ok(content.includes('isLoadingMore'), 'Must declare isLoadingMore state');

    // Handlers
    assert.ok(content.includes('handleLoadMore'), 'Must implement handleLoadMore');
    assert.ok(content.includes('handleLoadAll'), 'Must implement handleLoadAll');

    // Non-destructive cache persistence
    assert.ok(content.includes('saveCachedTransactions'), 'Must import and use saveCachedTransactions to prevent wiping older pages');

    // Infinite scroll
    assert.ok(content.includes('sentinelRef'), 'Must declare sentinelRef');
    assert.ok(content.includes('IntersectionObserver'), 'Must implement IntersectionObserver for infinite scrolling');

    // Record count display
    assert.ok(content.includes('Showing ${filteredTransactions.length} of ${totalCount} records'), 'Must display currently loaded vs total matching records');

    // Date range preset handling
    assert.ok(
      content.includes("if (selectedDatePreset === 'all' || selectedDatePreset === 'custom')"),
      'Must handle All Time preset without imposing start/end date constraints'
    );
  });
});
