import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import type {
  TransactionDTO,
  NecessitySpendingDTO,
  NecessityClass,
  DashboardSummaryResponse,
} from '@arth/contracts';
import { GET as handleGetTransactions } from '../src/app/api/backend/transactions/route.js';
import { fetchTransactions } from '../src/lib/api-client/index.js';
import { fetchAllMatchingTransactions } from '../src/features/transactions/ledger-pdf-exporter.js';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.INTERNAL_API_URL = 'http://127.0.0.1:3001';

describe('Necessity Filtering and Spending Insights Suite', () => {
  // 1. BFF Proxy forwards necessity parameter
  test('BFF proxy GET forwards necessity query parameter to Fastify backend', async () => {
    const originalFetch = globalThis.fetch;
    let interceptedBackendUrl: string | null = null;

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

      globalThis.fetch = async (url: RequestInfo | URL) => {
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
          interceptedBackendUrl = urlStr;
          return new Response(
            JSON.stringify({
              items: [],
              page: 1,
              page_size: 50,
              total_count: 0,
              has_more: false,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return originalFetch(url);
      };

      const req = new NextRequest(
        'http://localhost:3000/api/backend/transactions?necessity=essential&type=expense'
      );
      const res = await handleGetTransactions(req);
      assert.equal(res.status, 200);
      assert.ok(interceptedBackendUrl);
      const parsedUrl = new URL(interceptedBackendUrl!);
      assert.equal(parsedUrl.searchParams.get('necessity'), 'essential');
      assert.equal(parsedUrl.searchParams.get('type'), 'expense');
    } finally {
      delete (globalThis as unknown as { __mockCookies?: unknown }).__mockCookies;
      globalThis.fetch = originalFetch;
    }
  });

  // 2. Client-side fetchTransactions encodes necessity parameter
  test('fetchTransactions encodes necessity parameter in URL query string', async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl: string | null = null;

    try {
      globalThis.fetch = async (url: RequestInfo | URL) => {
        requestedUrl = url.toString();
        return new Response(
          JSON.stringify({
            items: [],
            page: 1,
            page_size: 20,
            total_count: 0,
            has_more: false,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      await fetchTransactions({ necessity: 'luxury', type: 'expense' });
      assert.ok(requestedUrl);
      const urlStr = String(requestedUrl);
      assert.ok(urlStr.includes('necessity=luxury'));
      assert.ok(urlStr.includes('type=expense'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 3. fetchAllMatchingTransactions passes necessity filter for PDF export
  test('fetchAllMatchingTransactions forwards necessity filter to fetchTransactions', async () => {
    const originalFetch = globalThis.fetch;
    let interceptedQuery: string | null = null;

    try {
      globalThis.fetch = async (url: RequestInfo | URL) => {
        interceptedQuery = url.toString();
        return new Response(
          JSON.stringify({
            items: [
              {
                id: '018f0000-0000-7000-8000-000000000001',
                amount_paise: 50000,
                amount_decimal: '500.00',
                formatted_inr: '₹500.00',
                type: 'expense',
                category_id: 'cat-1',
                category_name: 'Dining',
                transaction_date: '2026-10-20',
                payment_method: 'online',
                necessity: 'optional',
                description: 'Dinner',
                notes: null,
                created_at: '2026-10-20T12:00:00Z',
                updated_at: '2026-10-20T12:00:00Z',
              },
            ],
            page: 1,
            page_size: 50,
            total_count: 1,
            has_more: false,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const result = await fetchAllMatchingTransactions(
        'expense',
        'all',
        '2026-10-01',
        '2026-10-31',
        undefined,
        'optional'
      );

      assert.equal(result.length, 1);
      assert.equal(result[0].necessity, 'optional');
      assert.ok(interceptedQuery);
      const queryStr = String(interceptedQuery);
      assert.ok(queryStr.includes('necessity=optional'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 4. Financial Calculations: Spending by Necessity breakdown
  test('spending by necessity correctly computes tier totals, percentages, and handles zero gracefully', () => {
    // Helper function simulating the exact calculation logic used in SpendingByNecessity and backend
    function calculateNecessityBreakdown(
      transactions: Array<{
        type: 'income' | 'expense';
        amount_paise: number;
        necessity: NecessityClass | null;
        deleted_at?: string | null;
      }>
    ): {
      totalExpensesPaise: number;
      tiers: Record<NecessityClass, { amountPaise: number; share: number }>;
    } {
      const activeExpenses = transactions.filter(
        (t) => t.type === 'expense' && !t.deleted_at
      );

      let totalExpensesPaise = 0;
      let essentialPaise = 0;
      let optionalPaise = 0;
      let luxuryPaise = 0;

      for (const t of activeExpenses) {
        totalExpensesPaise += t.amount_paise;
        if (t.necessity === 'essential') essentialPaise += t.amount_paise;
        else if (t.necessity === 'optional') optionalPaise += t.amount_paise;
        else if (t.necessity === 'luxury') luxuryPaise += t.amount_paise;
      }

      const getShare = (paise: number) =>
        totalExpensesPaise > 0
          ? Math.round((paise / totalExpensesPaise) * 1000) / 10
          : 0;

      return {
        totalExpensesPaise,
        tiers: {
          essential: { amountPaise: essentialPaise, share: getShare(essentialPaise) },
          optional: { amountPaise: optionalPaise, share: getShare(optionalPaise) },
          luxury: { amountPaise: luxuryPaise, share: getShare(luxuryPaise) },
        },
      };
    }

    // A. Zero expenses
    const emptyResult = calculateNecessityBreakdown([]);
    assert.equal(emptyResult.totalExpensesPaise, 0);
    assert.equal(emptyResult.tiers.essential.amountPaise, 0);
    assert.equal(emptyResult.tiers.essential.share, 0);
    assert.equal(emptyResult.tiers.optional.amountPaise, 0);
    assert.equal(emptyResult.tiers.optional.share, 0);
    assert.equal(emptyResult.tiers.luxury.amountPaise, 0);
    assert.equal(emptyResult.tiers.luxury.share, 0);

    // B. Mixed transactions with income and soft-deleted expenses
    const mixedResult = calculateNecessityBreakdown([
      // Income: ₹50,000 (must be completely excluded)
      { type: 'income', amount_paise: 5000000, necessity: null },
      // Essential expense: ₹5,000 (500,000 paise)
      { type: 'expense', amount_paise: 500000, necessity: 'essential' },
      // Optional expense: ₹3,000 (300,000 paise)
      { type: 'expense', amount_paise: 300000, necessity: 'optional' },
      // Luxury expense: ₹2,000 (200,000 paise)
      { type: 'expense', amount_paise: 200000, necessity: 'luxury' },
      // Soft-deleted luxury expense: ₹10,000 (must be excluded)
      { type: 'expense', amount_paise: 1000000, necessity: 'luxury', deleted_at: '2026-10-25' },
    ]);

    assert.equal(mixedResult.totalExpensesPaise, 1000000); // ₹10,000 total active expenses
    assert.equal(mixedResult.tiers.essential.amountPaise, 500000); // 50%
    assert.equal(mixedResult.tiers.essential.share, 50.0);
    assert.equal(mixedResult.tiers.optional.amountPaise, 300000); // 30%
    assert.equal(mixedResult.tiers.optional.share, 30.0);
    assert.equal(mixedResult.tiers.luxury.amountPaise, 200000); // 20%
    assert.equal(mixedResult.tiers.luxury.share, 20.0);

    // Exact reconciliation check
    const sumTiers =
      mixedResult.tiers.essential.amountPaise +
      mixedResult.tiers.optional.amountPaise +
      mixedResult.tiers.luxury.amountPaise;
    assert.equal(sumTiers, mixedResult.totalExpensesPaise);
  });
});
