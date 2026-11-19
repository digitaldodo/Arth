import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Set test environment placeholders
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.INTERNAL_API_URL = 'http://127.0.0.1:3001';

import {
  signInWithEmailAction,
  signUpWithEmailAction,
  checkUsernameAvailabilityAction,
  resolveEmailFromUsername,
} from '../src/app/login/actions';
import { sanitizeUserFacingError } from '../src/lib/error-utils';
import { safeBackendErrorResponse } from '../src/lib/server-config';

describe('Critical Incident: Authentication Recovery, Username Uniqueness & Data Integrity', () => {
  // ---------------------------------------------------------------------------
  // 1. Fail-Closed Username Availability & Registration Uniqueness
  // ---------------------------------------------------------------------------
  describe('1. Fail-Closed Username Availability & Registration', () => {
    test('RPC error during username availability check FAILS CLOSED and aborts registration', async () => {
      const originalFetch = globalThis.fetch;
      let signUpCalled = false;

      try {
        globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
          const urlStr = url.toString();
          if (urlStr.includes('/rest/v1/rpc/fn_check_username_available')) {
            // Simulate network / database RPC error
            return new Response(JSON.stringify({ message: 'fetch failed: connection refused' }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          if (urlStr.includes('/auth/v1/signup')) {
            signUpCalled = true;
            return new Response(JSON.stringify({ error: 'should not be called' }), { status: 400 });
          }
          return originalFetch(url, opts);
        };

        const formData = new FormData();
        formData.set('username', 'target_handle');
        formData.set('email', 'new_user@example.com');
        formData.set('password', 'ValidPass123!');
        formData.set('confirmPassword', 'ValidPass123!');

        const res = await signUpWithEmailAction(formData);

        assert.equal(signUpCalled, false, 'Registration must NEVER proceed to signUp when availability check fails');
        assert.ok(res.error, 'Must return error response');
        assert.ok(
          res.error.includes('connect to Arth') || res.error.includes('Unable to connect'),
          `Error must be user-friendly connection guidance, got: ${res.error}`
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('Network failure (TypeError: fetch failed) during availability check fails closed cleanly', async () => {
      const originalFetch = globalThis.fetch;
      let signUpCalled = false;

      try {
        globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
          const urlStr = url.toString();
          if (urlStr.includes('/rest/v1/rpc/fn_check_username_available')) {
            throw new TypeError('fetch failed');
          }
          if (urlStr.includes('/auth/v1/signup')) {
            signUpCalled = true;
          }
          return originalFetch(url, opts);
        };

        const formData = new FormData();
        formData.set('username', 'existing_user');
        formData.set('email', 'new_user@example.com');
        formData.set('password', 'ValidPass123!');
        formData.set('confirmPassword', 'ValidPass123!');

        const res = await signUpWithEmailAction(formData);

        assert.equal(signUpCalled, false, 'Must not proceed when network fails');
        assert.ok(!res.error?.includes('TypeError'), 'Must not leak TypeError');
        assert.ok(!res.error?.includes('fetch failed'), 'Must not leak raw fetch failed');
        assert.ok(
          res.error?.includes('connect to Arth') || res.error?.includes('Unable to connect'),
          `Got: ${res.error}`
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('Occupied username is rejected with standard guidance', async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
          const urlStr = url.toString();
          if (urlStr.includes('/rest/v1/rpc/fn_check_username_available')) {
            return new Response(JSON.stringify(false), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          return originalFetch(url, opts);
        };

        const formData = new FormData();
        formData.set('username', 'AnshGupta');
        formData.set('email', 'attacker@example.com');
        formData.set('password', 'Password123!');
        formData.set('confirmPassword', 'Password123!');

        const res = await signUpWithEmailAction(formData);
        assert.equal(res.error, 'This username is already taken. Please choose another username.');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('Case-insensitive and whitespace duplicate username attempts are normalized and rejected', async () => {
      const originalFetch = globalThis.fetch;
      let probedUsername = '';

      try {
        globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
          const urlStr = url.toString();
          if (urlStr.includes('/rest/v1/rpc/fn_check_username_available')) {
            const body = typeof opts?.body === 'string' ? JSON.parse(opts.body) : {};
            probedUsername = body.p_username;
            return new Response(JSON.stringify(false), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          return originalFetch(url, opts);
        };

        const formData = new FormData();
        formData.set('username', '  ANSHGUPTA  ');
        formData.set('email', 'test@example.com');
        formData.set('password', 'Password123!');
        formData.set('confirmPassword', 'Password123!');

        const res = await signUpWithEmailAction(formData);
        assert.equal(probedUsername, 'anshgupta', 'Must trim whitespace and lowercase username');
        assert.equal(res.error, 'This username is already taken. Please choose another username.');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('Concurrent database unique constraint violation (23505) returns actionable error', async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
          const urlStr = url.toString();
          if (urlStr.includes('/rest/v1/rpc/fn_check_username_available')) {
            // Race condition: availability check succeeded before the other request committed
            return new Response(JSON.stringify(true), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          if (urlStr.includes('/auth/v1/signup')) {
            // Database trigger aborted transaction with 23505 unique violation
            return new Response(
              JSON.stringify({
                code: '23505',
                message: 'duplicate key value violates unique constraint "uq_profiles_lower_username"',
              }),
              { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
          }
          return originalFetch(url, opts);
        };

        const formData = new FormData();
        formData.set('username', 'race_condition_user');
        formData.set('email', 'racer@example.com');
        formData.set('password', 'Password123!');
        formData.set('confirmPassword', 'Password123!');

        const res = await signUpWithEmailAction(formData);
        assert.equal(
          res.error,
          'This username is already taken. Please choose another username.',
          'Database 23505 collision must be translated into user guidance'
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Existing Users Login & Session Restoration
  // ---------------------------------------------------------------------------
  describe('2. Existing Users Login & Session Restoration', () => {
    test('Existing user can sign in with verified username and password', async () => {
      const originalFetch = globalThis.fetch;
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

      try {
        globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
          const urlStr = url.toString();
          if (urlStr.includes('/rest/v1/rpc/fn_get_email_by_username')) {
            return new Response(JSON.stringify('verified_owner@example.com'), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          if (urlStr.includes('/auth/v1/token?grant_type=password')) {
            return new Response(
              JSON.stringify({
                access_token: 'auth-token-user-1',
                refresh_token: 'refresh-token-user-1',
                expires_in: 3600,
                token_type: 'bearer',
                user: {
                  id: '018f0000-0000-7000-8000-000000000001',
                  email: 'verified_owner@example.com',
                  user_metadata: { username: 'owner_user', has_password: true },
                },
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
          return originalFetch(url, opts);
        };

        const formData = new FormData();
        formData.set('identifier', 'owner_user');
        formData.set('password', 'CorrectPassword123!');

        const res = await signInWithEmailAction(formData);
        assert.equal(res.success, true);
        assert.equal(res.redirectUrl, '/');
      } finally {
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;
        globalThis.fetch = originalFetch;
      }
    });

    test('Existing user can sign in with registered email address', async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
          const urlStr = url.toString();
          if (urlStr.includes('/auth/v1/token?grant_type=password')) {
            return new Response(
              JSON.stringify({
                access_token: 'auth-token-user-2',
                refresh_token: 'refresh-token-user-2',
                expires_in: 3600,
                token_type: 'bearer',
                user: {
                  id: '018f0000-0000-7000-8000-000000000002',
                  email: 'user2@example.com',
                  user_metadata: { username: 'user2', has_password: true },
                },
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
          return originalFetch(url, opts);
        };

        const formData = new FormData();
        formData.set('identifier', 'user2@example.com');
        formData.set('password', 'CorrectPassword123!');

        const res = await signInWithEmailAction(formData);
        assert.equal(res.success, true);
        assert.equal(res.redirectUrl, '/');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('Session expiry error is cleanly translated into sign-in prompt', () => {
      const expiredErrors = [
        'JWT expired',
        'Your authentication session has ended.',
        'expired_session',
        'session has expired',
      ];
      for (const err of expiredErrors) {
        assert.equal(
          sanitizeUserFacingError(err),
          'Your session has expired. Please sign in again.',
          `Failed for error: ${err}`
        );
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Error Sanitization & Masking of Low-Level Network Regressions
  // ---------------------------------------------------------------------------
  describe('3. Error Sanitization & Zero Raw Error Leakage', () => {
    test('Node.js native TypeError: fetch failed is NEVER displayed raw', () => {
      const rawError = new TypeError('fetch failed');
      const sanitized = sanitizeUserFacingError(rawError);
      assert.ok(!sanitized.includes('fetch failed'), 'Must never show fetch failed');
      assert.equal(
        sanitized,
        'Unable to connect to the server. Please check your internet connection and try again.'
      );
    });

    test('Connection refused ECONNREFUSED is sanitized', () => {
      const connError = new Error('connect ECONNREFUSED 127.0.0.1:54321');
      assert.equal(
        sanitizeUserFacingError(connError),
        'Unable to connect to the server. Please check your internet connection and try again.'
      );
    });

    test('DNS failure ENOTFOUND is sanitized', () => {
      const dnsError = new Error('getaddrinfo ENOTFOUND fbmmkqdwkayrrsodueqd.supabase.co');
      assert.equal(
        sanitizeUserFacingError(dnsError),
        'Unable to connect to the server. Please check your internet connection and try again.'
      );
    });

    test('Backend 502 Bad Gateway response does not leak internal IPs or tokens', async () => {
      const internalError = new Error('connect ECONNREFUSED 10.0.0.15:3001 with auth_token=secret_123');
      const res = safeBackendErrorResponse(internalError, 'TestProxy');
      assert.equal(res.status, 502);

      const data = await res.json();
      assert.equal(data.statusCode, 502);
      assert.equal(data.error, 'Bad Gateway');
      assert.equal(data.message, 'Backend service is currently unavailable. Please try again shortly.');

      const jsonStr = JSON.stringify(data);
      assert.ok(!jsonStr.includes('10.0.0.15'), 'Must not leak IP');
      assert.ok(!jsonStr.includes('secret_123'), 'Must not leak token');
    });

    test('PostgREST schema cache and SQL syntax errors are masked with default fallback', () => {
      const pgrstError = 'PGRST202: Could not find the function public.fn_account_balances in the schema cache';
      assert.equal(
        sanitizeUserFacingError(pgrstError),
        'An unexpected error occurred. Please try again.'
      );

      const sqlSyntax = 'syntax error at or near "SELECT" in PostgreSQL';
      assert.equal(
        sanitizeUserFacingError(sqlSyntax),
        'An unexpected error occurred. Please try again.'
      );
    });
  });
});
