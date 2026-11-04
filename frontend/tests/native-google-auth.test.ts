import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-public-anon-key';

import { POST, GET } from '../src/app/api/native/auth/google/route.js';

test('POST /api/native/auth/google returns 400 if id_token is missing', async () => {
  const req = new Request('http://localhost:3000/api/native/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const res = await POST(req);
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.error, 'id_token is required');
});

test('POST /api/native/auth/google returns 401 when token verification fails', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url: RequestInfo | URL) => {
      if (url.toString().includes('/auth/v1/token')) {
        return new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid ID token' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('{}', { status: 200 });
    };

    const req = new Request('http://localhost:3000/api/native/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_token: 'invalid.google.token' }),
    });
    const res = await POST(req);
    assert.equal(res.status, 401);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('POST /api/native/auth/google returns session tokens on successful validation', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url: RequestInfo | URL) => {
      if (url.toString().includes('/auth/v1/token')) {
        return new Response(
          JSON.stringify({
            access_token: 'auth-jwt-access-token-12345',
            token_type: 'bearer',
            expires_in: 3600,
            refresh_token: 'auth-jwt-refresh-token-67890',
            user: {
              id: '018f0000-0000-7000-8000-000000000001',
              email: 'user@example.com',
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      return new Response('{}', { status: 200 });
    };

    const req = new Request('http://localhost:3000/api/native/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_token: 'valid.google.id.token' }),
    });
    const res = await POST(req);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.access_token, 'auth-jwt-access-token-12345');
    assert.equal(data.refresh_token, 'auth-jwt-refresh-token-67890');
    assert.equal(data.user.id, '018f0000-0000-7000-8000-000000000001');
    assert.equal(data.user.email, 'user@example.com');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('GET /api/native/auth/google initiates browser OAuth redirect fallback', async () => {
  const req = new Request('http://localhost:3000/api/native/auth/google', {
    method: 'GET',
    headers: { host: 'localhost:3000' },
  });
  const res = await GET(req);
  assert.equal(res.status, 307);
  const location = res.headers.get('location');
  assert.ok(location);
  assert.ok(location.includes('provider=google'));
});
