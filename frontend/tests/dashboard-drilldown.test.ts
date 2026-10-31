import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CategorySpendingDTO, NecessitySpendingDTO } from '@arth/contracts';
import { SpendingComposition } from '../src/features/dashboard/SpendingComposition';
import { SpendingByNecessity } from '../src/features/dashboard/SpendingByNecessity';

describe('dashboard spending drill-down', () => {
  it('renders category rows as accessible buttons carrying category identifiers to the selection callback', () => {
    const category: CategorySpendingDTO = {
      category_id: 'stable-category-id',
      category_name: 'Food & Dining',
      category_color: '#123456',
      category_icon: null,
      amount_paise: 12500,
      formatted_inr: '₹125.00',
      share_percentage: 25,
    };
    const markup = renderToStaticMarkup(React.createElement(SpendingComposition, {
      categories: [category],
      totalExpensesPaise: 50000,
      expanded: false,
      onSelectCategory: () => {},
      onToggleExpanded: () => {},
    }));
    assert.match(markup, /<button[^>]*aria-label="View Food &amp; Dining transactions, ₹125\.00, 25% of expenses"/);
    assert.match(markup, /Food &amp; Dining/);
    assert.match(markup, /25%/);
    assert.match(markup, /₹125\.00/);
    const component = fs.readFileSync(path.resolve(__dirname, '../src/features/dashboard/SpendingComposition.tsx'), 'utf8');
    assert.match(component, /onSelectCategory\(cat\)/);
  });

  it('limits category rows to three and only offers expansion when actual categories exceed three', () => {
    const categories = Array.from({ length: 4 }, (_, index): CategorySpendingDTO => ({
      category_id: `category-${index}`,
      category_name: `Category ${index}`,
      category_color: null,
      category_icon: null,
      amount_paise: 1000,
      formatted_inr: '₹10.00',
      share_percentage: 25,
    }));
    const markup = renderToStaticMarkup(React.createElement(SpendingComposition, {
      categories,
      totalExpensesPaise: 4000,
      expanded: false,
      onSelectCategory: () => {},
      onToggleExpanded: () => {},
    }));
    assert.equal((markup.match(/aria-label="View Category \d transactions/g) || []).length, 3);
    assert.match(markup, /View more/);
  });

  it('uses only the three supported necessity values and computes each share from expenses', () => {
    const items: NecessitySpendingDTO[] = [
      { necessity: 'essential', label: 'Essential', amount_paise: 5000, formatted_inr: '₹50.00', share_percentage: 50 },
      { necessity: 'optional', label: 'Optional', amount_paise: 3000, formatted_inr: '₹30.00', share_percentage: 30 },
      { necessity: 'luxury', label: 'Luxury', amount_paise: 2000, formatted_inr: '₹20.00', share_percentage: 20 },
    ];
    const markup = renderToStaticMarkup(React.createElement(SpendingByNecessity, {
      items,
      totalExpensesPaise: 10000,
      onSelectNecessity: () => {},
    }));
    assert.equal((markup.match(/aria-label="View (?:Essential|Optional|Luxury) transactions/g) || []).length, 3);
    assert.match(markup, /50%/);
    assert.match(markup, /30%/);
    assert.match(markup, /20%/);
    assert.doesNotMatch(markup, /View more|View less/);
    assert.deepEqual(items.map((item) => item.necessity), ['essential', 'optional', 'luxury']);
  });

  it('passes stable category IDs, supported necessity filters, and the dashboard date range to the ledger', () => {
    const dashboard = fs.readFileSync(path.resolve(__dirname, '../src/features/dashboard/DashboardPage.tsx'), 'utf8');
    const shell = fs.readFileSync(path.resolve(__dirname, '../src/features/transactions/TransactionAppShell.tsx'), 'utf8');
    const ledger = fs.readFileSync(path.resolve(__dirname, '../src/features/transactions/TransactionLedger.tsx'), 'utf8');
    const transactionService = fs.readFileSync(path.resolve(__dirname, '../../backend/src/modules/transactions/transaction.service.ts'), 'utf8');
    assert.match(dashboard, /categoryId: category\.category_id/);
    assert.match(dashboard, /necessity,/);
    assert.match(dashboard, /startDate: dateRange\.start_date/);
    assert.match(dashboard, /endDate: dateRange\.end_date/);
    assert.match(shell, /setLedgerInitialFilter\(filter\)/);
    assert.match(ledger, /category_id: selectedCategory === 'all' \? undefined : selectedCategory/);
    assert.match(ledger, /selectedType !== 'income' && selectedNecessity !== 'all' \? selectedNecessity : undefined/);
    assert.match(ledger, /fetchTransactions\(queryParams\)/);
    assert.match(transactionService, /getScopedClient\(token\)/);
    assert.match(transactionService, /\.from\('transactions'\)/);
  });
});
