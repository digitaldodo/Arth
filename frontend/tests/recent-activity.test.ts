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
      onNavigateToLedger: () => {},
    }));
    assert.match(html, /new-date/);
    assert.match(html, /tie-c/);
    assert.match(html, /tie-b/);
    assert.doesNotMatch(html, /oldest|tie-a/);
    assert.equal((html.match(/py-1 lg:py-0\.5 flex min-w-0/g) || []).length, 3);
    assert.match(html, /₹123\.45/);
    assert.match(html, /Food/);
    assert.match(html, /cash/);
    assert.match(html, /lg:absolute/);
    assert.match(html, /backdrop-blur-md/);
    assert.match(html, /pointer-events-none/);
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
      onNavigateToLedger: () => {},
    }));
    assert.match(emptyHtml, /No transactions recorded in this period/);
    assert.match(emptyHtml, /View more transactions/);
    const shortListHtml = renderToStaticMarkup(React.createElement(RecentActivity, {
      transactions: exactlyThree.slice(0, 2),
      onNavigateToLedger: () => {},
    }));
    assert.doesNotMatch(shortListHtml, /lg:absolute/);
  });

  it('keeps the Ledger action last, tappable, keyboard visible, and connected to the shell view state', () => {
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
    assert.ok(component.indexOf('View more transactions') > component.indexOf('latestTransactions.map'));
    assert.match(component, /min-h-11 w-full/);
    assert.match(component, /focus-visible:ring-2/);
    assert.match(component, /active:opacity-70/);
    assert.match(dashboard, /grid-cols-1 md:grid-cols-2 lg:grid-cols-3/);
    assert.match(dashboard, /md:col-span-2 lg:col-span-1/);
    assert.match(composition, /lg:h-full/);
    assert.match(necessity, /lg:h-full/);
    assert.match(shell, /onNavigateToLedger=\{\(\) => setActiveView\('ledger'\)\}/);
  });
});
