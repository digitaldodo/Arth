import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-public-anon-key';
process.env.INTERNAL_API_URL = 'http://127.0.0.1:3001';

import { GET, POST } from '../src/app/api/native/transactions/route.js';

test('native transaction proxy requires a valid bearer identity before reaching Fastify', async () => {
  const originalFetch = globalThis.fetch;
  let backendCalled = false;
  try {
    globalThis.fetch = async (url: RequestInfo | URL) => {
      if (url.toString().includes('/auth/v1/user')) return new Response(JSON.stringify({ message: 'invalid token' }), { status: 401 });
      backendCalled = true;
      return new Response('{}', { status: 201 });
    };
    const response = await POST(new NextRequest('http://localhost:3000/api/native/transactions', {
      method: 'POST', headers: { Authorization: 'Bearer invalid-token' }, body: JSON.stringify({ amount: '20.00' }),
    }));
    assert.equal(response.status, 401);
    assert.equal(backendCalled, false);
  } finally { globalThis.fetch = originalFetch; }
});

test('native transaction proxy uses the verified bearer token and strips client-supplied ownership', async () => {
  const originalFetch = globalThis.fetch;
  let forwardedAuth = '';
  let forwardedBody: Record<string, unknown> = {};
  try {
    globalThis.fetch = async (url: RequestInfo | URL, options?: RequestInit) => {
      if (url.toString().includes('/auth/v1/user')) {
        assert.equal(new Headers(options?.headers).get('authorization'), 'Bearer native-access-token');
        return new Response(JSON.stringify({ id: '00000000-0000-7000-8000-000000000001' }), { status: 200 });
      }
      forwardedAuth = new Headers(options?.headers).get('authorization') || '';
      forwardedBody = JSON.parse(options?.body as string) as Record<string, unknown>;
      return new Response(JSON.stringify({ message: 'invalid test transaction' }), { status: 400 });
    };
    const response = await POST(new NextRequest('http://localhost:3000/api/native/transactions', {
      method: 'POST',
      headers: { Authorization: 'Bearer native-access-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: '018f0000-0000-7000-8000-000000000001', amount: '20.00', user_id: 'attacker-controlled' }),
    }));
    assert.equal(response.status, 400);
    assert.equal(forwardedAuth, 'Bearer native-access-token');
    assert.equal(Object.hasOwn(forwardedBody, 'user_id'), false);
  } finally { globalThis.fetch = originalFetch; }
});

test('native transaction lookup verifies identity and forwards only bounded supported filters', async () => {
  const originalFetch = globalThis.fetch;
  let backendUrl = '';
  try {
    globalThis.fetch = async (url: RequestInfo | URL) => {
      const value = url.toString();
      if (value.includes('/auth/v1/user')) return new Response(JSON.stringify({ id: '00000000-0000-7000-8000-000000000001' }), { status: 200 });
      backendUrl = value;
      return new Response(JSON.stringify({ items: [], total_count: 0 }), { status: 200 });
    };
    const response = await GET(new NextRequest('http://localhost:3000/api/native/transactions?page=1&page_size=100&type=expense&start_date=2026-10-29&end_date=2026-10-29&user_id=other', {
      headers: { Authorization: 'Bearer native-access-token' },
    }));
    assert.equal(response.status, 200);
    const forwarded = new URL(backendUrl).searchParams;
    assert.equal(forwarded.get('page_size'), '100');
    assert.equal(forwarded.get('start_date'), '2026-10-29');
    assert.equal(forwarded.has('user_id'), false);
  } finally { globalThis.fetch = originalFetch; }
});
