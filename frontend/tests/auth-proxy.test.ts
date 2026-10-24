import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Set minimal test environment placeholders before importing routes
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.INTERNAL_API_URL = 'http://127.0.0.1:3001';

import { GET as handleCallback } from '../src/app/auth/callback/route.js';
import { GET as handleProxyMe } from '../src/app/api/backend/auth/me/route.js';

describe('Frontend Auth & BFF Proxy Security', () => {
  test('Callback route handles OAuth provider error by redirecting to /login', async () => {
    const req = new Request(
      'http://localhost:3000/auth/callback?error=access_denied&error_description=User+cancelled+sign+in'
    );

    const res = await handleCallback(req);

    assert.equal(res.status, 307);
    const location = res.headers.get('location') || res.headers.get('Location');
    assert.ok(location);
    assert.ok(location.includes('/login?error='));
  });

  test('Callback route rejects missing authorization code', async () => {
    const req = new Request('http://localhost:3000/auth/callback');

    const res = await handleCallback(req);

    assert.equal(res.status, 307);
    const location = res.headers.get('location') || res.headers.get('Location');
    assert.ok(location);
    assert.ok(location.includes('/login?error=missing_authorization_code'));
  });

  test('Callback route sanitizes open redirect URLs', async () => {
    const req = new Request(
      'http://localhost:3000/auth/callback?error=provider_error&next=//attacker.com'
    );

    const res = await handleCallback(req);

    assert.equal(res.status, 307);
    const location = res.headers.get('location') || res.headers.get('Location');
    assert.ok(location);
    // Must redirect to local /login, not external origin
    assert.ok(location.startsWith('http://localhost:3000/login'));
  });

  test('BFF proxy GET /api/backend/auth/me returns 401 Unauthorized when unauthenticated', async () => {
    // Calling without active session cookie
    const res = await handleProxyMe();

    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'Unauthorized');
    assert.equal(body.message, 'Active session required');
  });
});
