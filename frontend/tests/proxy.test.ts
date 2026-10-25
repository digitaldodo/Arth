import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

// Set test environment placeholders
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import { proxy, config } from '../src/proxy.js';

describe('Next.js 16 Network Boundary Proxy (proxy.ts)', () => {
  test('config matcher defines pattern excluding static assets', () => {
    assert.ok(Array.isArray(config.matcher));
    assert.equal(config.matcher.length, 1);
    const pattern = config.matcher[0];
    assert.ok(pattern.includes('_next/static'));
    assert.ok(pattern.includes('_next/image'));
    assert.ok(pattern.includes('favicon.ico'));
    assert.ok(pattern.includes('manifest.webmanifest'));
  });

  test('proxy executes on incoming request and calls Supabase getUser to refresh session', async () => {
    const originalFetch = globalThis.fetch;
    let authEndpointCalled = false;

    try {
      globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
        const urlStr = url.toString();
        if (urlStr.includes('/auth/v1/user')) {
          authEndpointCalled = true;
          return new Response(
            JSON.stringify({
              id: '00000000-0000-7000-8000-000000000001',
              email: 'user@example.com',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return originalFetch(url, opts);
      };

      const session = {
        access_token: 'header.payload.signature',
        refresh_token: 'valid-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: '00000000-0000-7000-8000-000000000001', email: 'user@example.com' },
      };

      const req = new NextRequest('http://localhost:3000/api/backend/dashboard', {
        headers: {
          cookie: `sb-127-auth-token=${encodeURIComponent(JSON.stringify(session))}`,
        },
      });

      const res = await proxy(req);
      assert.ok(res);
      assert.equal(authEndpointCalled, true, 'Proxy must validate and refresh user session via auth.getUser()');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('proxy gracefully handles unauthenticated requests without throwing', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
        const urlStr = url.toString();
        if (urlStr.includes('/auth/v1/user')) {
          return new Response(
            JSON.stringify({ error: 'invalid_jwt', message: 'No authorization header' }),
            { status: 401, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return originalFetch(url, opts);
      };

      const req = new NextRequest('http://localhost:3000/login');
      const res = await proxy(req);
      assert.ok(res);
      assert.equal(res.status, 200);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
