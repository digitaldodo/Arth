import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  computePresetDateRange,
  formatDateRangeLabel,
  isValidDateRange,
} from '../src/features/transactions/date-range-utils';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Flexible Ledger PDF Export: Date Range Presets & Validation', () => {
  test('this_month computes 1st to last day of current month', () => {
    // Test for October (31 days)
    const rangeOct = computePresetDateRange('this_month', '2026-10-25');
    assert.equal(rangeOct.startDate, '2026-10-01');
    assert.equal(rangeOct.endDate, '2026-10-31');

    // Test for April (30 days)
    const rangeApr = computePresetDateRange('this_month', '2026-04-15');
    assert.equal(rangeApr.startDate, '2026-04-01');
    assert.equal(rangeApr.endDate, '2026-04-30');
  });

  test('handles February in leap year and non-leap year correctly', () => {
    // 2024 is a leap year (Feb has 29 days)
    const leapFeb = computePresetDateRange('this_month', '2024-02-10');
    assert.equal(leapFeb.startDate, '2024-02-01');
    assert.equal(leapFeb.endDate, '2024-02-29');

    // 2026 is non-leap year (Feb has 28 days)
    const nonLeapFeb = computePresetDateRange('this_month', '2026-02-10');
    assert.equal(nonLeapFeb.startDate, '2026-02-01');
    assert.equal(nonLeapFeb.endDate, '2026-02-28');
  });

  test('today and yesterday presets compute exact single day boundaries', () => {
    const today = computePresetDateRange('today', '2026-10-25');
    assert.equal(today.startDate, '2026-10-25');
    assert.equal(today.endDate, '2026-10-25');

    const yesterday = computePresetDateRange('yesterday', '2026-10-25');
    assert.equal(yesterday.startDate, '2026-10-24');
    assert.equal(yesterday.endDate, '2026-10-24');

    // Month boundary for yesterday (1st of month -> last of previous month)
    const monthBoundary = computePresetDateRange('yesterday', '2026-10-01');
    assert.equal(monthBoundary.startDate, '2026-09-30');
    assert.equal(monthBoundary.endDate, '2026-09-30');

    // Year boundary for yesterday (Jan 1 -> Dec 31 of previous year)
    const yearBoundary = computePresetDateRange('yesterday', '2026-01-01');
    assert.equal(yearBoundary.startDate, '2025-12-31');
    assert.equal(yearBoundary.endDate, '2025-12-31');
  });

  test('this_week and last_week compute Monday to Sunday ISO weeks', () => {
    // 2026-10-25 is Sunday
    // Week: Monday 2026-10-19 to Sunday 2026-10-25
    const thisWeek = computePresetDateRange('this_week', '2026-10-25');
    assert.equal(thisWeek.startDate, '2026-10-19');
    assert.equal(thisWeek.endDate, '2026-10-25');

    const lastWeek = computePresetDateRange('last_week', '2026-10-25');
    assert.equal(lastWeek.startDate, '2026-10-12');
    assert.equal(lastWeek.endDate, '2026-10-18');
  });

  test('last_month computes previous month across calendar and year boundaries', () => {
    // In October 2026 -> September 2026 (1 to 30)
    const lastMonthOct = computePresetDateRange('last_month', '2026-10-25');
    assert.equal(lastMonthOct.startDate, '2026-09-01');
    assert.equal(lastMonthOct.endDate, '2026-09-30');

    // In March 2026 -> February 2026 (1 to 28)
    const lastMonthMar = computePresetDateRange('last_month', '2026-03-15');
    assert.equal(lastMonthMar.startDate, '2026-02-01');
    assert.equal(lastMonthMar.endDate, '2026-02-28');

    // In January 2026 -> December 2025 (1 to 31)
    const lastMonthJan = computePresetDateRange('last_month', '2026-01-10');
    assert.equal(lastMonthJan.startDate, '2025-12-01');
    assert.equal(lastMonthJan.endDate, '2025-12-31');
  });

  test('this_year computes full year boundaries', () => {
    const rangeYear = computePresetDateRange('this_year', '2026-10-25');
    assert.equal(rangeYear.startDate, '2026-01-01');
    assert.equal(rangeYear.endDate, '2026-12-31');
  });

  test('isValidDateRange validates start_date <= end_date', () => {
    assert.equal(isValidDateRange('2026-10-01', '2026-10-31'), true);
    assert.equal(isValidDateRange('2026-10-15', '2026-10-15'), true);
    assert.equal(isValidDateRange('2026-10-31', '2026-10-01'), false);
    assert.equal(isValidDateRange('', '2026-10-31'), false);
  });

  test('formatDateRangeLabel formats human-readable period string in DD MMM YYYY format', () => {
    const label = formatDateRangeLabel('2026-10-01', '2026-10-31');
    assert.equal(label, '1 Oct 2026 – 31 Oct 2026');

    const singleDay = formatDateRangeLabel('2026-10-25', '2026-10-25');
    assert.equal(singleDay, '25 Oct 2026');
  });

  test('TransactionLedger implements accessible clickable rows with keyboard interaction', () => {
    const ledgerPath = path.resolve(__dirname, '../src/features/transactions/TransactionLedger.tsx');
    const content = fs.readFileSync(ledgerPath, 'utf8');

    // Row must have role="button", tabIndex={0}, and onKeyDown
    assert.ok(content.includes('role="button"'), 'Transaction row must have role="button"');
    assert.ok(content.includes('tabIndex={0}'), 'Transaction row must have tabIndex={0}');
    assert.ok(content.includes('onKeyDown'), 'Transaction row must have onKeyDown listener');
    assert.ok(content.includes('setSelectedTransaction'), 'Row click must set selected transaction');

    // Dialogs & drawers must be integrated
    assert.ok(content.includes('<TransactionDetailDrawer'), 'Must render TransactionDetailDrawer');
    assert.ok(content.includes('<DeleteTransactionModal'), 'Must render DeleteTransactionModal');
    assert.ok(content.includes('<ExportPdfDialog'), 'Must render ExportPdfDialog');
  });

  test('TransactionDetailDrawer displays all transaction fields and offers Edit and Delete', () => {
    const drawerPath = path.resolve(__dirname, '../src/features/transactions/TransactionDetailDrawer.tsx');
    const content = fs.readFileSync(drawerPath, 'utf8');

    assert.ok(content.includes('Transaction Details'), 'Drawer must have header title');
    assert.ok(content.includes('formatted_inr'), 'Drawer must render formatted INR amount');
    assert.ok(content.includes('payment_method'), 'Drawer must render payment method');
    assert.ok(content.includes('necessity'), 'Drawer must render necessity');
    assert.ok(content.includes('formatDateTimeIST'), 'Drawer must format timestamps in IST');
    assert.ok(content.includes('Edit Transaction'), 'Drawer must provide Edit Transaction action');
    assert.ok(content.includes('Delete'), 'Drawer must provide Delete action');
  });

  test('QuickAddModal supports edit mode and updateTransaction API', () => {
    const modalPath = path.resolve(__dirname, '../src/features/transactions/QuickAddModal.tsx');
    const content = fs.readFileSync(modalPath, 'utf8');

    assert.ok(content.includes('editingTransaction'), 'Must support editingTransaction prop');
    assert.ok(content.includes('updateTransaction'), 'Must import and invoke updateTransaction');
    assert.ok(content.includes('Edit Transaction'), 'Must render Edit Transaction title in edit mode');
  });

  test('ExportPdfDialog includes all required presets and mutually exclusive type filters', () => {
    const dialogPath = path.resolve(__dirname, '../src/features/transactions/ExportPdfDialog.tsx');
    const content = fs.readFileSync(dialogPath, 'utf8');

    assert.ok(content.includes('this_month'), 'Must include this_month preset');
    assert.ok(content.includes('today'), 'Must include today preset');
    assert.ok(content.includes('yesterday'), 'Must include yesterday preset');
    assert.ok(content.includes('this_week'), 'Must include this_week preset');
    assert.ok(content.includes('last_week'), 'Must include last_week preset');
    assert.ok(content.includes('last_month'), 'Must include last_month preset');
    assert.ok(content.includes('this_year'), 'Must include this_year preset');
    assert.ok(content.includes('custom'), 'Must include custom range preset');

    assert.ok(content.includes('Both Income & Expense'), 'Must include Both option');
    assert.ok(content.includes('Income Only'), 'Must include Income Only option');
    assert.ok(content.includes('Expense Only'), 'Must include Expense Only option');
    assert.ok(content.includes('Statement Summary Preview'), 'Must render live statement summary preview');
  });
});
