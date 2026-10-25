import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// Set test environment placeholders before importing routes
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.INTERNAL_API_URL = 'http://127.0.0.1:3001';

import { GET as handleConfirm } from '../src/app/auth/confirm/route.js';
import { getAuthConfirmUrl } from '../src/lib/auth-config.js';

describe('Email Confirmation & Token-Hash Verification (/auth/confirm)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // 1. URL Derivation
  describe('getAuthConfirmUrl', () => {
    test('derives local /auth/confirm in development', () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
      delete process.env.NEXT_PUBLIC_APP_URL;

      const url = getAuthConfirmUrl();
      assert.equal(url, 'http://localhost:3000/auth/confirm');
    });

    test('derives production /auth/confirm and never localhost in production', () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'; // simulated misconfig

      const url = getAuthConfirmUrl();
      assert.equal(url, 'https://arth-9h3f.vercel.app/auth/confirm');
      assert.ok(!url.includes('localhost'));
    });
  });

  // 2. Missing & Error Parameters
  describe('Parameter validation & error handling', () => {
    test('missing token_hash and code redirects to /login with missing_confirmation_token error', async () => {
      const req = new Request('http://localhost:3000/auth/confirm');
      const res = await handleConfirm(req);

      assert.equal(res.status, 307);
      const location = res.headers.get('location') || res.headers.get('Location');
      assert.ok(location);
      assert.ok(location.includes('/login?error=missing_confirmation_token'));
    });

    test('provider error parameter redirects to /login with error details', async () => {
      const req = new Request(
        'http://localhost:3000/auth/confirm?error=access_denied&error_description=Confirmation+expired'
      );
      const res = await handleConfirm(req);

      assert.equal(res.status, 307);
      const location = res.headers.get('location') || res.headers.get('Location');
      assert.ok(location);
      assert.ok(location.includes('error=access_denied'));
    });
  });

  // 3. Successful Verification with Token Hash
  describe('Token-Hash Verification (verifyOtp)', () => {
    test('exchanges valid token_hash and sets session cookies on redirect', async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
          if (url.toString().includes('/auth/v1/verify')) {
            return new Response(
              JSON.stringify({
                access_token: 'mock-verified-access-token',
                token_type: 'bearer',
                expires_in: 3600,
                refresh_token: 'mock-verified-refresh-token',
                user: {
                  id: '00000000-0000-7000-8000-000000000001',
                  email: 'confirmed@example.com',
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

        const req = new Request(
          'http://localhost:3000/auth/confirm?token_hash=valid_token_hash_abc123&type=email'
        );
        const res = await handleConfirm(req);

        assert.equal(res.status, 307);
        const location = res.headers.get('location') || res.headers.get('Location');
        assert.equal(location, 'http://localhost:3000/');

        // Assert session cookies are set on the redirect response
        const setCookie = res.headers.get('set-cookie');
        assert.ok(setCookie, 'set-cookie header should be populated on redirect');
        // Ensure token_hash is not in the redirect URL
        assert.ok(!location.includes('token_hash'));
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('invalid or expired token_hash produces recoverable error without token leakage', async () => {
      const originalFetch = globalThis.fetch;
      const secretTokenHash = 'secret_expired_token_hash_999';
      try {
        globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
          if (url.toString().includes('/auth/v1/verify')) {
            return new Response(
              JSON.stringify({
                error: 'otp_expired',
                message: 'Token has expired or is invalid',
              }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              }
            );
          }
          return originalFetch(url, opts);
        };

        const req = new Request(
          `http://localhost:3000/auth/confirm?token_hash=${secretTokenHash}&type=email`
        );
        const res = await handleConfirm(req);

        assert.equal(res.status, 307);
        const location = res.headers.get('location') || res.headers.get('Location');
        assert.ok(location);
        assert.ok(location.startsWith('http://localhost:3000/login?error=confirmation_failed'));
        // Verify sensitive token hash is never leaked in the redirect URL
        assert.ok(
          !location.includes(secretTokenHash),
          'Sensitive token hash must never be leaked in redirect URL'
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  // 4. Redirect Destination Safety
  describe('Redirect Safety & Open-Redirect Defense', () => {
    test('rejects unsafe external redirect destinations and defaults to internal /', async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
          if (url.toString().includes('/auth/v1/verify')) {
            return new Response(
              JSON.stringify({
                access_token: 'mock-verified-access-token',
                token_type: 'bearer',
                expires_in: 3600,
                refresh_token: 'mock-verified-refresh-token',
                user: {
                  id: '00000000-0000-7000-8000-000000000001',
                  email: 'confirmed@example.com',
                },
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
          return originalFetch(url, opts);
        };

        const req = new Request(
          'http://localhost:3000/auth/confirm?token_hash=valid_hash&type=email&next=//attacker.com/malicious'
        );
        const res = await handleConfirm(req);

        assert.equal(res.status, 307);
        const location = res.headers.get('location') || res.headers.get('Location');
        assert.equal(location, 'http://localhost:3000/');
        assert.ok(!location.includes('attacker.com'));
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
