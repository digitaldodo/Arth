import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDateRangePreset } from '@arth/contracts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Dashboard Lifetime Date Range & Month-Rollover Empty-State Suite', () => {
  const dashboardPagePath = path.resolve(__dirname, '../src/features/dashboard/DashboardPage.tsx');
  const dateRangeSelectorPath = path.resolve(__dirname, '../src/features/dashboard/DateRangeSelector.tsx');
  const contractsPath = path.resolve(__dirname, '../../packages/contracts/src/dashboard.ts');
  const bffDashboardPath = path.resolve(__dirname, '../src/app/api/backend/dashboard/route.ts');

  // 1. Contracts & Resolver
  test('resolveDateRangePreset("lifetime") returns undefined bounds for unrestricted historical aggregation', () => {
    const range = resolveDateRangePreset('lifetime');
    assert.equal(range.start_date, undefined);
    assert.equal(range.end_date, undefined);
  });

  test('contracts export DashboardDateRangePreset with "lifetime" included', () => {
    const contractsCode = fs.readFileSync(contractsPath, 'utf-8');
    assert.ok(contractsCode.includes("'lifetime'"), 'Must include lifetime preset in contracts');
  });

  // 2. DateRangeSelector Component
  test('DateRangeSelector places Lifetime first in preset pills and displays "All Time" caption', () => {
    const selectorCode = fs.readFileSync(dateRangeSelectorPath, 'utf-8');
    assert.ok(
      selectorCode.includes("{ id: 'lifetime', label: 'Lifetime' }"),
      'Must define Lifetime as a preset'
    );
    const presetsIndex = selectorCode.indexOf('const PRESETS:');
    const lifetimeIndex = selectorCode.indexOf("'lifetime'", presetsIndex);
    const thisMonthIndex = selectorCode.indexOf("'this_month'", presetsIndex);
    assert.ok(
      lifetimeIndex < thisMonthIndex,
      'Lifetime must appear first before This Month in the presets array'
    );
    assert.ok(
      selectorCode.includes("'All Time'"),
      'Must display "All Time" caption when Lifetime is selected or when bounds are empty'
    );
  });

  // 3. DashboardPage Defaults & Root Cause Fix
  test('DashboardPage defaults to "lifetime" preset and unrestricted date bounds', () => {
    const pageCode = fs.readFileSync(dashboardPagePath, 'utf-8');
    assert.ok(
      pageCode.includes("useState<DashboardDateRangePreset>('lifetime')"),
      'DashboardPage must initialize preset state to "lifetime"'
    );
    assert.ok(
      pageCode.includes("resolveDateRangePreset('lifetime')"),
      'DashboardPage must initialize dateRange state using lifetime preset'
    );
  });

  test('Dashboard offline calculation correctly separates range count from lifetime active count', () => {
    const pageCode = fs.readFileSync(dashboardPagePath, 'utf-8');
    assert.ok(
      pageCode.includes('total_active_transaction_count: transactions.length'),
      'total_active_transaction_count must reflect lifetime count (transactions.length), never inRange.length'
    );
    assert.ok(
      pageCode.includes('has_activity_in_range: inRange.length > 0'),
      'has_activity_in_range must accurately indicate if any transactions exist within selected bounds'
    );
  });

  // 4. Onboarding vs Month-Rollover Empty State Invariants
  test('Case A: Brand new account with 0 lifetime transactions shows Welcome to Arth onboarding card', () => {
    const pageCode = fs.readFileSync(dashboardPagePath, 'utf-8');
    assert.ok(
      pageCode.includes('summary.total_active_transaction_count === 0'),
      'Must check total_active_transaction_count === 0 for initial onboarding'
    );
    assert.ok(
      pageCode.includes('Welcome to Arth'),
      'Onboarding card must display Welcome to Arth'
    );
    assert.ok(
      pageCode.includes('Add your first transaction'),
      'Onboarding card must offer Add your first transaction action'
    );
  });

  test('Case B: Existing account with transactions in other periods displays contextual empty-period card with 3 actions', () => {
    const pageCode = fs.readFileSync(dashboardPagePath, 'utf-8');
    assert.ok(
      pageCode.includes('summary.total_active_transaction_count > 0 && !summary.has_activity_in_range'),
      'Must display Case B card when lifetime transactions exist but none fall in selected period'
    );
    assert.ok(
      pageCode.includes('preset === \'this_month\' ? \'No transactions this month\' : \'No transactions in this period\''),
      'Must show contextual heading tailored to the selected period'
    );
    assert.ok(
      pageCode.includes('You recorded transactions previously, but none fall within the selected period.'),
      'Must explain that previous transactions exist outside the selected period'
    );
    assert.ok(
      pageCode.includes('View Lifetime Activity'),
      'Must offer "View Lifetime Activity" action button'
    );
    assert.ok(
      pageCode.includes("handleSelectPreset('lifetime')"),
      '"View Lifetime Activity" must switch preset to lifetime'
    );
    assert.ok(
      pageCode.includes('Change Date Range'),
      'Must offer "Change Date Range" action button'
    );
    assert.ok(
      pageCode.includes('+ Add Transaction'),
      'Must offer "+ Add Transaction" action button'
    );
  });

  test('Case D & E: Skeletons during loading and error banner on failure without flashing onboarding card', () => {
    const pageCode = fs.readFileSync(dashboardPagePath, 'utf-8');
    assert.ok(
      pageCode.includes('{loading && !summary && <DashboardSkeleton />}'),
      'Must render DashboardSkeleton during loading when no summary is loaded'
    );
    assert.ok(
      pageCode.includes('{error && !isAuthError && !summary && !isPwa && ('),
      'Must render error alert on failure without rendering onboarding card'
    );
  });

  // 5. Account Balances Independence
  test('Account balances remain live and independent of analytics date filter', () => {
    const pageCode = fs.readFileSync(dashboardPagePath, 'utf-8');
    assert.ok(
      pageCode.includes('fetchBalances()'),
      'Account balances must be fetched from dedicated live balance endpoint'
    );
    assert.ok(
      pageCode.includes('<BalanceCard'),
      'DashboardPage must render BalanceCard independently with balances state'
    );
  });

  // 6. BFF Proxy Route Nullable Dates Support
  test('BFF proxy /api/backend/dashboard allows omitted date parameters for Lifetime queries', () => {
    const bffCode = fs.readFileSync(bffDashboardPath, 'utf-8');
    assert.ok(
      !bffCode.includes("message: 'start_date and end_date query parameters are required'"),
      'Must not require start_date and end_date parameters'
    );
    assert.ok(
      bffCode.includes('targetUrl = queryString'),
      'Must proxy without query string when parameters are omitted'
    );
  });
});
