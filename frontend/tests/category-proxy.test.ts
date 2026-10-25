import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.INTERNAL_API_URL = 'http://127.0.0.1:3001';

import {
  GET as handleGetCategories,
  POST as handlePostCategory,
  PUT as handlePutReorder,
} from '../src/app/api/backend/categories/route.js';
import { PATCH as handlePatchCategory } from '../src/app/api/backend/categories/[id]/route.js';
import { PATCH as handlePatchArchive } from '../src/app/api/backend/categories/[id]/archive/route.js';

describe('Frontend Category Proxy Authentication & Handlers', () => {
  test('BFF proxy GET /api/backend/categories returns 401 Unauthorized without session', async () => {
    const req = new NextRequest('http://localhost:3000/api/backend/categories?type=expense&include_archived=true');
    const res = await handleGetCategories(req);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'Unauthorized');
  });

  test('BFF proxy POST /api/backend/categories returns 401 Unauthorized without session', async () => {
    const req = new NextRequest('http://localhost:3000/api/backend/categories', {
      method: 'POST',
      body: JSON.stringify({ name: 'Subscriptions', type: 'expense' }),
    });
    const res = await handlePostCategory(req);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'Unauthorized');
  });

  test('BFF proxy PUT /api/backend/categories returns 401 Unauthorized without session', async () => {
    const req = new NextRequest('http://localhost:3000/api/backend/categories', {
      method: 'PUT',
      body: JSON.stringify({
        type: 'expense',
        category_ids: ['00000000-0000-7000-8000-000000000001'],
      }),
    });
    const res = await handlePutReorder(req);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'Unauthorized');
  });

  test('BFF proxy PATCH /api/backend/categories/[id] returns 401 Unauthorized without session', async () => {
    const req = new NextRequest('http://localhost:3000/api/backend/categories/00000000-0000-7000-8000-000000000001', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Renamed Category' }),
    });
    const params = Promise.resolve({ id: '00000000-0000-7000-8000-000000000001' });
    const res = await handlePatchCategory(req, { params });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'Unauthorized');
  });

  test('BFF proxy PATCH /api/backend/categories/[id]/archive returns 401 Unauthorized without session', async () => {
    const req = new NextRequest('http://localhost:3000/api/backend/categories/00000000-0000-7000-8000-000000000001/archive', {
      method: 'PATCH',
      body: JSON.stringify({ archived: true }),
    });
    const params = Promise.resolve({ id: '00000000-0000-7000-8000-000000000001' });
    const res = await handlePatchArchive(req, { params });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'Unauthorized');
  });

  test('BFF proxy PUT /api/backend/categories forwards valid authenticated reorder request to backend', async () => {
    const originalFetch = globalThis.fetch;
    let backendPayload: Record<string, unknown> | null = null;
    let authHeader: string | null = null;

    try {
      (globalThis as unknown as { __mockCookies?: { name: string; value: string }[] }).__mockCookies = [
        {
          name: 'sb-127-auth-token',
          value: JSON.stringify({
            access_token: 'valid.mock.reorder.jwt',
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
            JSON.stringify({ id: '00000000-0000-7000-8000-000000000001', email: 'user@example.com' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (urlStr.includes('/api/v1/categories/reorder')) {
          authHeader = (opts?.headers as Record<string, string>)?.Authorization || null;
          backendPayload = JSON.parse(opts?.body as string);
          return new Response(
            JSON.stringify({
              categories: [
                { id: '00000000-0000-7000-8000-000000000002', name: 'Transport', sort_order: 1 },
                { id: '00000000-0000-7000-8000-000000000001', name: 'Food', sort_order: 2 },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return originalFetch(url, opts);
      };

      const req = new NextRequest('http://localhost:3000/api/backend/categories', {
        method: 'PUT',
        body: JSON.stringify({
          type: 'expense',
          category_ids: [
            '00000000-0000-7000-8000-000000000002',
            '00000000-0000-7000-8000-000000000001',
          ],
        }),
      });

      const res = await handlePutReorder(req);
      assert.equal(res.status, 200);
      assert.equal(authHeader, 'Bearer valid.mock.reorder.jwt');
      assert.ok(backendPayload);
      assert.equal((backendPayload as Record<string, unknown>).type, 'expense');
      const body = await res.json();
      assert.equal(body.categories.length, 2);
      assert.equal(body.categories[0].name, 'Transport');
    } finally {
      delete (globalThis as unknown as { __mockCookies?: unknown }).__mockCookies;
      globalThis.fetch = originalFetch;
    }
  });

  test('BFF proxy PUT /api/backend/categories forwards 400 Bad Request error from backend with message', async () => {
    const originalFetch = globalThis.fetch;

    try {
      (globalThis as unknown as { __mockCookies?: { name: string; value: string }[] }).__mockCookies = [
        {
          name: 'sb-127-auth-token',
          value: JSON.stringify({
            access_token: 'valid.mock.reorder.jwt',
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
            JSON.stringify({ id: '00000000-0000-7000-8000-000000000001', email: 'user@example.com' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (urlStr.includes('/api/v1/categories/reorder')) {
          return new Response(
            JSON.stringify({
              statusCode: 400,
              error: 'Bad Request',
              message: 'Category IDs list must contain all active categories of the specified type',
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return originalFetch(url, opts);
      };

      const req = new NextRequest('http://localhost:3000/api/backend/categories', {
        method: 'PUT',
        body: JSON.stringify({
          type: 'expense',
          category_ids: ['00000000-0000-7000-8000-000000000001'],
        }),
      });

      const res = await handlePutReorder(req);
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.statusCode, 400);
      assert.match(body.message, /must contain all active categories/);
    } finally {
      delete (globalThis as unknown as { __mockCookies?: unknown }).__mockCookies;
      globalThis.fetch = originalFetch;
    }
  });
});
