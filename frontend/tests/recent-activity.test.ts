import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { TransactionDTO } from '@arth/contracts';
import { RecentActivity } from '../src/features/dashboard/RecentActivity';
import { getLatestRecentTransactions } from '../src/features/dashboard/recent-transactions';

function tx(
  id: string,
  date: string,
  createdAt: string,
  description = id
): TransactionDTO {
  return {
    id,
    amount_paise: 12345,
    amount_decimal: '123.45',
    formatted_inr: '₹123.45',
    type: 'expense',
    category_id: 'cat-food',
    category_name: 'Food',
    transaction_date: date,
    payment_method: 'cash',
    necessity: 'essential',
    description,
    notes: null,
    recorded_at: createdAt,
    created_at: createdAt,
    updated_at: createdAt,
  };
}

describe('Dashboard Recent Activity preview', () => {
  it('shows only the three latest transactions, sorted by date then creation time then id', () => {
    const records = [
      tx('oldest', '2026-10-01', '2026-10-01T10:00:00.000Z'),
      tx('tie-a', '2026-10-29', '2026-10-29T10:00:00.000Z'),
      tx('new-date', '2026-10-30', '2026-10-30T09:00:00.000Z'),
      tx('tie-c', '2026-10-29', '2026-10-29T11:00:00.000Z'),
      tx('tie-b', '2026-10-29', '2026-10-29T11:00:00.000Z'),
    ];
    const latest = getLatestRecentTransactions(records);
    assert.deepEqual(latest.map((item) => item.id), ['new-date', 'tie-c', 'tie-b']);
    assert.equal(records.length, 5, 'sorting does not mutate the dashboard response');

    const html = renderToStaticMarkup(React.createElement(RecentActivity, {
      transactions: records,
      expanded: false,
      onToggleExpanded: () => {},
    }));
    assert.match(html, /new-date/);
    assert.match(html, /tie-c/);
    assert.match(html, /tie-b/);
    assert.doesNotMatch(html, /oldest|tie-a/);
    assert.equal((html.match(/flex min-w-0 items-center justify-between gap-3 py-3/g) || []).length, 3);
    assert.match(html, /₹123\.45/);
    assert.match(html, /Food/);
    assert.match(html, /cash/);
    assert.match(html, /View more transactions/);
    assert.doesNotMatch(html, /absolute|pointer-events-none/);
  });

  it('handles exactly three, fewer than three, and no transactions', () => {
    const exactlyThree = [
      tx('a', '2026-10-01', '2026-10-01T09:00:00.000Z'),
      tx('b', '2026-10-02', '2026-10-02T09:00:00.000Z'),
      tx('c', '2026-10-03', '2026-10-03T09:00:00.000Z'),
    ];
    assert.equal(getLatestRecentTransactions(exactlyThree).length, 3);
    assert.equal(getLatestRecentTransactions(exactlyThree.slice(0, 2)).length, 2);
    assert.deepEqual(getLatestRecentTransactions([]), []);

    const emptyHtml = renderToStaticMarkup(React.createElement(RecentActivity, {
      transactions: [],
      expanded: false,
      onToggleExpanded: () => {},
    }));
    assert.match(emptyHtml, /No transactions recorded in this period/);
    assert.doesNotMatch(emptyHtml, /View more transactions|View less/);
    const shortListHtml = renderToStaticMarkup(React.createElement(RecentActivity, {
      transactions: exactlyThree.slice(0, 2),
      expanded: false,
      onToggleExpanded: () => {},
    }));
    assert.doesNotMatch(shortListHtml, /View more transactions|View less/);
  });

  it('keeps the expansion action after the rows and connects drill-down to ledger filters', () => {
    const componentPath = path.resolve(__dirname, '../src/features/dashboard/RecentActivity.tsx');
    const dashboardPath = path.resolve(__dirname, '../src/features/dashboard/DashboardPage.tsx');
    const compositionPath = path.resolve(__dirname, '../src/features/dashboard/SpendingComposition.tsx');
    const necessityPath = path.resolve(__dirname, '../src/features/dashboard/SpendingByNecessity.tsx');
    const shellPath = path.resolve(__dirname, '../src/features/transactions/TransactionAppShell.tsx');
    const component = fs.readFileSync(componentPath, 'utf8');
    const dashboard = fs.readFileSync(dashboardPath, 'utf8');
    const composition = fs.readFileSync(compositionPath, 'utf8');
    const necessity = fs.readFileSync(necessityPath, 'utf8');
    const shell = fs.readFileSync(shellPath, 'utf8');
    assert.ok(component.indexOf('View more transactions') > component.indexOf('visibleTransactions.map'));
    assert.match(component, /min-h-10 cursor-pointer/);
    assert.match(component, /focus-visible:ring-2/);
    assert.match(dashboard, /grid-cols-1 items-stretch gap-6 md:grid-cols-2 lg:grid-cols-3/);
    assert.match(dashboard, /expandedList/);
    assert.match(composition, /categories\.slice\(0, 3\)/);
    assert.match(necessity, /NECESSITY_TIERS/);
    assert.match(shell, /onOpenFilteredLedger=/);
    assert.match(shell, /initialFilter=\{ledgerInitialFilter\}/);
    assert.match(component, /mt-auto min-h-10 cursor-pointer border-t/);
    assert.doesNotMatch(component, /absolute|mt-auto lg:pb/);
  });
});
