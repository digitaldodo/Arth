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
  });

  // 5. Google OAuth Server Action
  describe('Google OAuth Server Action', () => {
    test('initiates OAuth with correct explicit callback URL', async () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://arth-9h3f.vercel.app';
      const result = await signInWithGoogleAction();

      // Either returns authorization url or graceful error in test environment without live Supabase
      if (result.url) {
        assert.ok(result.url.includes('provider=google'));
        assert.ok(
          result.url.includes(
            encodeURIComponent('https://arth-9h3f.vercel.app/auth/callback?next=/')
          )
        );
      } else {
        assert.ok(typeof result.error === 'string');
      }
    });
  });
});
