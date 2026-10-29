import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Set test environment placeholders
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.INTERNAL_API_URL = 'http://127.0.0.1:3001';

import { changePasswordAction } from '../src/app/login/actions.js';

describe('Password Management (changePasswordAction) Tests', () => {
  test('rejects empty new password', async () => {
    const formData = new FormData();
    formData.set('currentPassword', 'OldPass123!');
    formData.set('newPassword', '');
    formData.set('confirmPassword', '');

    const res = await changePasswordAction(formData);
    assert.equal(res.error, 'Please enter a new password.');
  });

  test('rejects new password shorter than 8 characters', async () => {
    const formData = new FormData();
    formData.set('currentPassword', 'OldPass123!');
    formData.set('newPassword', 'short');
    formData.set('confirmPassword', 'short');

    const res = await changePasswordAction(formData);
    assert.equal(res.error, 'New password must be at least 8 characters in length.');
  });

  test('rejects new password with leading or trailing whitespace', async () => {
    const formData = new FormData();
    formData.set('currentPassword', 'OldPass123!');
    formData.set('newPassword', '  ValidPass123! ');
    formData.set('confirmPassword', '  ValidPass123! ');

    const res = await changePasswordAction(formData);
    assert.equal(res.error, 'Password cannot begin or end with a space.');
  });

  test('rejects mismatched new and confirmation passwords', async () => {
    const formData = new FormData();
    formData.set('currentPassword', 'OldPass123!');
    formData.set('newPassword', 'FirstPass123!');
    formData.set('confirmPassword', 'SecondPass456!');

    const res = await changePasswordAction(formData);
    assert.equal(res.error, 'Passwords do not match. Please verify both fields.');
  });

  test('rejects when user is not authenticated or session is expired', async () => {
    const originalFetch = globalThis.fetch;
    try {
      (globalThis as unknown as { __mockCookies?: { name: string; value: string }[] }).__mockCookies = [];
      globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
        const urlStr = url.toString();
        if (urlStr.includes('/auth/v1/user')) {
          return new Response(JSON.stringify({ error: 'invalid token' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return originalFetch(url, opts);
      };

      const formData = new FormData();
      formData.set('currentPassword', 'OldPass123!');
      formData.set('newPassword', 'NewValidPass123!');
      formData.set('confirmPassword', 'NewValidPass123!');

      const res = await changePasswordAction(formData);
      assert.equal(
        res.error,
        'Your session has expired. Please sign in again before updating your password.'
      );
    } finally {
      delete (globalThis as unknown as { __mockCookies?: unknown }).__mockCookies;
      globalThis.fetch = originalFetch;
    }
  });

  test('unknown password marker does not infer a password from an email identity', async () => {
    const originalFetch = globalThis.fetch;
    try {
      (globalThis as unknown as { __mockCookies?: { name: string; value: string }[] }).__mockCookies = [
        {
          name: 'sb-127-auth-token',
          value: JSON.stringify({
            access_token: 'email-session-token',
            refresh_token: 'mock-refresh-token',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: {
              id: 'email-user-123',
              email: 'user@example.com',
              app_metadata: { provider: 'email', providers: ['email'] },
            },
          }),
        },
      ];

      globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
        const urlStr = url.toString();
        if (urlStr.includes('/auth/v1/user')) {
          return new Response(
            JSON.stringify({
              id: 'email-user-123',
              email: 'user@example.com',
              app_metadata: { provider: 'email', providers: ['email'] },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return originalFetch(url, opts);
      };

      const formData = new FormData();
      formData.set('currentPassword', '');
      formData.set('newPassword', 'NewValidPass123!');
      formData.set('confirmPassword', 'NewValidPass123!');

      const res = await changePasswordAction(formData);
      assert.equal(res.success, true);
    } finally {
      delete (globalThis as unknown as { __mockCookies?: unknown }).__mockCookies;
      globalThis.fetch = originalFetch;
    }
  });

  test('for email user: rejects new password identical to current password', async () => {
    const originalFetch = globalThis.fetch;
    try {
      (globalThis as unknown as { __mockCookies?: { name: string; value: string }[] }).__mockCookies = [
        {
          name: 'sb-127-auth-token',
          value: JSON.stringify({
            access_token: 'email-session-token',
            refresh_token: 'mock-refresh-token',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: {
              id: 'email-user-123',
              email: 'user@example.com',
              app_metadata: { provider: 'email', providers: ['email'] },
            },
          }),
        },
      ];

      globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
        const urlStr = url.toString();
        if (urlStr.includes('/auth/v1/user')) {
          return new Response(
            JSON.stringify({
              id: 'email-user-123',
              email: 'user@example.com',
              app_metadata: { provider: 'email', providers: ['email'] },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return originalFetch(url, opts);
      };

      const formData = new FormData();
      formData.set('currentPassword', 'SamePassword123!');
      formData.set('newPassword', 'SamePassword123!');
      formData.set('confirmPassword', 'SamePassword123!');

      const res = await changePasswordAction(formData);
      assert.equal(
        res.error,
        'New password must be different from your current password.'
      );
    } finally {
      delete (globalThis as unknown as { __mockCookies?: unknown }).__mockCookies;
      globalThis.fetch = originalFetch;
    }
  });

  test('for email user: rejects incorrect current password', async () => {
    const originalFetch = globalThis.fetch;
    try {
      (globalThis as unknown as { __mockCookies?: { name: string; value: string }[] }).__mockCookies = [
        {
          name: 'sb-127-auth-token',
          value: JSON.stringify({
            access_token: 'email-session-token',
            refresh_token: 'mock-refresh-token',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: {
              id: 'email-user-123',
              email: 'user@example.com',
              app_metadata: { provider: 'email', providers: ['email'] },
            },
          }),
        },
      ];

      globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
        const urlStr = url.toString();
        if (urlStr.includes('/auth/v1/user')) {
          return new Response(
            JSON.stringify({
              id: 'email-user-123',
              email: 'user@example.com',
              app_metadata: { provider: 'email', providers: ['email'] },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (urlStr.includes('/auth/v1/token')) {
          // Re-authentication failed
          return new Response(
            JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return originalFetch(url, opts);
      };

      const formData = new FormData();
      formData.set('currentPassword', 'WrongCurrentPass123!');
      formData.set('newPassword', 'NewValidPass123!');
      formData.set('confirmPassword', 'NewValidPass123!');

      const res = await changePasswordAction(formData);
      assert.equal(res.error, 'Incorrect current password. Please try again.');
    } finally {
      delete (globalThis as unknown as { __mockCookies?: unknown }).__mockCookies;
      globalThis.fetch = originalFetch;
    }
  });

  test('for email user: succeeds when current password is valid', async () => {
    const originalFetch = globalThis.fetch;
    try {
      let updatedUserPassword = '';
      (globalThis as unknown as { __mockCookies?: { name: string; value: string }[] }).__mockCookies = [
        {
          name: 'sb-127-auth-token',
          value: JSON.stringify({
            access_token: 'email-session-token',
            refresh_token: 'mock-refresh-token',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: {
              id: 'email-user-123',
              email: 'user@example.com',
              app_metadata: { provider: 'email', providers: ['email'] },
            },
          }),
        },
      ];

      globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
        const urlStr = url.toString();
        if (opts?.method === 'PUT' && urlStr.includes('/auth/v1/user')) {
          const body = JSON.parse(opts.body as string);
          if (body.password) updatedUserPassword = body.password;
          return new Response(
            JSON.stringify({
              id: 'email-user-123',
              email: 'user@example.com',
              app_metadata: { provider: 'email', providers: ['email'] },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (urlStr.includes('/auth/v1/user')) {
          return new Response(
            JSON.stringify({
              id: 'email-user-123',
              email: 'user@example.com',
              app_metadata: { provider: 'email', providers: ['email'] },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (urlStr.includes('/auth/v1/token')) {
          return new Response(
            JSON.stringify({
              access_token: 'reauth-token',
              token_type: 'bearer',
              expires_in: 3600,
              refresh_token: 'reauth-refresh-token',
              user: {
                id: 'email-user-123',
                email: 'user@example.com',
                app_metadata: { provider: 'email', providers: ['email'] },
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return originalFetch(url, opts);
      };

      const formData = new FormData();
      formData.set('currentPassword', 'CorrectCurrentPass123!');
      formData.set('newPassword', 'BrandNewPassword123!');
      formData.set('confirmPassword', 'BrandNewPassword123!');

      const res = await changePasswordAction(formData);
      assert.equal(res.success, true);
      assert.equal(res.message, 'Your password has been successfully updated.');
      assert.equal(updatedUserPassword, 'BrandNewPassword123!');
    } finally {
      delete (globalThis as unknown as { __mockCookies?: unknown }).__mockCookies;
      globalThis.fetch = originalFetch;
    }
  });

  test('for Google OAuth user without password: successfully sets password without requiring current password', async () => {
    const originalFetch = globalThis.fetch;
    try {
      let updatedUserPassword = '';
      (globalThis as unknown as { __mockCookies?: { name: string; value: string }[] }).__mockCookies = [
        {
          name: 'sb-127-auth-token',
          value: JSON.stringify({
            access_token: 'google-session-token',
            refresh_token: 'mock-refresh-token',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: {
              id: 'google-user-123',
              email: 'googleuser@gmail.com',
              app_metadata: { provider: 'google', providers: ['google'] },
            },
          }),
        },
      ];

      globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
        const urlStr = url.toString();
        if (opts?.method === 'PUT' && urlStr.includes('/auth/v1/user')) {
          const body = JSON.parse(opts.body as string);
          if (body.password) updatedUserPassword = body.password;
          return new Response(
            JSON.stringify({
              id: 'google-user-123',
              email: 'googleuser@gmail.com',
              app_metadata: { provider: 'google', providers: ['google', 'email'] },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (urlStr.includes('/auth/v1/user')) {
          return new Response(
            JSON.stringify({
              id: 'google-user-123',
              email: 'googleuser@gmail.com',
              app_metadata: { provider: 'google', providers: ['google'] },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return originalFetch(url, opts);
      };

      const formData = new FormData();
      // Notice: NO currentPassword provided!
      formData.set('newPassword', 'MyInitialPassword123!');
      formData.set('confirmPassword', 'MyInitialPassword123!');

      const res = await changePasswordAction(formData);
      assert.equal(res.success, true);
      assert.ok(res.message?.includes('Password successfully set!'));
      assert.equal(updatedUserPassword, 'MyInitialPassword123!');
    } finally {
      delete (globalThis as unknown as { __mockCookies?: unknown }).__mockCookies;
      globalThis.fetch = originalFetch;
    }
  });

  test('handles re-authentication required from Supabase policy gracefully', async () => {
    const originalFetch = globalThis.fetch;
    try {
      (globalThis as unknown as { __mockCookies?: { name: string; value: string }[] }).__mockCookies = [
        {
          name: 'sb-127-auth-token',
          value: JSON.stringify({
            access_token: 'google-session-token',
            refresh_token: 'mock-refresh-token',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: {
              id: 'google-user-123',
              email: 'googleuser@gmail.com',
              app_metadata: { provider: 'google', providers: ['google'] },
            },
          }),
        },
      ];

      globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
        const urlStr = url.toString();
        if (opts?.method === 'PUT' && urlStr.includes('/auth/v1/user')) {
          return new Response(
            JSON.stringify({ message: 'User needs to reauthenticate', code: 'reauthentication_needed' }),
            { status: 422, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (urlStr.includes('/auth/v1/user')) {
          return new Response(
            JSON.stringify({
              id: 'google-user-123',
              email: 'googleuser@gmail.com',
              app_metadata: { provider: 'google', providers: ['google'] },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return originalFetch(url, opts);
      };

      const formData = new FormData();
      formData.set('newPassword', 'MyInitialPassword123!');
      formData.set('confirmPassword', 'MyInitialPassword123!');

      const res = await changePasswordAction(formData);
      assert.ok(res.error?.includes('Security policy requires recent authentication'));
    } finally {
      delete (globalThis as unknown as { __mockCookies?: unknown }).__mockCookies;
      globalThis.fetch = originalFetch;
    }
  });
});
