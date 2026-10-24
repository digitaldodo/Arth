import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.INTERNAL_API_URL = 'http://127.0.0.1:3001';

import {
  POST as handlePostTransaction,
  GET as handleGetTransactions,
} from '../src/app/api/backend/transactions/route.js';
import { GET as handleGetCategories } from '../src/app/api/backend/categories/route.js';
import { parseINRToPaise, formatPaiseToINR, getTodayIST } from '../src/lib/format.js';

describe('Frontend Transaction Proxy & Utilities', () => {
  test('BFF proxy POST /api/backend/transactions returns 401 Unauthorized when unauthenticated', async () => {
    const req = new NextRequest('http://localhost:3000/api/backend/transactions', {
      method: 'POST',
      body: JSON.stringify({ amount: '250.00' }),
    });

    const res = await handlePostTransaction(req);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'Unauthorized');
  });

  test('BFF proxy GET /api/backend/transactions returns 401 Unauthorized when unauthenticated', async () => {
    const req = new NextRequest('http://localhost:3000/api/backend/transactions?page=1');
    const res = await handleGetTransactions(req);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'Unauthorized');
  });

  test('BFF proxy GET /api/backend/categories returns 401 Unauthorized when unauthenticated', async () => {
    const req = new NextRequest('http://localhost:3000/api/backend/categories?type=expense');
    const res = await handleGetCategories(req);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'Unauthorized');
  });

  test('getTodayIST returns valid YYYY-MM-DD date in Asia/Kolkata timezone', () => {
    const today = getTodayIST();
    assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
    const [year, month, day] = today.split('-').map(Number);
    assert.ok(year >= 2024);
    assert.ok(month >= 1 && month <= 12);
    assert.ok(day >= 1 && day <= 31);
  });

  test('frontend formatPaiseToINR formats with exact Indian numbering system', () => {
    assert.equal(formatPaiseToINR(BigInt(145000)), '₹1,450.00');
    assert.equal(formatPaiseToINR(25050), '₹250.50');
    assert.equal(formatPaiseToINR(BigInt(1000000000)), '₹1,00,00,000.00'); // 1 crore
  });

  test('frontend parseINRToPaise converts exact inputs to paise', () => {
    assert.equal(parseINRToPaise('250'), BigInt(25000));
    assert.equal(parseINRToPaise('250.5'), BigInt(25050));
    assert.equal(parseINRToPaise('250.50'), BigInt(25050));
    assert.equal(parseINRToPaise('0.01'), BigInt(1));
  });
});
