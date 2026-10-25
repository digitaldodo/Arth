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

  test('BFF proxy POST forwards named transaction payload to backend', async () => {
    const originalFetch = globalThis.fetch;
    let backendPayloadReceived: Record<string, unknown> | null = null;

    try {
      (globalThis as unknown as { __mockCookies?: { name: string; value: string }[] }).__mockCookies = [
        {
          name: 'sb-127-auth-token',
          value: JSON.stringify({
            access_token: 'valid.mock.jwt',
            refresh_token: 'mock-refresh',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: { id: '00000000-0000-7000-8000-000000000001', email: 'user@example.com' },
          }),
        },
      ];

      globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
        const urlStr = url.toString();
        if (urlStr.includes('/auth/v1/user')) {
          return new Response(
            JSON.stringify({
              id: '00000000-0000-7000-8000-000000000001',
              email: 'user@example.com',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (urlStr.includes('/api/v1/transactions')) {
          backendPayloadReceived = JSON.parse(opts?.body as string);
          return new Response(
            JSON.stringify({
              transaction: {
                id: '018f0000-0000-7000-8000-000000000001',
                description: 'Lunch with friends',
              },
            }),
            { status: 201, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return originalFetch(url, opts);
      };

      const req = new NextRequest('http://localhost:3000/api/backend/transactions', {
        method: 'POST',
        body: JSON.stringify({
          id: '018f0000-0000-7000-8000-000000000001',
          amount: '450.00',
          type: 'expense',
          category_id: 'cat-1',
          transaction_date: '2026-10-25',
          payment_method: 'online',
          necessity: 'essential',
          description: 'Lunch with friends',
        }),
      });

      const res = await handlePostTransaction(req);
      assert.equal(res.status, 201);
      assert.ok(backendPayloadReceived);
      assert.equal((backendPayloadReceived as Record<string, unknown>).description, 'Lunch with friends');
    } finally {
      delete (globalThis as unknown as { __mockCookies?: unknown }).__mockCookies;
      globalThis.fetch = originalFetch;
    }
  });

  test('BFF proxy POST forwards unnamed transaction payload with null description', async () => {
    const originalFetch = globalThis.fetch;
    let backendPayloadReceived: Record<string, unknown> | null = null;

    try {
      (globalThis as unknown as { __mockCookies?: { name: string; value: string }[] }).__mockCookies = [
        {
          name: 'sb-127-auth-token',
          value: JSON.stringify({
            access_token: 'valid.mock.jwt',
            refresh_token: 'mock-refresh',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: { id: '00000000-0000-7000-8000-000000000001', email: 'user@example.com' },
          }),
        },
      ];

      globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
        const urlStr = url.toString();
        if (urlStr.includes('/auth/v1/user')) {
          return new Response(
            JSON.stringify({
              id: '00000000-0000-7000-8000-000000000001',
              email: 'user@example.com',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (urlStr.includes('/api/v1/transactions')) {
          backendPayloadReceived = JSON.parse(opts?.body as string);
          return new Response(
            JSON.stringify({
              transaction: {
                id: '018f0000-0000-7000-8000-000000000002',
                description: null,
              },
            }),
            { status: 201, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return originalFetch(url, opts);
      };

      const req = new NextRequest('http://localhost:3000/api/backend/transactions', {
        method: 'POST',
        body: JSON.stringify({
          id: '018f0000-0000-7000-8000-000000000002',
          amount: '120.00',
          type: 'expense',
          category_id: 'cat-2',
          transaction_date: '2026-10-25',
          payment_method: 'cash',
          necessity: 'optional',
          description: null,
        }),
      });

      const res = await handlePostTransaction(req);
      assert.equal(res.status, 201);
      assert.ok(backendPayloadReceived);
      assert.equal((backendPayloadReceived as Record<string, unknown>).description, null);
    } finally {
      delete (globalThis as unknown as { __mockCookies?: unknown }).__mockCookies;
      globalThis.fetch = originalFetch;
    }
  });
});
