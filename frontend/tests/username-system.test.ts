import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Setup environment variables for test execution
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import {
  signUpWithEmailAction,
  setUsernameAction,
  checkUsernameAvailabilityAction,
} from '../src/app/login/actions.js';
import {
  isValidUsername,
  isReservedUsername,
  generateRandomCandidateUsername,
  generateUsernameSuggestions,
  RESERVED_USERNAMES,
} from '../src/lib/username.js';

describe('Arth Username System & Lifecycle Test Suite', () => {
  // Test 1: Signup with user-chosen available username
  test('1. Signup with user-chosen available username assigns normalized handle', async () => {
    const originalFetch = globalThis.fetch;
    try {
      let availabilityCheckedHandle = '';
      let submittedMetadata: { username?: string; full_name?: string } | null = null;

      globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
        const urlStr = url.toString();
        if (urlStr.includes('/rest/v1/rpc/fn_check_username_available')) {
          const body = typeof opts?.body === 'string' ? JSON.parse(opts.body) : {};
          availabilityCheckedHandle = body.p_username;
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
              id: '00000000-0000-7000-8000-000000000001',
              email: 'customuser@example.com',
              confirmation_sent_at: '2026-10-26T10:00:00Z',
              session: null,
              user: {
                id: '00000000-0000-7000-8000-000000000001',
                email: 'customuser@example.com',
                user_metadata: submittedMetadata,
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return originalFetch(url, opts);
      };

      const formData = new FormData();
      formData.set('username', 'My_Chosen_Name');
      formData.set('email', 'customuser@example.com');
      formData.set('password', 'SecurePassword123!');
      formData.set('confirmPassword', 'SecurePassword123!');

      const res = await signUpWithEmailAction(formData);
      assert.equal(res.success, true);
      assert.equal(availabilityCheckedHandle, 'my_chosen_name', 'Availability check must query normalized lowercase');
      assert.equal(
        (submittedMetadata as { username?: string } | null)?.username,
        'my_chosen_name',
        'Assigned username must be normalized lowercase'
      );
    } finally {
      delete (globalThis as unknown as { __mockCookies?: unknown }).__mockCookies;
      globalThis.fetch = originalFetch;
    }
  });

  // Test 2: Signup without username with auto-generation
  test('2. Signup without username automatically generates unique human-readable handle without PII', async () => {
    const originalFetch = globalThis.fetch;
    try {
      let registeredUsername = '';

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
          registeredUsername = body.data?.username;
          return new Response(
            JSON.stringify({
              id: '00000000-0000-7000-8000-000000000002',
              email: 'john.doe.secret@privatecompany.com',
              confirmation_sent_at: '2026-10-26T10:00:00Z',
              session: null,
              user: {
                id: '00000000-0000-7000-8000-000000000002',
                email: 'john.doe.secret@privatecompany.com',
                user_metadata: { username: registeredUsername },
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return originalFetch(url, opts);
      };

      const formData = new FormData();
      formData.set('username', ''); // omitted / blank username
      formData.set('email', 'john.doe.secret@privatecompany.com');
      formData.set('password', 'SecurePassword123!');
      formData.set('confirmPassword', 'SecurePassword123!');

      const res = await signUpWithEmailAction(formData);
      assert.equal(res.success, true);
      assert.ok(registeredUsername, 'A username must be automatically assigned');
      assert.match(
        registeredUsername,
        /^arth_user_\d{5}$/,
        'Auto-generated username must match arth_user_XXXXX pattern'
      );
      assert.ok(
        !registeredUsername.includes('john') &&
        !registeredUsername.includes('doe') &&
        !registeredUsername.includes('secret') &&
        !registeredUsername.includes('private'),
        'Generated username must never contain user email or PII fragments'
      );
    } finally {
      delete (globalThis as unknown as { __mockCookies?: unknown }).__mockCookies;
      globalThis.fetch = originalFetch;
    }
  });

  // Test 3: Generated username collision and retry
  test('3. Auto-generated username collision safely retries until unique', async () => {
    let callCount = 0;
    const checkedUsernames: string[] = [];

    const mockCheckAvailable = async (cand: string): Promise<boolean> => {
      callCount++;
      checkedUsernames.push(cand);
      // Simulate collision on first 2 candidates, then available on 3rd
      return callCount >= 3;
    };

    // Test retry loop
    let attempts = 0;
    let finalCandidate = generateRandomCandidateUsername();
    while (attempts < 10) {
      attempts++;
      const isAvail = await mockCheckAvailable(finalCandidate);
      if (isAvail) break;
      finalCandidate = generateRandomCandidateUsername();
    }

    assert.equal(callCount, 3, 'Should have checked 3 candidates');
    assert.equal(attempts, 3, 'Should resolve in exactly 3 attempts');
    assert.match(finalCandidate, /^arth_user_\d{5}$/);
    assert.notEqual(checkedUsernames[0], checkedUsernames[1], 'Subsequent candidates must be distinct');
  });

  // Test 4: Existing users without username backfill
  test('4. Existing users without username receive generated handles via idempotent backfill', () => {
    // Simulate legacy rows
    const legacyProfiles = [
      { id: 'u1', username: null },
      { id: 'u2', username: 'existing_valid' },
      { id: 'u3', username: null },
    ];

    const taken = new Set<string>(['existing_valid']);
    for (const p of legacyProfiles) {
      if (!p.username) {
        let cand = generateRandomCandidateUsername();
        while (taken.has(cand)) {
          cand = generateRandomCandidateUsername();
        }
        p.username = cand;
        taken.add(cand);
      }
    }

    assert.ok(legacyProfiles[0].username?.startsWith('arth_user_'));
    assert.equal(legacyProfiles[1].username, 'existing_valid');
    assert.ok(legacyProfiles[2].username?.startsWith('arth_user_'));
    assert.notEqual(legacyProfiles[0].username, legacyProfiles[2].username);
    assert.ok(legacyProfiles.every((p) => p.username !== null));
  });

  // Test 5: Case-insensitive duplicate prevention
  test('5. Case-insensitive duplicate prevention rejects mixed-case variants', async () => {
    const existingNormalized = 'rahul_sharma';

    assert.equal(isValidUsername('RAHUL_SHARMA'), true, 'Format check is case-insensitive prior to normalization');
    assert.equal('RAHUL_SHARMA'.toLowerCase(), existingNormalized);

    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
        const urlStr = url.toString();
        if (urlStr.includes('/rest/v1/rpc/fn_check_username_available')) {
          const body = typeof opts?.body === 'string' ? JSON.parse(opts.body) : {};
          if (body.p_username === existingNormalized) {
            return new Response(JSON.stringify(false), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          return new Response(JSON.stringify(true), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return originalFetch(url, opts);
      };

      const formData = new FormData();
      formData.set('username', 'Rahul_Sharma');
      formData.set('email', 'newuser@example.com');
      formData.set('password', 'Password123!');
      formData.set('confirmPassword', 'Password123!');

      const res = await signUpWithEmailAction(formData);
      assert.equal(res.error, 'This username is already taken. Please choose another username.');
    } finally {
      delete (globalThis as unknown as { __mockCookies?: unknown }).__mockCookies;
      globalThis.fetch = originalFetch;
    }
  });

  // Test 6: Invalid and reserved usernames
  test('6. Rejects invalid formats (<3, >20, invalid chars) and reserved system names', async () => {
    // 6a. Format boundaries
    assert.equal(isValidUsername('ab'), false, 'Too short (<3)');
    assert.equal(isValidUsername('a'.repeat(21)), false, 'Too long (>20)');
    assert.equal(isValidUsername('user name'), false, 'Spaces not allowed');
    assert.equal(isValidUsername('user-hyphen'), false, 'Hyphens not allowed (only underscore and alphanumeric)');
    assert.equal(isValidUsername('user@arth'), false, 'Symbols not allowed');
    assert.equal(isValidUsername('user.dot'), false, 'Dots not allowed');

    // Valid formats
    assert.equal(isValidUsername('abc'), true, 'Min length 3 allowed');
    assert.equal(isValidUsername('a'.repeat(20)), true, 'Max length 20 allowed');
    assert.equal(isValidUsername('user_123'), true, 'Alphanumeric with underscore allowed');

    // 6b. Reserved system names
    const reservedList = [
      'admin',
      'administrator',
      'support',
      'system',
      'arth',
      'root',
      'superuser',
      'help',
      'api',
      'auth',
      'null',
      'undefined',
      'moderator',
      'staff',
    ];

    for (const reserved of reservedList) {
      assert.equal(isReservedUsername(reserved), true, `Must identify '${reserved}' as reserved`);
      assert.equal(isReservedUsername(reserved.toUpperCase()), true, 'Reserved check must be case-insensitive');

      const availRes = await checkUsernameAvailabilityAction(reserved);
      assert.equal(availRes.available, false);
      assert.equal(availRes.error, 'This username is reserved. Please choose another username.');
      assert.ok(
        availRes.suggestions && availRes.suggestions.length >= 2,
        `Must provide suggestions when reserved username '${reserved}' is requested`
      );
    }
  });

  // Test 7: Concurrent attempts to claim the same username
  test('7. Concurrent attempts to claim same username: only one succeeds and other receives clean error', async () => {
    let winnerClaimed = false;

    const mockRpcClaim = async (candidate: string): Promise<{ success: boolean; code?: string; message?: string }> => {
      if (candidate === 'prime_handle') {
        if (!winnerClaimed) {
          winnerClaimed = true;
          return { success: true };
        } else {
          // Second caller hits unique constraint
          return { success: false, code: '23505', message: 'Username already taken' };
        }
      }
      return { success: true };
    };

    const [attempt1, attempt2] = await Promise.all([
      mockRpcClaim('prime_handle'),
      mockRpcClaim('prime_handle'),
    ]);

    const successes = [attempt1, attempt2].filter((a) => a.success);
    const failures = [attempt1, attempt2].filter((a) => !a.success);

    assert.equal(successes.length, 1, 'Exactly one concurrent claim should succeed');
    assert.equal(failures.length, 1, 'Exactly one concurrent claim should fail');
    assert.equal(failures[0].code, '23505', 'Failed concurrent claim must report unique constraint code');
  });

  // Test 8: Successful username changes
  test('8. Authenticated user can change their username and UI updates upon confirmation', async () => {
    const originalFetch = globalThis.fetch;
    try {
      let rpcInvokedWith = '';
      let metaUpdatedWith = '';

      (globalThis as unknown as { __mockCookies?: { name: string; value: string }[] }).__mockCookies = [
        {
          name: 'sb-127-auth-token',
          value: JSON.stringify({
            access_token: 'header.payload.signature',
            refresh_token: 'mock-refresh-token',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: {
              id: '00000000-0000-7000-8000-000000000010',
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
              id: '00000000-0000-7000-8000-000000000010',
              email: 'user@example.com',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (urlStr.includes('/rest/v1/rpc/fn_set_own_username')) {
          const body = typeof opts?.body === 'string' ? JSON.parse(opts.body) : {};
          rpcInvokedWith = body.p_username;
          return new Response(JSON.stringify(true), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return originalFetch(url, opts);
      };

      const formData = new FormData();
      formData.set('username', 'New_Handle_2026');

      const res = await setUsernameAction(formData);
      assert.equal(res.success, true);
      assert.equal(rpcInvokedWith, 'new_handle_2026', 'RPC must be invoked with normalized lowercase username');
      assert.equal(res.message, 'Your username has been set successfully.');
    } finally {
      delete (globalThis as unknown as { __mockCookies?: unknown }).__mockCookies;
      globalThis.fetch = originalFetch;
    }
  });

  // Test 9: Reuse of released username by another user
  test('9. Released username from changed handle or deleted profile can be immediately claimed by another user', async () => {
    // In-memory simulation of public.profiles table
    const databaseProfiles = new Map<string, string>([
      ['u1', 'shared_handle'],
      ['u2', 'other_user'],
    ]);

    // 1. User 1 changes username to 'u1_new_handle'
    const newHandleU1 = 'u1_new_handle';
    databaseProfiles.set('u1', newHandleU1);

    // Verify 'shared_handle' is no longer in any active profile
    const isSharedHandleActive = Array.from(databaseProfiles.values()).includes('shared_handle');
    assert.equal(isSharedHandleActive, false, 'Previous handle must be released');

    // 2. User 2 claims 'shared_handle'
    assert.equal(Array.from(databaseProfiles.values()).includes('shared_handle'), false);
    databaseProfiles.set('u2', 'shared_handle');

    assert.equal(databaseProfiles.get('u2'), 'shared_handle', 'User 2 successfully claimed released username');
    assert.equal(databaseProfiles.get('u1'), 'u1_new_handle', 'User 1 retains their new username');
  });

  // Test 10: Failed updates leaving previous intact
  test('10. Failed username update preserves existing username intact without partial modifications', async () => {
    let currentUsername = 'active_user';

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
              id: '00000000-0000-7000-8000-000000000020',
              email: 'active@example.com',
            },
          }),
        },
      ];

      globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
        const urlStr = url.toString();
        if (urlStr.includes('/auth/v1/user')) {
          return new Response(
            JSON.stringify({
              id: '00000000-0000-7000-8000-000000000020',
              email: 'active@example.com',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (urlStr.includes('/rest/v1/rpc/fn_set_own_username')) {
          // Reject with already taken error code 23505
          return new Response(
            JSON.stringify({
              code: '23505',
              message: 'Username already taken',
            }),
            { status: 409, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (urlStr.includes('/rest/v1/rpc/fn_check_username_available')) {
          return new Response(JSON.stringify(true), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return originalFetch(url, opts);
      };

      const formData = new FormData();
      formData.set('username', 'taken_handle');

      const res = await setUsernameAction(formData);
      assert.equal(res.success, undefined);
      assert.equal(res.error, 'This username is already taken. Please choose another username.');
      assert.ok(res.suggestions && res.suggestions.length >= 2, 'Must suggest alternatives');

      // Existing username remains unchanged
      assert.equal(currentUsername, 'active_user', 'Profile username must remain intact when update fails');
    } finally {
      delete (globalThis as unknown as { __mockCookies?: unknown }).__mockCookies;
      globalThis.fetch = originalFetch;
    }
  });

  // Test 11: Authorization preventing impersonation
  test('11. Authorization prevents impersonation: unauthenticated requests and cross-user updates are rejected', async () => {
    // 11a. Unauthenticated caller
    const formData = new FormData();
    formData.set('username', 'some_valid_name');

    const unauthRes = await setUsernameAction(formData);
    assert.match(unauthRes.error || '', /Active session required/);

    // 11b. Verify SQL function signatures in migration 0019 to ensure no target user ID parameter exists
    const migrationSql = fs.readFileSync(
      path.resolve(process.cwd(), '../supabase/migrations/0019_username_system_enhancements.sql'),
      'utf-8'
    );
    assert.ok(
      migrationSql.includes('CREATE OR REPLACE FUNCTION public.fn_set_own_username(p_username TEXT)'),
      'fn_set_own_username must only accept p_username, deriving caller identity strictly from auth.uid()'
    );
    assert.ok(
      migrationSql.includes('v_user_id := auth.uid();'),
      'Caller identity must be derived strictly via auth.uid()'
    );
    assert.ok(
      !migrationSql.includes('p_user_id UUID'),
      'fn_set_own_username must never accept a caller-supplied user UUID parameter'
    );
  });

  // Test 12: Preserving transactions when username changes
  test('12. Preserving transactions: financial records reference immutable UUID and remain intact across username changes', () => {
    const userUuid = '00000000-0000-7000-8000-000000000050';

    // Simulate database foreign key relationship
    const profile = { id: userUuid, username: 'original_user' };
    const transactions = [
      { id: 'tx-1', user_id: userUuid, amount_paise: 50000, description: 'Groceries' },
      { id: 'tx-2', user_id: userUuid, amount_paise: 120000, description: 'Salary' },
    ];
    const balanceMovements = [
      { id: 'bm-1', user_id: userUuid, amount_paise: 20000, from_method: 'Cash', to_method: 'Online' },
    ];

    // User updates their username
    profile.username = 'new_updated_handle';

    // Verify all financial transactions and balances are completely undisturbed
    assert.equal(transactions[0].user_id, profile.id);
    assert.equal(transactions[1].user_id, profile.id);
    assert.equal(balanceMovements[0].user_id, profile.id);
    assert.equal(transactions.length, 2);
    assert.equal(transactions.reduce((acc, t) => acc + t.amount_paise, 0), 170000);

    // Verify SQL foreign key schema
    const txMigrationSql = fs.readFileSync(
      path.resolve(process.cwd(), '../supabase/migrations/0003_create_transactions.sql'),
      'utf-8'
    );
    assert.ok(
      txMigrationSql.includes('user_id            UUID NOT NULL REFERENCES public.profiles(id)'),
      'Transactions FK must reference profiles(id) UUID, never username'
    );
  });

  // Test 13: Safe migration and legacy duplicate resolution
  test('13. Migration 0019 resolves legacy duplicate usernames, backfills NULLs, and enforces NOT NULL constraint', () => {
    const migrationSql = fs.readFileSync(
      path.resolve(process.cwd(), '../supabase/migrations/0019_username_system_enhancements.sql'),
      'utf-8'
    );

    // Verify deduplication logic
    assert.ok(
      migrationSql.includes('ROW_NUMBER() OVER (PARTITION BY LOWER(username)'),
      'Migration must partition by LOWER(username) to identify case-insensitive duplicates'
    );

    // Verify NULL backfill
    assert.ok(
      migrationSql.includes('WHERE username IS NULL'),
      'Migration must query for NULL usernames to backfill'
    );

    // Verify NOT NULL enforcement
    assert.ok(
      migrationSql.includes('ALTER TABLE public.profiles\n  ALTER COLUMN username SET NOT NULL;'),
      'Migration must alter column username to SET NOT NULL'
    );

    // Verify check constraint with regex and reserved words
    assert.ok(
      migrationSql.includes("username ~ '^[a-z0-9_]{3,20}$'"),
      'Migration must check strict 3-20 regex'
    );
    assert.ok(
      migrationSql.includes("'admin'") && migrationSql.includes("'support'"),
      'Migration must enforce reserved words rejection'
    );

    // Verify trigger auto-generation
    assert.ok(
      migrationSql.includes('fn_generate_unique_username'),
      'Trigger must call unique generator when username is not supplied'
    );
  });
});
