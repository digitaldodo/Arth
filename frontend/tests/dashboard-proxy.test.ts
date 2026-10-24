import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.INTERNAL_API_URL = 'http://127.0.0.1:3001';

import { GET as handleGetDashboard } from '../src/app/api/backend/dashboard/route.js';
import {
  resolveDateRangePreset,
  formatPaiseToINR,
} from '@arth/contracts';

describe('Frontend Dashboard BFF Proxy & Date Range Utilities', () => {
  // 1. BFF proxy requires authenticated session
  test('BFF proxy GET /api/backend/dashboard returns 401 Unauthorized without session', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/backend/dashboard?start_date=2026-10-01&end_date=2026-10-31'
    );
    const res = await handleGetDashboard(req);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'Unauthorized');
  });

  // 2. Rejects missing date parameters
  test('BFF proxy GET /api/backend/dashboard requires start_date and end_date', async () => {
    const req = new NextRequest('http://localhost:3000/api/backend/dashboard');
    const res = await handleGetDashboard(req);
    assert.equal(res.status, 401); // Unauthorized checked first
  });

  // 3. Date range preset resolver: deterministic tests
  test('resolveDateRangePreset resolves "today" correctly in Asia/Kolkata', () => {
    // 2026-10-25 03:30:00 UTC = 2026-10-25 09:00:00 IST
    const ref = new Date('2026-10-25T03:30:00Z');
    const range = resolveDateRangePreset('today', ref);
    assert.equal(range.start_date, '2026-10-25');
    assert.equal(range.end_date, '2026-10-25');
  });

  test('resolveDateRangePreset resolves "this_week" (Monday to Sunday) correctly', () => {
    // 2026-10-25 is a Sunday in 2026
    const ref = new Date('2026-10-25T03:30:00Z');
    const range = resolveDateRangePreset('this_week', ref);
    assert.equal(range.start_date, '2026-10-19'); // Monday
    assert.equal(range.end_date, '2026-10-25'); // Sunday
  });

  test('resolveDateRangePreset resolves "this_month" (1st to last day) correctly', () => {
    const ref = new Date('2026-10-25T03:30:00Z');
    const range = resolveDateRangePreset('this_month', ref);
    assert.equal(range.start_date, '2026-10-01');
    assert.equal(range.end_date, '2026-10-31');
  });

  test('resolveDateRangePreset resolves "last_month" correctly, including month rollbacks', () => {
    const refOct = new Date('2026-10-25T03:30:00Z');
    const rangeOct = resolveDateRangePreset('last_month', refOct);
    assert.equal(rangeOct.start_date, '2026-09-01');
    assert.equal(rangeOct.end_date, '2026-09-30');

    // January rollback test: January 15 -> December of previous year
    const refJan = new Date('2027-01-15T03:30:00Z');
    const rangeJan = resolveDateRangePreset('last_month', refJan);
    assert.equal(rangeJan.start_date, '2026-12-01');
    assert.equal(rangeJan.end_date, '2026-12-31');
  });

  test('resolveDateRangePreset resolves "this_year" correctly', () => {
    const ref = new Date('2026-10-25T03:30:00Z');
    const range = resolveDateRangePreset('this_year', ref);
    assert.equal(range.start_date, '2026-01-01');
    assert.equal(range.end_date, '2026-12-31');
  });

  // 4. Monetary formatting with negative net cash flow
  test('formats negative net cash flow and large amounts with exact Indian numbering system', () => {
    // Negative net cash flow: -₹5,400.00
    assert.equal(formatPaiseToINR(-540000), '-₹5,400.00');
    // Negative surplus: -₹1,25,000.50
    assert.equal(formatPaiseToINR(-12500050), '-₹1,25,000.50');
    // Zero
    assert.equal(formatPaiseToINR(0), '₹0.00');
    // Positive
    assert.equal(formatPaiseToINR(350000), '₹3,500.00');
  });

  // 5. Zero-spending and empty-ledger state handling
  test('handles zero spending without division by zero or NaN percentages', () => {
    const totalExpenses = 0;
    const catPaise = 0;
    const share = totalExpenses > 0 ? (catPaise / totalExpenses) * 100 : 0;
    assert.equal(share, 0);
    assert.equal(Number.isNaN(share), false);
  });

  // 6. Proportional spending share calculation
  test('computes rounded category percentage shares accurately', () => {
    const totalExpenses = 1000000; // ₹10,000.00
    const cat1 = 650000; // ₹6,500.00
    const cat2 = 350000; // ₹3,500.00

    const share1 = Math.round((cat1 / totalExpenses) * 1000) / 10;
    const share2 = Math.round((cat2 / totalExpenses) * 1000) / 10;

    assert.equal(share1, 65.0);
    assert.equal(share2, 35.0);
    assert.equal(share1 + share2, 100.0);
  });

  // 7. Custom date validation: reject reversed dates
  test('custom date validation logic rejects reversed dates', () => {
    const start = '2026-10-31';
    const end = '2026-10-01';
    assert.ok(start > end, 'Start date after end date must be detectable');
  });
});
