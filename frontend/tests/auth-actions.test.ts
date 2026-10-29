import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Set test environment placeholders
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.INTERNAL_API_URL = 'http://127.0.0.1:3001';

import {
  signInWithEmailAction,
  signInAction,
  signUpWithEmailAction,
  resendConfirmationEmailAction,
  requestPasswordResetAction,
  updatePasswordAction,
  setAccountPasswordAction,
  setUsernameAction,
  checkUsernameAvailabilityAction,
  deleteAccountAction,
  verifyCurrentPasswordAction,
} from '../src/app/login/actions.js';

describe('Frontend Authentication Server Actions & Validation', () => {
  test('verified legacy account password repairs the marker after real credential verification', async () => {
    const originalFetch = globalThis.fetch;
    const cookieGlobal = globalThis as unknown as { __mockCookies?: { name: string; value: string }[] };
    cookieGlobal.__mockCookies = [{
      name: 'sb-127-auth-token',
      value: JSON.stringify({
        access_token: 'legacy-session-token',
        refresh_token: 'mock-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: 'legacy-user', email: 'legacy@example.com' },
      }),
    }];
    let repaired = false;
    try {
      globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
        const urlStr = url.toString();
        if (urlStr.includes('/auth/v1/user') && opts?.method === 'PUT') {
          const body = JSON.parse((opts.body as string) || '{}');
          repaired = body.data?.has_password === true;
          return Response.json({ id: 'legacy-user', email: 'legacy@example.com', user_metadata: { has_password: true } });
        }
        if (urlStr.includes('/auth/v1/user')) {
          return Response.json({
            id: 'legacy-user', email: 'legacy@example.com', user_metadata: { has_password: false },
            app_metadata: { provider: 'google', providers: ['google'] },
          });
        }
        if (urlStr.includes('/auth/v1/token')) {
          const body = JSON.parse((opts?.body as string) || '{}');
          if (body.password !== 'WorkingPass123!') {
            return Response.json({ message: 'Invalid login credentials' }, { status: 400 });
          }
          return Response.json({
            access_token: 'verified-access-token', token_type: 'bearer', expires_in: 3600,
            refresh_token: 'verified-refresh-token',
            user: { id: 'legacy-user', email: 'legacy@example.com', user_metadata: { has_password: false } },
          });
        }
        return originalFetch(url, opts);
      };

      assert.deepEqual(await verifyCurrentPasswordAction('WrongPass123!'), {
        valid: false,
        error: 'Incorrect account password. Please try again.',
      });
      assert.equal(repaired, false, 'a failed password check must not set the marker');
      const valid = await verifyCurrentPasswordAction('WorkingPass123!');
      assert.equal(valid.valid, true);
      assert.equal(repaired, true, 'a verified legacy password repairs a false marker');
    } finally {
      delete cookieGlobal.__mockCookies;
      globalThis.fetch = originalFetch;
    }
  });

  // 1. Sign In Action Validation
  describe('signInWithEmailAction validation & identifier handling', () => {
    test('signInAction is alias of signInWithEmailAction', () => {
      assert.equal(signInAction, signInWithEmailAction);
    });

    test('rejects empty identifier', async () => {
      const formData = new FormData();
      formData.set('identifier', '');
      formData.set('password', 'ValidPass123!');

      const res = await signInWithEmailAction(formData);
      assert.equal(res.error, 'Please enter your email or username.');
    });

    test('rejects empty password', async () => {
      const formData = new FormData();
      formData.set('identifier', 'user@example.com');
      formData.set('password', '');

      const res = await signInWithEmailAction(formData);
      assert.equal(res.error, 'Please enter your password.');
    });

    test('informs user if SUPABASE_SERVICE_ROLE_KEY is unconfigured for username login', async () => {
      const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      try {
        const formData = new FormData();
        formData.set('identifier', 'valid_user');
        formData.set('password', 'ValidPass123!');

        const res = await signInWithEmailAction(formData);
        assert.ok(res.error);
        assert.ok(
          res.error.includes('SUPABASE_SERVICE_ROLE_KEY') ||
          res.error.includes('Please sign in using your registered email address')
        );
      } finally {
        if (originalServiceKey) {
          process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
        }
      }
    });

    test('login with valid email and password succeeds', async () => {
      const originalFetch = globalThis.fetch;
      try {
        let repairedPasswordMarker = false;
        globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
          const urlStr = url.toString();
          if (urlStr.includes('/auth/v1/user') && opts?.method === 'PUT') {
            const body = JSON.parse((opts.body as string) || '{}');
            repairedPasswordMarker = body.data?.has_password === true;
            return new Response(JSON.stringify({
              id: '00000000-0000-7000-8000-000000000001',
              email: 'user@example.com',
              user_metadata: { has_password: true },
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
          if (urlStr.includes('/auth/v1/token')) {
            return new Response(
              JSON.stringify({
                access_token: 'fake-access-token',
                token_type: 'bearer',
                expires_in: 3600,
                refresh_token: 'fake-refresh-token',
                user: {
                  id: '00000000-0000-7000-8000-000000000001',
                  email: 'user@example.com',
                },
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
          return originalFetch(url, opts);
        };

        const formData = new FormData();
        formData.set('identifier', 'user@example.com');
        formData.set('password', 'ValidPass123!');

        const res = await signInWithEmailAction(formData);
        assert.equal(res.success, true);
        assert.equal(res.redirectUrl, '/');
        assert.equal(repairedPasswordMarker, true, 'successful password sign-in should repair a missing marker');
      } finally {
        delete (globalThis as unknown as { __mockCookies?: unknown }).__mockCookies;
        globalThis.fetch = originalFetch;
      }
    });

    test('login with valid username resolves email and succeeds (including case-insensitivity)', async () => {
      const originalFetch = globalThis.fetch;
      const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

      try {
        let queriedUsername = '';
        let signInEmail = '';

        globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
          const urlStr = url.toString();

          // Mock fn_get_email_by_username
          if (urlStr.includes('/rest/v1/rpc/fn_get_email_by_username')) {
            const body = typeof opts?.body === 'string' ? JSON.parse(opts.body) : {};
            queriedUsername = body.p_username;
            if (queriedUsername === 'rahul_sharma') {
              return new Response(JSON.stringify('rahul@example.com'), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              });
            }
            return new Response(JSON.stringify(null), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          // Mock password token endpoint
          if (urlStr.includes('/auth/v1/token')) {
            const body = typeof opts?.body === 'string' ? JSON.parse(opts.body) : {};
            signInEmail = body.email;
            return new Response(
              JSON.stringify({
                access_token: 'fake-access-token',
                token_type: 'bearer',
                expires_in: 3600,
                refresh_token: 'fake-refresh-token',
                user: {
                  id: '00000000-0000-7000-8000-000000000002',
                  email: 'rahul@example.com',
                },
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }

          return originalFetch(url, opts);
        };

        // Pass mixed-case username: RAHUL_Sharma
        const formData = new FormData();
        formData.set('identifier', 'RAHUL_Sharma');
        formData.set('password', 'SecretPassword123');

        const res = await signInWithEmailAction(formData);
        assert.equal(res.success, true);
        assert.equal(queriedUsername, 'rahul_sharma', 'Username must be normalized to lowercase');
        assert.equal(signInEmail, 'rahul@example.com', 'Resolved email must be passed to Supabase auth');
      } finally {
        globalThis.fetch = originalFetch;
        if (originalServiceKey) {
          process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
        } else {
          delete process.env.SUPABASE_SERVICE_ROLE_KEY;
        }
      }
    });

    test('generic failure when the username does not exist', async () => {
      const originalFetch = globalThis.fetch;
      const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

      try {
        globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
          const urlStr = url.toString();
          if (urlStr.includes('/rest/v1/rpc/fn_get_email_by_username')) {
            return new Response(JSON.stringify(null), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          return originalFetch(url, opts);
        };

        const formData = new FormData();
        formData.set('identifier', 'nonexistent_user');
        formData.set('password', 'Password123!');

        const res = await signInWithEmailAction(formData);
        assert.equal(
          res.error,
          'Invalid email, username, or password. Please verify your credentials and try again.'
        );
      } finally {
        globalThis.fetch = originalFetch;
        if (originalServiceKey) {
          process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
        } else {
          delete process.env.SUPABASE_SERVICE_ROLE_KEY;
        }
      }
    });

    test('generic failure when password is incorrect', async () => {
      const originalFetch = globalThis.fetch;
      const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

      try {
        globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
          const urlStr = url.toString();
          if (urlStr.includes('/rest/v1/rpc/fn_get_email_by_username')) {
            return new Response(JSON.stringify('known@example.com'), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          if (urlStr.includes('/auth/v1/token')) {
            return new Response(
              JSON.stringify({
                error: 'invalid_grant',
                error_description: 'Invalid login credentials',
              }),
              { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
          }
          return originalFetch(url, opts);
        };

        const formData = new FormData();
        formData.set('identifier', 'known_user');
        formData.set('password', 'WrongPassword!');

        const res = await signInWithEmailAction(formData);
        assert.equal(
          res.error,
          'Invalid email, username, or password. Please verify your credentials and try again.'
        );
      } finally {
        globalThis.fetch = originalFetch;
        if (originalServiceKey) {
          process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
        } else {
          delete process.env.SUPABASE_SERVICE_ROLE_KEY;
        }
      }
    });
  });

  // 2. Sign Up Action Validation
  describe('signUpWithEmailAction validation & rules', () => {
    test('rejects invalid username characters and lengths', async () => {
      const invalidUsernames = [
        'a',
        'ab',
        'user with spaces',
        'user@bad!',
        'invalid.dots',
        'special$char',
        'a'.repeat(25),
      ];
      for (const username of invalidUsernames) {
        const formData = new FormData();
        formData.set('username', username);
        formData.set('email', 'valid@example.com');
        formData.set('password', 'Password123');
        formData.set('confirmPassword', 'Password123');

        const res = await signUpWithEmailAction(formData);
        assert.equal(
          res.error,
          'Username must be between 3 and 20 characters and contain only letters, numbers, and underscores.',
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

    test('rejects duplicate username prior to sign-up', async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
          const urlStr = url.toString();
          if (urlStr.includes('/rest/v1/rpc/fn_check_username_available')) {
            // Return false to indicate username is already taken
            return new Response(JSON.stringify(false), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          return originalFetch(url, opts);
        };

        const formData = new FormData();
        formData.set('username', 'existing_user');
        formData.set('email', 'newemail@example.com');
        formData.set('password', 'Password123');
        formData.set('confirmPassword', 'Password123');

        const res = await signUpWithEmailAction(formData);
        assert.equal(
          res.error,
          'This username is already taken. Please choose another username.'
        );
      } finally {
        delete (globalThis as unknown as { __mockCookies?: unknown }).__mockCookies;
        globalThis.fetch = originalFetch;
      }
    });

    test('registers successfully with username, email, and password requiring confirmation', async () => {
      const originalFetch = globalThis.fetch;
      try {
        let submittedMetadata: { username?: string; full_name?: string } | null = null;

        globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
          const urlStr = url.toString();
          if (urlStr.includes('/rest/v1/rpc/fn_check_username_available')) {
            return new Response(JSON.stringify(true), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          if (urlStr.includes('/auth/v1/signup')) {
            const body = typeof opts?.body === 'string' ? JSON.parse(opts.body) : {};
            submittedMetadata = body.data;
            return new Response(
              JSON.stringify({
                id: '00000000-0000-7000-8000-000000000099',
                email: 'newuser@example.com',
                confirmation_sent_at: '2026-10-25T11:00:00Z',
                session: null,
                user: {
                  id: '00000000-0000-7000-8000-000000000099',
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
        formData.set('username', 'NewUser_99');
        formData.set('email', 'newuser@example.com');
        formData.set('password', 'Password123');
        formData.set('confirmPassword', 'Password123');

        const res = await signUpWithEmailAction(formData);
        assert.equal(res.success, true);
        assert.equal(res.needsConfirmation, true);
        assert.equal(
          (submittedMetadata as { username?: string } | null)?.username,
          'newuser_99',
          'Username must be stored normalized in lowercase'
        );
      } finally {
        delete (globalThis as unknown as { __mockCookies?: unknown }).__mockCookies;
        globalThis.fetch = originalFetch;
      }
    });
  });

  // 3. Password Reset Request Action Validation
  describe('requestPasswordResetAction validation & privacy', () => {
    test('password recovery when given a username explains that recovery requires registered email without leaking email', async () => {
      const usernames = ['testuser', 'rahul_99', 'my-admin'];
      for (const username of usernames) {
        const formData = new FormData();
        formData.set('email', username);

        const res = await requestPasswordResetAction(formData);
        assert.equal(
          res.error,
          'Password recovery requires your registered email address. Please enter the email address associated with your account.',
          `Failed for username: ${username}`
        );
      }
    });

    test('password recovery when given an email dispatches reset and returns generic message', async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
          const urlStr = url.toString();
          if (urlStr.includes('/auth/v1/recover')) {
            return new Response(JSON.stringify({}), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          return originalFetch(url, opts);
        };

        const formData = new FormData();
        formData.set('email', 'registered@example.com');

        const res = await requestPasswordResetAction(formData);
        assert.ok(res.message);
        assert.ok(
          res.message.includes('If an account exists with this email address, a password recovery link has been dispatched')
        );
      } finally {
        delete (globalThis as unknown as { __mockCookies?: unknown }).__mockCookies;
        globalThis.fetch = originalFetch;
      }
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

  // 5. Existing Accounts & Claiming Usernames (setUsernameAction & checkUsernameAvailabilityAction)
  describe('setUsernameAction & checkUsernameAvailabilityAction', () => {
    test('setUsernameAction rejects invalid username characters and lengths', async () => {
      const invalidUsernames = ['a', 'user with space', 'ab@cd', 'a'.repeat(25)];
      for (const name of invalidUsernames) {
        const formData = new FormData();
        formData.set('username', name);

        const res = await setUsernameAction(formData);
        assert.equal(
          res.error,
          'Username must be between 3 and 20 characters and contain only letters, numbers, and underscores.'
        );
      }
    });

    test('checkUsernameAvailabilityAction checks valid and invalid format', async () => {
      const badRes = await checkUsernameAvailabilityAction('bad!');
      assert.equal(badRes.available, false);
      assert.ok(badRes.error);

      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
          const urlStr = url.toString();
          if (urlStr.includes('/rest/v1/rpc/fn_check_username_available')) {
            return new Response(JSON.stringify(true), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          return originalFetch(url, opts);
        };

        const goodRes = await checkUsernameAvailabilityAction('available_name');
        assert.equal(goodRes.available, true);
      } finally {
        delete (globalThis as unknown as { __mockCookies?: unknown }).__mockCookies;
        globalThis.fetch = originalFetch;
      }
    });

    test('setUsernameAction gracefully falls back to direct profile update when fn_set_own_username is missing from schema cache', async () => {
      const originalFetch = globalThis.fetch;
      try {
        let profileUpdated = false;
        let requestedUsername = '';

        (globalThis as unknown as { __mockCookies?: { name: string; value: string }[] }).__mockCookies = [
          {
            name: 'sb-127-auth-token',
            value: JSON.stringify({
              access_token: 'header.payload.signature',
              refresh_token: 'mock-refresh-token',
              expires_at: Math.floor(Date.now() / 1000) + 3600,
              user: {
                id: '00000000-0000-7000-8000-000000000001',
                email: 'user@example.com',
              },
            }),
          },
        ];

        globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
          const urlStr = url.toString();

          if (urlStr.includes('/auth/v1/user')) {
            return new Response(
              JSON.stringify({
                id: '00000000-0000-7000-8000-000000000001',
                email: 'user@example.com',
                user_metadata: {},
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }

          if (urlStr.includes('/rest/v1/rpc/fn_set_own_username')) {
            return new Response(
              JSON.stringify({
                code: 'PGRST202',
                message: 'Could not find the function public.fn_set_own_username(p_username) in the schema cache',
              }),
              { status: 404, headers: { 'Content-Type': 'application/json' } }
            );
          }

          if (urlStr.includes('/rest/v1/profiles')) {
            const body = typeof opts?.body === 'string' ? JSON.parse(opts.body) : {};
            profileUpdated = true;
            requestedUsername = body.username;
            return new Response(
              JSON.stringify([{ id: '00000000-0000-7000-8000-000000000001', username: requestedUsername }]),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }

          return originalFetch(url, opts);
        };

        const formData = new FormData();
        formData.set('username', 'fallback_user');

        const res = await setUsernameAction(formData);
        assert.equal(res.success, true);
        assert.ok(profileUpdated, 'Direct profile update should have succeeded as fallback');
        assert.equal(requestedUsername, 'fallback_user');
      } finally {
        delete (globalThis as unknown as { __mockCookies?: unknown }).__mockCookies;
        globalThis.fetch = originalFetch;
      }
    });
  });

  // 6. Sign In with Unconfirmed Account & Confirmation States
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
        formData.set('identifier', 'unconfirmed@example.com');
        formData.set('password', 'ValidPass123!');

        const res = await signInWithEmailAction(formData);
        assert.ok(res.error);
        assert.ok(
          res.error.includes('Your email address has not been confirmed yet'),
          'Expected clear unconfirmed email message'
        );
      } finally {
        delete (globalThis as unknown as { __mockCookies?: unknown }).__mockCookies;
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
        assert.ok(
          res.message?.includes('confirmation') &&
          (res.message?.includes('dispatched') || res.message?.includes('sent'))
        );
      } finally {
        delete (globalThis as unknown as { __mockCookies?: unknown }).__mockCookies;
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
        delete (globalThis as unknown as { __mockCookies?: unknown }).__mockCookies;
        globalThis.fetch = originalFetch;
      }
    });

    test('resendConfirmationEmailAction reports actionable error when SMTP fails', async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
          if (url.toString().includes('/auth/v1/resend')) {
            return new Response(
              JSON.stringify({
                error: 'smtp_error',
                message: 'Error sending confirmation email: 535 Authentication Failed',
              }),
              { status: 500, headers: { 'Content-Type': 'application/json' } }
            );
          }
          return originalFetch(url, opts);
        };

        const formData = new FormData();
        formData.set('email', 'unconfirmed@example.com');

        const res = await resendConfirmationEmailAction(formData);
        assert.ok(res.error);
        assert.ok(
          res.error.includes('Unable to dispatch confirmation email') ||
          res.error.includes('Google App Password'),
          'Expected actionable SMTP diagnostic error'
        );
      } finally {
        delete (globalThis as unknown as { __mockCookies?: unknown }).__mockCookies;
        globalThis.fetch = originalFetch;
      }
    });
  });

  // 7. Delete Account Action Validation & Execution
  describe('deleteAccountAction security invariants & purge execution', () => {
    test('rejects missing or non-matching confirmation string', async () => {
      const formData = new FormData();
      formData.set('confirmation', 'delete'); // lowercase!
      formData.set('password', 'SecretPass123!');

      const res = await deleteAccountAction(formData);
      assert.equal(res.success, undefined);
      assert.match(res.error || '', /must type DELETE/);
    });

    test('rejects unauthenticated user', async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
          if (url.toString().includes('/auth/v1/user')) {
            return new Response(JSON.stringify({ error: 'invalid_token' }), {
              status: 401,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          return originalFetch(url, opts);
        };

        const formData = new FormData();
        formData.set('confirmation', 'DELETE');
        formData.set('password', 'SecretPass123!');

        const res = await deleteAccountAction(formData);
        assert.match(res.error || '', /Active session required/);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('rejects email/password user if password is not provided', async () => {
      const originalFetch = globalThis.fetch;
      try {
        (globalThis as unknown as { __mockCookies?: { name: string; value: string }[] }).__mockCookies = [
          {
            name: 'sb-127-auth-token',
            value: JSON.stringify({
              access_token: 'header.payload.signature',
              refresh_token: 'mock-refresh-token',
              expires_at: Math.floor(Date.now() / 1000) + 3600,
              user: {
                id: '00000000-0000-7000-8000-000000000001',
                email: 'delete_me@example.com',
                app_metadata: { provider: 'email' },
              },
            }),
          },
        ];

        globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
          if (url.toString().includes('/auth/v1/user')) {
            return new Response(
              JSON.stringify({
                id: '00000000-0000-7000-8000-000000000001',
                email: 'delete_me@example.com',
                app_metadata: { provider: 'email' },
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
          return originalFetch(url, opts);
        };

        const formData = new FormData();
        formData.set('confirmation', 'DELETE');
        formData.set('password', '');

        const res = await deleteAccountAction(formData);
        assert.match(res.error || '', /Current password is required/);
      } finally {
        delete (globalThis as unknown as { __mockCookies?: unknown }).__mockCookies;
        globalThis.fetch = originalFetch;
      }
    });

    test('rejects email/password user if password is incorrect', async () => {
      const originalFetch = globalThis.fetch;
      try {
        (globalThis as unknown as { __mockCookies?: { name: string; value: string }[] }).__mockCookies = [
          {
            name: 'sb-127-auth-token',
            value: JSON.stringify({
              access_token: 'header.payload.signature',
              refresh_token: 'mock-refresh-token',
              expires_at: Math.floor(Date.now() / 1000) + 3600,
              user: {
                id: '00000000-0000-7000-8000-000000000001',
                email: 'delete_me@example.com',
                app_metadata: { provider: 'email' },
              },
            }),
          },
        ];

        globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
          const urlStr = url.toString();
          if (urlStr.includes('/auth/v1/user')) {
            return new Response(
              JSON.stringify({
                id: '00000000-0000-7000-8000-000000000001',
                email: 'delete_me@example.com',
                app_metadata: { provider: 'email' },
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
          if (urlStr.includes('/auth/v1/token')) {
            return new Response(
              JSON.stringify({
                error: 'invalid_grant',
                error_description: 'Invalid login credentials',
              }),
              { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
          }
          return originalFetch(url, opts);
        };

        const formData = new FormData();
        formData.set('confirmation', 'DELETE');
        formData.set('password', 'WrongPassword123!');

        const res = await deleteAccountAction(formData);
        assert.match(res.error || '', /Incorrect password/);
      } finally {
        delete (globalThis as unknown as { __mockCookies?: unknown }).__mockCookies;
        globalThis.fetch = originalFetch;
      }
    });

    test('executes fn_delete_own_account, signs out, and redirects when confirmed and authorized', async () => {
      const originalFetch = globalThis.fetch;
      let rpcPurgeCalled = false;
      let signOutCalled = false;

      try {
        (globalThis as unknown as { __mockCookies?: { name: string; value: string }[] }).__mockCookies = [
          {
            name: 'sb-127-auth-token',
            value: JSON.stringify({
              access_token: 'header.payload.signature',
              refresh_token: 'mock-refresh-token',
              expires_at: Math.floor(Date.now() / 1000) + 3600,
              user: {
                id: '00000000-0000-7000-8000-000000000001',
                email: 'delete_me@example.com',
                app_metadata: { provider: 'email' },
              },
            }),
          },
        ];

        globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
          const urlStr = url.toString();
          if (urlStr.includes('/auth/v1/user')) {
            return new Response(
              JSON.stringify({
                id: '00000000-0000-7000-8000-000000000001',
                email: 'delete_me@example.com',
                app_metadata: { provider: 'email' },
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
          if (urlStr.includes('/auth/v1/token')) {
            return new Response(
              JSON.stringify({
                access_token: 'header.payload.signature',
                token_type: 'bearer',
                expires_in: 3600,
                refresh_token: 'fake-refresh-token',
                user: { id: '00000000-0000-7000-8000-000000000001', email: 'delete_me@example.com' },
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
          if (urlStr.includes('/rest/v1/rpc/fn_delete_own_account')) {
            rpcPurgeCalled = true;
            return new Response(JSON.stringify(true), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          if (urlStr.includes('/auth/v1/logout')) {
            signOutCalled = true;
            return new Response(JSON.stringify({}), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          return originalFetch(url, opts);
        };

        const formData = new FormData();
        formData.set('confirmation', 'DELETE');
        formData.set('password', 'CorrectPassword123!');

        const res = await deleteAccountAction(formData);
        assert.equal(res.success, true);
        assert.ok(rpcPurgeCalled, 'Expected RPC fn_delete_own_account to have been invoked');
        assert.ok(signOutCalled, 'Expected user to be signed out');
        assert.equal(res.redirectUrl, '/login?message=account_deleted');
      } finally {
        delete (globalThis as unknown as { __mockCookies?: unknown }).__mockCookies;
        globalThis.fetch = originalFetch;
      }
    });
  });

  // 8. Authenticated Set / Update Account Password Action (Google and Email accounts)
  describe('setAccountPasswordAction validation & execution', () => {
    test('rejects empty or password shorter than 8 characters', async () => {
      const formData = new FormData();
      formData.set('password', 'short7');
      formData.set('confirmPassword', 'short7');

      const res = await setAccountPasswordAction(formData);
      assert.equal(res.error, 'New password must be at least 8 characters in length.');
    });

    test('rejects mismatching confirm password', async () => {
      const formData = new FormData();
      formData.set('password', 'StrongPass123!');
      formData.set('confirmPassword', 'MismatchPass456!');

      const res = await setAccountPasswordAction(formData);
      assert.equal(res.error, 'Passwords do not match. Please verify both fields.');
    });

    test('rejects when user is not authenticated or session expired', async () => {
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
        formData.set('password', 'StrongPass123!');
        formData.set('confirmPassword', 'StrongPass123!');

        const res = await setAccountPasswordAction(formData);
        assert.equal(
          res.error,
          'Your session has expired. Please sign in again before setting a password.'
        );
      } finally {
        delete (globalThis as unknown as { __mockCookies?: unknown }).__mockCookies;
        globalThis.fetch = originalFetch;
      }
    });

    test('successfully updates password via supabase.auth.updateUser for authenticated Google user', async () => {
      const originalFetch = globalThis.fetch;
      try {
        let updateUserCalled = false;
        let submittedPassword = '';

        (globalThis as unknown as { __mockCookies?: { name: string; value: string }[] }).__mockCookies = [
          {
            name: 'sb-127-auth-token',
            value: JSON.stringify({
              access_token: 'google-session-token',
              refresh_token: 'mock-refresh-token',
              expires_at: Math.floor(Date.now() / 1000) + 3600,
              user: {
                id: 'google-user-12345',
                email: 'googleuser@gmail.com',
                app_metadata: { provider: 'google', providers: ['google'] },
              },
            }),
          },
        ];

        globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
          const urlStr = url.toString();
          if (urlStr.includes('/auth/v1/user')) {
            if (opts?.method === 'PUT') {
              updateUserCalled = true;
              const body = JSON.parse((opts?.body as string) || '{}');
              if (body.password) submittedPassword = body.password;
              return new Response(
                JSON.stringify({
                  id: 'google-user-12345',
                  email: 'googleuser@gmail.com',
                  app_metadata: { provider: 'google', providers: ['google', 'email'] },
                }),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
              );
            }
            return new Response(
              JSON.stringify({
                id: 'google-user-12345',
                email: 'googleuser@gmail.com',
                app_metadata: { provider: 'google', providers: ['google'] },
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
          return originalFetch(url, opts);
        };

        const formData = new FormData();
        formData.set('password', 'NewSecurePassword123!');
        formData.set('confirmPassword', 'NewSecurePassword123!');

        const res = await setAccountPasswordAction(formData);
        assert.equal(res.success, true);
        assert.ok(updateUserCalled, 'Expected updateUser to be called');
        assert.equal(submittedPassword, 'NewSecurePassword123!');
        assert.ok(
          res.message?.includes('Password successfully set!'),
          'Expected confirmation message'
        );
      } finally {
        delete (globalThis as unknown as { __mockCookies?: unknown }).__mockCookies;
        globalThis.fetch = originalFetch;
      }
    });

    test('gracefully handles security policy reauthentication requirement', async () => {
      const originalFetch = globalThis.fetch;
      try {
        (globalThis as unknown as { __mockCookies?: { name: string; value: string }[] }).__mockCookies = [
          {
            name: 'sb-127-auth-token',
            value: JSON.stringify({
              access_token: 'old-session-token',
              refresh_token: 'mock-refresh-token',
              expires_at: Math.floor(Date.now() / 1000) + 3600,
              user: {
                id: 'google-user-12345',
                email: 'googleuser@gmail.com',
                app_metadata: { provider: 'google', providers: ['google'] },
              },
            }),
          },
        ];

        globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
          const urlStr = url.toString();
          if (urlStr.includes('/auth/v1/user')) {
            if (opts?.method === 'PUT') {
              return new Response(
                JSON.stringify({
                  message: 'A recent login is required to change password',
                  error: 'reauthentication_needed',
                }),
                { status: 422, headers: { 'Content-Type': 'application/json' } }
              );
            }
            return new Response(
              JSON.stringify({
                id: 'google-user-12345',
                email: 'googleuser@gmail.com',
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
          return originalFetch(url, opts);
        };

        const formData = new FormData();
        formData.set('password', 'NewSecurePassword123!');
        formData.set('confirmPassword', 'NewSecurePassword123!');

        const res = await setAccountPasswordAction(formData);
        assert.ok(
          res.error?.includes('recent authentication before setting a password'),
          `Expected reauthentication guidance, got: ${res.error}`
        );
      } finally {
        delete (globalThis as unknown as { __mockCookies?: unknown }).__mockCookies;
        globalThis.fetch = originalFetch;
      }
    });
  });
});
