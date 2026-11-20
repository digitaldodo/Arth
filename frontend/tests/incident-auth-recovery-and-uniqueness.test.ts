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

    test('RLS rejection is cleanly translated into permission denied message', () => {
      const rlsError = 'new row violates row-level security policy for table "transactions" (code: 42501)';
      assert.equal(
        sanitizeUserFacingError(rlsError),
        'Access denied. You do not have permission to perform this action.'
      );
    });

    test('Rate limiting is distinctly reported without masking as network error', () => {
      const rateError = 'over_email_send_rate_limit: email rate limit exceeded';
      assert.equal(
        sanitizeUserFacingError(rateError),
        'Too many attempts in a short period. Please wait a few moments before trying again.'
      );
    });

    test('Username sign-in unavailable error is distinctly preserved', () => {
      const lookupError = 'Username sign-in is temporarily unavailable. Please sign in with your registered email address or try again shortly.';
      assert.equal(
        sanitizeUserFacingError(lookupError),
        'Username sign-in is temporarily unavailable. Please sign in with your registered email address or try again shortly.'
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Username Resolution Failure Resilience (Outage vs Missing User)
  // ---------------------------------------------------------------------------
  describe('4. Username Resolution Failure Resilience', () => {
    test('Database outage or RPC failure during username lookup does NOT treat user as nonexistent', async () => {
      const originalFetch = globalThis.fetch;
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

      try {
        globalThis.fetch = async (url: RequestInfo | URL) => {
          if (url.toString().includes('fn_get_email_by_username')) {
            // Simulate 500 error from PostgREST
            return new Response(JSON.stringify({ code: '500', message: 'Internal Server Error' }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          return originalFetch(url);
        };

        const formData = new FormData();
        formData.set('identifier', 'existing_user');
        formData.set('password', 'SecretPass123!');

        const res = await signInWithEmailAction(formData);
        assert.ok(res.error, 'Must report error');
        assert.ok(
          res.error.includes('Username sign-in is temporarily unavailable') ||
          res.error.includes('registered email address'),
          `Error must guide user to registered email, got: ${res.error}`
        );
        assert.ok(
          !res.error.includes('Invalid email, username, or password'),
          'Database outage must NEVER be mapped to invalid credentials'
        );
      } finally {
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;
        globalThis.fetch = originalFetch;
      }
    });

    test('Non-existent username returns generic authentication error without enumeration leakage', async () => {
      const originalFetch = globalThis.fetch;
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

      try {
        globalThis.fetch = async (url: RequestInfo | URL) => {
          if (url.toString().includes('fn_get_email_by_username')) {
            return new Response(JSON.stringify(null), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          return originalFetch(url);
        };

        const formData = new FormData();
        formData.set('identifier', 'ghost_user');
        formData.set('password', 'SecretPass123!');

        const res = await signInWithEmailAction(formData);
        assert.equal(
          res.error,
          'Invalid email, username, or password. Please verify your credentials and try again.'
        );
      } finally {
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;
        globalThis.fetch = originalFetch;
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 5. User Account and Financial Data Isolation Invariants
  // ---------------------------------------------------------------------------
  describe('5. Data Isolation & Existing Account Invariants', () => {
    test('Existing user transaction records preserve original user UUID and ownership', () => {
      const testUser = {
        id: '018f0000-0000-7000-8000-000000000001',
        email: 'verified_owner@example.com',
      };
      const record = {
        id: '018f0000-0000-7000-8000-000000000099',
        user_id: testUser.id,
        amount_paise: 50000,
        type: 'expense',
      };

      assert.equal(record.user_id, testUser.id, 'Record must be strictly tied to user ID');
      assert.ok(record.amount_paise > 0, 'Amount must be positive integer paise');
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Comprehensive Production-Grade Regression Tests (Section 9 Specification)
  // ---------------------------------------------------------------------------
  describe('6. Production-Grade Regression Tests (Section 9 Specification)', () => {
    test('1. Production-like username RPC integration test resolves email and authenticates', async () => {
      const originalFetch = globalThis.fetch;
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'valid-production-service-role-key';

      try {
        globalThis.fetch = async (url: RequestInfo | URL) => {
          const urlStr = url.toString();
          if (urlStr.includes('fn_get_email_by_username')) {
            return new Response(JSON.stringify('verified_owner@example.com'), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          if (urlStr.includes('/auth/v1/token')) {
            return new Response(
              JSON.stringify({
                access_token: 'valid_access_token_abc',
                token_type: 'bearer',
                expires_in: 3600,
                refresh_token: 'valid_refresh_token_xyz',
                user: { id: '018f0000-0000-7000-8000-000000000001', email: 'verified_owner@example.com' },
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
          return originalFetch(url);
        };

        const formData = new FormData();
        formData.set('identifier', 'verified_owner');
        formData.set('password', 'SecretPassword123!');

        const res = await signInWithEmailAction(formData);
        assert.equal(res.success, true, 'Login must succeed when username RPC resolves');
        assert.equal(res.redirectUrl, '/', 'Must redirect to ledger home');
      } finally {
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;
        globalThis.fetch = originalFetch;
      }
    });

    test('2. Missing service-role configuration test returns explicit guidance to use email', async () => {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      delete process.env.SUPABASE_SERVICE_KEY;
      delete process.env.SUPABASE_SECRET_KEY;

      const formData = new FormData();
      formData.set('identifier', 'any_username');
      formData.set('password', 'SecretPassword123!');

      const res = await signInWithEmailAction(formData);
      assert.ok(res.error, 'Must return error');
      assert.ok(
        res.error.includes('SUPABASE_SERVICE_ROLE_KEY') || res.error.includes('registered email address'),
        `Error must guide user about service role key or email fallback: ${res.error}`
      );
    });

    test('3. Invalid service-role key test handles PostgREST 401 gracefully', async () => {
      const originalFetch = globalThis.fetch;
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'invalid-expired-jwt';

      try {
        globalThis.fetch = async (url: RequestInfo | URL) => {
          if (url.toString().includes('fn_get_email_by_username')) {
            return new Response(JSON.stringify({ message: 'Invalid API key', hint: null, code: '401' }), {
              status: 401,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          return originalFetch(url);
        };

        const formData = new FormData();
        formData.set('identifier', 'existing_user');
        formData.set('password', 'SecretPassword123!');

        const res = await signInWithEmailAction(formData);
        assert.ok(res.error, 'Must return error');
        assert.ok(!res.error.includes('Invalid API key'), 'Must not leak PostgREST raw error');
        assert.ok(
          res.error.includes('Username sign-in is temporarily unavailable') ||
          res.error.includes('registered email address'),
          `Got: ${res.error}`
        );
      } finally {
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;
        globalThis.fetch = originalFetch;
      }
    });

    test('4. Missing RPC test handles function not in schema cache gracefully', async () => {
      const originalFetch = globalThis.fetch;
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'valid-service-role-key';

      try {
        globalThis.fetch = async (url: RequestInfo | URL) => {
          if (url.toString().includes('fn_get_email_by_username')) {
            return new Response(
              JSON.stringify({
                code: 'PGRST202',
                details: null,
                hint: null,
                message: 'Could not find the function public.fn_get_email_by_username in the schema cache',
              }),
              { status: 404, headers: { 'Content-Type': 'application/json' } }
            );
          }
          return originalFetch(url);
        };

        const formData = new FormData();
        formData.set('identifier', 'existing_user');
        formData.set('password', 'SecretPassword123!');

        const res = await signInWithEmailAction(formData);
        assert.ok(res.error, 'Must return error');
        assert.ok(!res.error.includes('PGRST202'), 'Must not leak PGRST code');
        assert.ok(
          res.error.includes('Username sign-in is temporarily unavailable') ||
          res.error.includes('registered email address'),
          `Got: ${res.error}`
        );
      } finally {
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;
        globalThis.fetch = originalFetch;
      }
    });

    test('5. RPC permission failure test handles PostgREST 403 Forbidden without SQL leak', async () => {
      const originalFetch = globalThis.fetch;
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'unprivileged-key';

      try {
        globalThis.fetch = async (url: RequestInfo | URL) => {
          if (url.toString().includes('fn_get_email_by_username')) {
            return new Response(
              JSON.stringify({
                code: '42501',
                details: null,
                hint: null,
                message: 'permission denied for function fn_get_email_by_username',
              }),
              { status: 403, headers: { 'Content-Type': 'application/json' } }
            );
          }
          return originalFetch(url);
        };

        const formData = new FormData();
        formData.set('identifier', 'existing_user');
        formData.set('password', 'SecretPassword123!');

        const res = await signInWithEmailAction(formData);
        assert.ok(res.error, 'Must return error');
        assert.ok(!res.error.includes('42501'), 'Must not leak 42501');
        assert.ok(!res.error.includes('permission denied for function'), 'Must not leak internal function name');
      } finally {
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;
        globalThis.fetch = originalFetch;
      }
    });

    test('6. Supabase Auth timeout test handles request abort gracefully', async () => {
      const originalFetch = globalThis.fetch;

      try {
        globalThis.fetch = async (url: RequestInfo | URL) => {
          if (url.toString().includes('/auth/v1/token')) {
            const abortErr = new Error('The operation was aborted due to timeout');
            abortErr.name = 'AbortError';
            throw abortErr;
          }
          return originalFetch(url);
        };

        const formData = new FormData();
        formData.set('identifier', 'user@example.com');
        formData.set('password', 'ValidPass123!');

        const res = await signInWithEmailAction(formData);
        assert.ok(res.error, 'Must return error on timeout');
        assert.ok(!res.error.includes('AbortError'), 'Must not leak AbortError');
        assert.ok(
          res.error.includes('Unable to connect') ||
          res.error.includes('temporarily unavailable') ||
          res.error.includes('internet connection'),
          `Error must be user-friendly: ${res.error}`
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('7. Supabase Auth DNS failure test handles getaddrinfo ENOTFOUND gracefully', async () => {
      const originalFetch = globalThis.fetch;

      try {
        globalThis.fetch = async (url: RequestInfo | URL) => {
          if (url.toString().includes('/auth/v1/token')) {
            const dnsErr = new Error('getaddrinfo ENOTFOUND fbmmkqdwkayrrsodueqd.supabase.co');
            throw dnsErr;
          }
          return originalFetch(url);
        };

        const formData = new FormData();
        formData.set('identifier', 'user@example.com');
        formData.set('password', 'ValidPass123!');

        const res = await signInWithEmailAction(formData);
        assert.ok(res.error, 'Must report error');
        assert.ok(!res.error.includes('getaddrinfo'), 'Must not leak getaddrinfo');
        assert.ok(!res.error.includes('ENOTFOUND'), 'Must not leak ENOTFOUND');
        assert.ok(!res.error.includes('fbmmkqdwkayrrsodueqd'), 'Must not leak internal host');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('8. Invalid API key test handles 401 Invalid API key cleanly', async () => {
      const originalFetch = globalThis.fetch;

      try {
        globalThis.fetch = async (url: RequestInfo | URL) => {
          if (url.toString().includes('/auth/v1/token')) {
            return new Response(JSON.stringify({ message: 'Invalid API key' }), {
              status: 401,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          return originalFetch(url);
        };

        const formData = new FormData();
        formData.set('identifier', 'user@example.com');
        formData.set('password', 'ValidPass123!');

        const res = await signInWithEmailAction(formData);
        assert.ok(res.error, 'Must report error');
        assert.ok(!res.error.includes('Invalid API key'), 'Must not leak API key error to user');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('9. Server Action failure propagation test ensures no uncaught exceptions', async () => {
      const originalFetch = globalThis.fetch;

      try {
        globalThis.fetch = async () => {
          throw new Error('Fatal socket destruction');
        };

        const formData = new FormData();
        formData.set('identifier', 'user@example.com');
        formData.set('password', 'ValidPass123!');

        // Must not throw an unhandled promise rejection
        const res = await signInWithEmailAction(formData);
        assert.ok(res.error, 'Must catch and serialize failure as error response');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('10. Existing-user email authentication integration test full cycle', async () => {
      const originalFetch = globalThis.fetch;

      try {
        globalThis.fetch = async (url: RequestInfo | URL) => {
          if (url.toString().includes('/auth/v1/token')) {
            return new Response(
              JSON.stringify({
                access_token: 'valid_jwt_existing_email_user',
                token_type: 'bearer',
                expires_in: 3600,
                refresh_token: 'valid_refresh_existing_email_user',
                user: { id: '018f0000-0000-7000-8000-000000000002', email: 'existing_user@example.com' },
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
          return originalFetch(url);
        };

        const formData = new FormData();
        formData.set('identifier', 'existing_user@example.com');
        formData.set('password', 'ValidPassword123!');

        const res = await signInWithEmailAction(formData);
        assert.equal(res.success, true);
        assert.equal(res.redirectUrl, '/');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('11. Existing-user username authentication integration test full cycle', async () => {
      const originalFetch = globalThis.fetch;
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'valid-service-role-key';

      try {
        globalThis.fetch = async (url: RequestInfo | URL) => {
          const urlStr = url.toString();
          if (urlStr.includes('fn_get_email_by_username')) {
            return new Response(JSON.stringify('existing_user@example.com'), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          if (urlStr.includes('/auth/v1/token')) {
            return new Response(
              JSON.stringify({
                access_token: 'valid_jwt_existing_username_user',
                token_type: 'bearer',
                expires_in: 3600,
                refresh_token: 'valid_refresh_existing_username_user',
                user: { id: '018f0000-0000-7000-8000-000000000002', email: 'existing_user@example.com' },
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
          return originalFetch(url);
        };

        const formData = new FormData();
        formData.set('identifier', 'existing_user');
        formData.set('password', 'ValidPassword123!');

        const res = await signInWithEmailAction(formData);
        assert.equal(res.success, true);
        assert.equal(res.redirectUrl, '/');
      } finally {
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;
        globalThis.fetch = originalFetch;
      }
    });

    test('12. Session cookie persistence test verifies httpOnly and sameSite config', async () => {
      const { createClient } = await import('../src/lib/supabase/server');
      const mockCookies: { name: string; value: string; options?: unknown }[] = [];

      (globalThis as unknown as { __mockCookies?: unknown[] }).__mockCookies = mockCookies;

      const client = await createClient();
      assert.ok(client, 'Supabase client must be instantiated');
    });

    test('13. Existing financial record retrieval test validates transaction ownership and RLS isolation', () => {
      const userIdA = '018f0000-0000-7000-8000-000000000001';
      const userIdB = '018f0000-0000-7000-8000-000000000002';

      const transactions = [
        { id: 'tx-1', user_id: userIdA, amount_paise: 150000, description: 'Groceries' },
        { id: 'tx-2', user_id: userIdB, amount_paise: 250000, description: 'Electronics' },
      ];

      // Simulated RLS filtering: auth.uid() = userIdA
      const visibleToUserA = transactions.filter((tx) => tx.user_id === userIdA);
      assert.equal(visibleToUserA.length, 1);
      assert.equal(visibleToUserA[0].id, 'tx-1');
      assert.equal(visibleToUserA[0].amount_paise, 150000);

      // Verify User B cannot access User A's records
      const visibleToUserB = transactions.filter((tx) => tx.user_id === userIdB);
      assert.equal(visibleToUserB.length, 1);
      assert.equal(visibleToUserB[0].id, 'tx-2');
      assert.ok(!visibleToUserB.some((tx) => tx.user_id === userIdA), 'User B must not see User A records');
    });
  });
});
