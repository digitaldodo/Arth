import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Set test environment placeholders
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.INTERNAL_API_URL = 'http://127.0.0.1:3001';

import {
  signInWithEmailAction,
  signUpWithEmailAction,
  resendConfirmationEmailAction,
  requestPasswordResetAction,
  updatePasswordAction,
} from '../src/app/login/actions.js';

describe('Frontend Authentication Server Actions & Validation', () => {
  // 1. Sign In Action Validation
  describe('signInWithEmailAction validation', () => {
    test('rejects empty email', async () => {
      const formData = new FormData();
      formData.set('email', '');
      formData.set('password', 'ValidPass123!');

      const res = await signInWithEmailAction(formData);
      assert.equal(res.error, 'Please enter a valid email address.');
    });

    test('rejects invalid email formats', async () => {
      const invalidEmails = ['plainaddress', '@missingusername.com', 'user@domain'];
      for (const email of invalidEmails) {
        const formData = new FormData();
        formData.set('email', email);
        formData.set('password', 'ValidPass123!');

        const res = await signInWithEmailAction(formData);
        assert.equal(res.error, 'Please enter a valid email address.', `Failed for ${email}`);
      }
    });

    test('rejects empty password', async () => {
      const formData = new FormData();
      formData.set('email', 'user@example.com');
      formData.set('password', '');

      const res = await signInWithEmailAction(formData);
      assert.equal(res.error, 'Please enter your password.');
    });
  });

  // 2. Sign Up Action Validation
  describe('signUpWithEmailAction validation', () => {
    test('rejects missing or invalid username', async () => {
      const invalidUsernames = ['', 'a', 'ab', 'user with spaces', 'user@bad!', 'a'.repeat(35)];
      for (const username of invalidUsernames) {
        const formData = new FormData();
        formData.set('username', username);
        formData.set('email', 'valid@example.com');
        formData.set('password', 'Password123');
        formData.set('confirmPassword', 'Password123');

        const res = await signUpWithEmailAction(formData);
        assert.equal(
          res.error,
          'Username must be between 3 and 30 characters and contain only letters, numbers, underscores, or hyphens.',
          `Should have rejected username: ${username}`
        );
      }
    });

    test('rejects invalid email', async () => {
      const formData = new FormData();
      formData.set('username', 'valid_user');
      formData.set('email', 'not-an-email');
      formData.set('password', 'Password123');
      formData.set('confirmPassword', 'Password123');

      const res = await signUpWithEmailAction(formData);
      assert.equal(res.error, 'Please enter a valid email address.');
    });

    test('rejects password shorter than 8 characters', async () => {
      const formData = new FormData();
      formData.set('username', 'valid_user');
      formData.set('email', 'user@example.com');
      formData.set('password', 'short');
      formData.set('confirmPassword', 'short');

      const res = await signUpWithEmailAction(formData);
      assert.equal(res.error, 'Password must be at least 8 characters in length.');
    });

    test('rejects mismatching confirm password', async () => {
      const formData = new FormData();
      formData.set('username', 'valid_user');
      formData.set('email', 'user@example.com');
      formData.set('password', 'Password123');
      formData.set('confirmPassword', 'DifferentPass123');

      const res = await signUpWithEmailAction(formData);
      assert.equal(res.error, 'Passwords do not match. Please verify both fields.');
    });
  });

  // 3. Password Reset Request Action Validation
  describe('requestPasswordResetAction validation', () => {
    test('rejects invalid email address', async () => {
      const formData = new FormData();
      formData.set('email', 'invalid-email-address');

      const res = await requestPasswordResetAction(formData);
      assert.equal(res.error, 'Please enter a valid email address.');
    });
  });

  // 4. Password Update Action Validation
  describe('updatePasswordAction validation', () => {
    test('rejects password shorter than 8 characters', async () => {
      const formData = new FormData();
      formData.set('password', 'short7');
      formData.set('confirmPassword', 'short7');

      const res = await updatePasswordAction(formData);
      assert.equal(res.error, 'New password must be at least 8 characters in length.');
    });

    test('rejects mismatching confirm password', async () => {
      const formData = new FormData();
      formData.set('password', 'ValidPass123');
      formData.set('confirmPassword', 'MismatchPass456');

      const res = await updatePasswordAction(formData);
      assert.equal(res.error, 'Passwords do not match. Please verify both fields.');
    });
  });

  // 5. Sign In with Unconfirmed Account & Confirmation States
  describe('Email confirmation handling in Auth actions', () => {
    test('signInWithEmailAction informs user when email is unconfirmed', async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
          if (url.toString().includes('/auth/v1/token')) {
            return new Response(
              JSON.stringify({
                error: 'invalid_grant',
                error_description: 'Email not confirmed',
                message: 'Email not confirmed',
              }),
              { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
          }
          return originalFetch(url, opts);
        };

        const formData = new FormData();
        formData.set('email', 'unconfirmed@example.com');
        formData.set('password', 'ValidPass123!');

        const res = await signInWithEmailAction(formData);
        assert.ok(res.error);
        assert.ok(
          res.error.includes('Your email address has not been confirmed yet'),
          'Expected clear unconfirmed email message'
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('signUpWithEmailAction returns needsConfirmation when email confirmation required', async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
          if (url.toString().includes('/auth/v1/signup')) {
            return new Response(
              JSON.stringify({
                id: '00000000-0000-7000-8000-000000000001',
                email: 'newuser@example.com',
                confirmation_sent_at: '2026-10-25T11:00:00Z',
                // session is null when email confirmation is enabled
                session: null,
                user: {
                  id: '00000000-0000-7000-8000-000000000001',
                  email: 'newuser@example.com',
                  user_metadata: { username: 'newuser' },
                },
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
          return originalFetch(url, opts);
        };

        const formData = new FormData();
        formData.set('username', 'newuser');
        formData.set('email', 'newuser@example.com');
        formData.set('password', 'ValidPass123!');
        formData.set('confirmPassword', 'ValidPass123!');

        const res = await signUpWithEmailAction(formData);
        assert.equal(res.success, true);
        assert.equal(res.needsConfirmation, true);
        assert.ok(
          res.message?.toLowerCase().includes('check your email to confirm your account'),
          'Expected confirmation message'
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('resendConfirmationEmailAction rejects invalid email formats', async () => {
      const formData = new FormData();
      formData.set('email', 'bademail');

      const res = await resendConfirmationEmailAction(formData);
      assert.equal(res.error, 'Please enter a valid email address.');
    });

    test('resendConfirmationEmailAction dispatches confirmation and returns success', async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
          if (url.toString().includes('/auth/v1/resend')) {
            return new Response(JSON.stringify({}), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          return originalFetch(url, opts);
        };

        const formData = new FormData();
        formData.set('email', 'unconfirmed@example.com');

        const res = await resendConfirmationEmailAction(formData);
        assert.equal(res.success, true);
        assert.ok(res.message?.includes('a new confirmation link has been sent'));
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('resendConfirmationEmailAction handles rate-limiting gracefully', async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
          if (url.toString().includes('/auth/v1/resend')) {
            return new Response(
              JSON.stringify({
                error: 'over_email_send_rate_limit',
                message: 'For security purposes, you can only request this once every 60 seconds',
              }),
              { status: 429, headers: { 'Content-Type': 'application/json' } }
            );
          }
          return originalFetch(url, opts);
        };

        const formData = new FormData();
        formData.set('email', 'unconfirmed@example.com');

        const res = await resendConfirmationEmailAction(formData);
        assert.ok(res.error);
        assert.ok(
          res.error.includes('Too many confirmation requests') ||
          res.error.includes('security purposes'),
          'Expected friendly rate-limit error message'
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
