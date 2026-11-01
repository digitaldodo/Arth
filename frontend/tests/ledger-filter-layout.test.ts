import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Ledger Mobile-First Filter Layout & UX Suite', () => {
  const ledgerPath = path.resolve(__dirname, '../src/features/transactions/TransactionLedger.tsx');

  test('Group A: Transaction Type segmented control is on its own row with full touch targets', () => {
    const code = fs.readFileSync(ledgerPath, 'utf-8');
    assert.ok(
      code.includes('Group A — Transaction Type Segmented Control'),
      'Must contain Group A transaction type segmented control'
    );
    assert.ok(
      code.includes("aria-label=\"Filter by transaction type\""),
      'Must contain accessible label for type segmented control'
    );
    assert.ok(
      code.includes('min-h-[38px]'),
      'Buttons must have adequate touch height targets'
    );
  });

  test('Group B: Category dropdown is on its own dedicated full-width row', () => {
    const code = fs.readFileSync(ledgerPath, 'utf-8');
    assert.ok(
      code.includes('Group B — Category Dropdown'),
      'Must contain Group B category row'
    );
    assert.ok(
      code.includes('aria-label="Filter by category"'),
      'Category select must be accessible'
    );
    assert.ok(
      code.includes('w-full h-10'),
      'Category select must occupy full available width with consistent height'
    );
  });

  test('Group C: Additional filters use responsive 2-column mobile and 4-column desktop grid', () => {
    const code = fs.readFileSync(ledgerPath, 'utf-8');
    assert.ok(
      code.includes('grid grid-cols-2 lg:grid-cols-4 gap-2.5 w-full'),
      'Must arrange additional filters into a 2-column mobile and 4-column desktop grid'
    );
    assert.ok(
      code.includes('aria-label="Filter by necessity"'),
      'Must include necessity filter select'
    );
    assert.ok(
      code.includes('aria-label="Filter by payment method"'),
      'Must include payment method filter select'
    );
    assert.ok(
      code.includes('aria-label="Filter by statement date period"'),
      'Must include date range select'
    );
    assert.ok(
      code.includes('aria-label="Sort transaction ordering"'),
      'Must include sort order select'
    );
    assert.ok(
      code.includes('aria-label="Previous month"'),
      'Must include previous month navigation button'
    );
    assert.ok(
      code.includes('aria-label="Next month"'),
      'Must include next month navigation button'
    );
  });

  test('Group D: Search on its own full-width row with clean separated action buttons', () => {
    const code = fs.readFileSync(ledgerPath, 'utf-8');
    assert.ok(
      code.includes('Group D — Search Input and Actions'),
      'Must contain Group D search and actions section'
    );
    assert.ok(
      code.includes('placeholder="Search description, category, notes, or amount..."'),
      'Must have full-width search input'
    );
    assert.ok(
      code.includes('setIsExportDialogOpen(true)'),
      'Must have PDF Download action button'
    );
    assert.ok(
      code.includes('+ Record Entry'),
      'Must have Record Entry button'
    );
    assert.ok(
      code.includes('Reset filters'),
      'Must offer quick Reset filters action when any filter is active'
    );
  });
});
