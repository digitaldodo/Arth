import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-public-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

import { POST as loginPost } from '../src/app/api/native/auth/login/route.js';
import { POST as forgotPasswordPost } from '../src/app/api/native/auth/forgot-password/route.js';
import { POST as signupPost } from '../src/app/api/native/auth/signup/route.js';

test('POST /api/native/auth/login accepts username and resolves email', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
      const u = url.toString();
      if (u.includes('fn_get_email_by_username')) {
        return new Response(JSON.stringify('rahul@example.com'), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (u.includes('/auth/v1/token')) {
        return new Response(
          JSON.stringify({
            access_token: 'valid-access-token',
            token_type: 'bearer',
            expires_in: 3600,
            refresh_token: 'valid-refresh-token',
            user: { id: '018f0000-0000-7000-8000-000000000001', email: 'rahul@example.com' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('{}', { status: 200 });
    };

    const req = new Request('http://localhost:3000/api/native/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'rahul_sharma', password: 'secretpassword123' }),
    });

    const res = await loginPost(req);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.user.email, 'rahul@example.com');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('POST /api/native/auth/login rejects unknown username with generic 401', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url: RequestInfo | URL) => {
      if (url.toString().includes('fn_get_email_by_username')) {
        return new Response(JSON.stringify(null), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('{}', { status: 200 });
    };

    const req = new Request('http://localhost:3000/api/native/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'nonexistent_user', password: 'secretpassword123' }),
    });

    const res = await loginPost(req);
    assert.equal(res.status, 401);
    const data = await res.json();
    assert.match(data.error, /Invalid email, username, or password/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('POST /api/native/auth/forgot-password returns uniform success message', async () => {
  const req = new Request('http://localhost:3000/api/native/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', host: 'localhost:3000' },
    body: JSON.stringify({ identifier: 'user@example.com' }),
  });

  const res = await forgotPasswordPost(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.message.includes('password reset link has been dispatched'));
});

test('POST /api/native/auth/signup validates password length and username format', async () => {
  const reqShortPass = new Request('http://localhost:3000/api/native/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'user@example.com', password: '123' }),
  });
  const resShortPass = await signupPost(reqShortPass);
  assert.equal(resShortPass.status, 400);

  const reqInvalidUser = new Request('http://localhost:3000/api/native/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'user@example.com', password: 'password1234', username: 'a!' }),
  });
  const resInvalidUser = await signupPost(reqInvalidUser);
  assert.equal(resInvalidUser.status, 400);
});
