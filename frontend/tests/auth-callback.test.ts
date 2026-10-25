import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// Set minimal test environment placeholders before importing routes
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.INTERNAL_API_URL = 'http://127.0.0.1:3001';

import {
  getAppOrigin,
  getAuthCallbackUrl,
  sanitizeRedirectPath,
  formatAuthError,
  PRODUCTION_DEFAULT_ORIGIN,
  LOCAL_DEFAULT_ORIGIN,
} from '../src/lib/auth-config.js';
import { GET as handleCallback } from '../src/app/auth/callback/route.js';
import { signInWithGoogleAction } from '../src/app/login/actions.js';

describe('OAuth Callback & Environment URL Resolution', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // 1. Origin derivation
  describe('getAppOrigin & getAuthCallbackUrl derivation', () => {
    test('defaults to localhost:3000 in development/test environment', () => {
      delete process.env.NEXT_PUBLIC_APP_URL;
      delete process.env.APP_URL;
      (process.env as Record<string, string | undefined>).NODE_ENV = 'development';

      const origin = getAppOrigin();
      assert.equal(origin, LOCAL_DEFAULT_ORIGIN);
      assert.equal(getAuthCallbackUrl(origin), 'http://localhost:3000/auth/callback');
    });

    test('respects NEXT_PUBLIC_APP_URL when explicitly configured', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://arth-9h3f.vercel.app/';
      const origin = getAppOrigin();
      assert.equal(origin, 'https://arth-9h3f.vercel.app');
      assert.equal(getAuthCallbackUrl(origin), 'https://arth-9h3f.vercel.app/auth/callback');
    });

    test('derives origin from request headers in production', () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      delete process.env.NEXT_PUBLIC_APP_URL;
      delete process.env.APP_URL;

      const mockHeaders = {
        get(name: string) {
          if (name === 'x-forwarded-host') return 'arth-9h3f.vercel.app';
          if (name === 'x-forwarded-proto') return 'https';
          return null;
        },
      };

      const origin = getAppOrigin(mockHeaders);
      assert.equal(origin, 'https://arth-9h3f.vercel.app');
      assert.equal(getAuthCallbackUrl(origin), 'https://arth-9h3f.vercel.app/auth/callback');
    });

    test('never returns localhost in production, falling back to production canonical domain', () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      // Simulate misconfigured localhost env in production
      process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

      const origin = getAppOrigin();
      assert.equal(origin, PRODUCTION_DEFAULT_ORIGIN);
      assert.notEqual(origin, 'http://localhost:3000');
      assert.equal(getAuthCallbackUrl(origin), 'https://arth-9h3f.vercel.app/auth/callback');
    });
  });

  // 2. Open redirect prevention
  describe('sanitizeRedirectPath security', () => {
    test('accepts safe internal relative paths', () => {
      assert.equal(sanitizeRedirectPath('/'), '/');
      assert.equal(sanitizeRedirectPath('/auth/update-password'), '/auth/update-password');
      assert.equal(sanitizeRedirectPath('/ledger?tab=all'), '/ledger?tab=all');
    });

    test('rejects open-redirect attack vectors and defaults to /', () => {
      assert.equal(sanitizeRedirectPath('//attacker.com'), '/');
      assert.equal(sanitizeRedirectPath('https://evil.com'), '/');
      assert.equal(sanitizeRedirectPath('http://malicious.org/phish'), '/');
      assert.equal(sanitizeRedirectPath('/\\attacker.com'), '/');
      assert.equal(sanitizeRedirectPath('javascript:alert(1)'), '/');
      assert.equal(sanitizeRedirectPath(null), '/');
      assert.equal(sanitizeRedirectPath(''), '/');
    });
  });

  // 3. Human-friendly error translation
  describe('formatAuthError translation', () => {
    test('formats known error codes with actionable messages', () => {
      const missing = formatAuthError('missing_authorization_code');
      assert.ok(missing.includes('No authorization code'));

      const failed = formatAuthError('auth_exchange_failed');
      assert.ok(failed.includes('authorization code exchange failed'));

      const denied = formatAuthError('access_denied');
      assert.ok(denied.includes('cancelled or access was denied'));
    });

    test('translates cancellation and PKCE expiry descriptions', () => {
      const cancelled = formatAuthError(null, 'User cancelled OAuth sign-in flow');
      assert.equal(cancelled, 'Sign in was cancelled. Please try again.');

      const expired = formatAuthError(null, 'flow_state_not_found');
      assert.ok(expired.includes('session expired or cookies were blocked'));
    });
  });

  // 4. Callback route handling
  describe('Callback Route Handler (/auth/callback)', () => {
    test('missing code redirects to /login with missing_authorization_code error', async () => {
      const req = new Request('http://localhost:3000/auth/callback');
      const res = await handleCallback(req);

      assert.equal(res.status, 307);
      const location = res.headers.get('location') || res.headers.get('Location');
      assert.ok(location);
      assert.ok(location.includes('/login?error=missing_authorization_code'));
    });

    test('OAuth provider error redirects to /login with preserved error details', async () => {
      const req = new Request(
        'http://localhost:3000/auth/callback?error=access_denied&error_description=User+cancelled+sign+in'
      );
      const res = await handleCallback(req);

      assert.equal(res.status, 307);
      const location = res.headers.get('location') || res.headers.get('Location');
      assert.ok(location);
      assert.ok(location.includes('error=access_denied'));
    });

    test('sanitizes open-redirect destinations in next parameter', async () => {
      const req = new Request(
        'http://localhost:3000/auth/callback?error=test_err&next=//attacker.com'
      );
      const res = await handleCallback(req);

      assert.equal(res.status, 307);
      const location = res.headers.get('location') || res.headers.get('Location');
      assert.ok(location);
      assert.ok(location.startsWith('http://localhost:3000/login'));
      assert.ok(!location.includes('attacker.com'));
    });

    test('exchanges valid authorization code and sets session cookies on redirect', async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
          if (url.toString().includes('/auth/v1/token')) {
            return new Response(
              JSON.stringify({
                access_token: 'mock-access-token-12345',
                token_type: 'bearer',
                expires_in: 3600,
                refresh_token: 'mock-refresh-token-12345',
                user: {
                  id: '00000000-0000-7000-8000-000000000001',
                  email: 'test@example.com',
                },
              }),
              {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              }
            );
          }
          return originalFetch(url, opts);
        };

        const mockVerifierCookies =
          'sb-127-auth-token-code-verifier=base64-InZlcmlmaWVyIg==; ' +
          'sb-127-auth-token-flows-code-verifier=WyJmbG93MSJd; ' +
          'sb-127-auth-token-flow-flow1-code-verifier=base64-InZlcmlmaWVyIg==';

        const req = new Request('http://localhost:3000/auth/callback?code=valid-test-code', {
          headers: {
            cookie: mockVerifierCookies,
          },
        });
        const res = await handleCallback(req);

        assert.equal(res.status, 307);
        const location = res.headers.get('location') || res.headers.get('Location');
        assert.equal(location, 'http://localhost:3000/');

        // Assert session cookies are set on the redirect response
        const setCookieHeader = res.headers.get('set-cookie');
        assert.ok(setCookieHeader, 'set-cookie header should be populated on redirect');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('invalid authorization code produces a recoverable error redirect without token leakage', async () => {
      const originalFetch = globalThis.fetch;
      try {
        const sensitiveCode = 'secret-invalid-auth-code-999';
        globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
          if (url.toString().includes('/auth/v1/token')) {
            return new Response(
              JSON.stringify({
                error: 'invalid_grant',
                error_description: 'Invalid authorization code or PKCE code verifier',
              }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              }
            );
          }
          return originalFetch(url, opts);
        };

        const req = new Request(`http://localhost:3000/auth/callback?code=${sensitiveCode}`);
        const res = await handleCallback(req);

        assert.equal(res.status, 307);
        const location = res.headers.get('location') || res.headers.get('Location');
        assert.ok(location);
        assert.ok(location.startsWith('http://localhost:3000/login?error=auth_exchange_failed'));
        // Verify sensitive authorization code is never leaked in the redirect URL
        assert.ok(!location.includes(sensitiveCode), 'Sensitive auth code must not be in redirect URL');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('rejects unsafe external redirect destination on successful code exchange', async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
          if (url.toString().includes('/auth/v1/token')) {
            return new Response(
              JSON.stringify({
                access_token: 'mock-token',
                token_type: 'bearer',
                expires_in: 3600,
                refresh_token: 'mock-refresh',
                user: { id: '00000000-0000-7000-8000-000000000001', email: 'test@example.com' },
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
          return originalFetch(url, opts);
        };

        const mockVerifierCookies =
          'sb-127-auth-token-code-verifier=base64-InZlcmlmaWVyIg==; ' +
          'sb-127-auth-token-flows-code-verifier=WyJmbG93MSJd; ' +
          'sb-127-auth-token-flow-flow1-code-verifier=base64-InZlcmlmaWVyIg==';

        const req = new Request(
          'http://localhost:3000/auth/callback?code=valid-code&next=//malicious.com/phish',
          {
            headers: {
              cookie: mockVerifierCookies,
            },
          }
        );
        const res = await handleCallback(req);

        assert.equal(res.status, 307);
        const location = res.headers.get('location') || res.headers.get('Location');
        assert.equal(location, 'http://localhost:3000/');
        assert.ok(!location.includes('malicious.com'));
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  // 5. Google OAuth Server Action
  describe('Google OAuth Server Action', () => {
    test('local OAuth targets /auth/callback, never / and no next=/ query param', async () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
      delete process.env.NEXT_PUBLIC_APP_URL;
      delete process.env.APP_URL;

      const result = await signInWithGoogleAction();

      assert.ok(result.url, 'Expected OAuth URL to be generated');
      assert.ok(result.url.includes('provider=google'));
      // Must target explicit /auth/callback
      assert.ok(
        result.url.includes(
          encodeURIComponent('http://localhost:3000/auth/callback')
        ),
        'Must target exact http://localhost:3000/auth/callback'
      );
      // Must not target root /
      assert.ok(
        !result.url.includes(encodeURIComponent('http://localhost:3000/&')) &&
        !result.url.includes(encodeURIComponent('http://localhost:3000/?'))
      );
      // Must not have trailing query param next=/
      assert.ok(!result.url.includes('next='), 'Must not contain trailing next= query param');
    });

    test('production OAuth targets deployed domain and never localhost', async () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      process.env.NEXT_PUBLIC_APP_URL = 'https://arth-9h3f.vercel.app';

      // Even if clientOrigin or a misconfigured setting attempts localhost:
      const result = await signInWithGoogleAction('http://localhost:3000');

      assert.ok(result.url, 'Expected OAuth URL to be generated');
      assert.ok(result.url.includes('provider=google'));
      assert.ok(
        result.url.includes(
          encodeURIComponent('https://arth-9h3f.vercel.app/auth/callback')
        ),
        'Must target deployed production domain callback'
      );
      assert.ok(
        !result.url.includes('localhost'),
        'Production OAuth must never reference localhost'
      );
      assert.ok(!result.url.includes('next='), 'Must not contain trailing next= query param');
    });
  });
});
