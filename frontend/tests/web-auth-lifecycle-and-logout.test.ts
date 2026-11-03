import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authEvents, type AuthSyncMessage } from '../src/features/auth/auth-events.js';
import { syncEngine } from '../src/features/sync/sync-engine.js';
import { POST, GET } from '../src/app/auth/logout/route.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

describe('Web Authentication, Multi-Tab Sync, Logout & Session Restoration Test Suite', () => {
  describe('1. Multi-Tab Authentication Synchronization & Events', () => {
    test('authEvents broadcasts and delivers LOGOUT message to active listeners', async () => {
      let received: AuthSyncMessage | null = null;
      const unsubscribe = authEvents.subscribe((msg) => {
        received = msg;
      });

      authEvents.emitLogout();

      assert.ok(received, 'Listener must receive logout event');
      assert.equal((received as AuthSyncMessage).type, 'LOGOUT');
      assert.ok(typeof (received as AuthSyncMessage).timestamp === 'number');

      unsubscribe();
    });

    test('authEvents broadcasts and delivers SESSION_EXPIRED message to active listeners', async () => {
      let received: AuthSyncMessage | null = null;
      const unsubscribe = authEvents.subscribe((msg) => {
        received = msg;
      });

      authEvents.emitSessionExpired();

      assert.ok(received, 'Listener must receive session expired event');
      assert.equal((received as AuthSyncMessage).type, 'SESSION_EXPIRED');
      assert.ok(typeof (received as AuthSyncMessage).timestamp === 'number');

      unsubscribe();
    });

    test('SyncEngine halts and transitions to Authentication session expired on notifyAuthSessionExpired', () => {
      syncEngine.notifyAuthSessionExpired();
      const state = syncEngine.getState();
      assert.equal(state.lastError, 'Authentication session expired');
      assert.equal(state.mutationError, 'Authentication session expired');
    });
  });

  describe('2. Server-Side Logout Route (/auth/logout)', () => {
    test('POST with Accept: application/json returns 200 JSON unauthenticated status', async () => {
      const req = new Request('http://localhost:3000/auth/logout', {
        method: 'POST',
        headers: {
          accept: 'application/json',
        },
      });

      const res = await POST(req);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.ok, true);
      assert.equal(data.status, 'UNAUTHENTICATED');
    });

    test('POST with standard form submission returns 303 redirect to /login', async () => {
      const req = new Request('http://localhost:3000/auth/logout', {
        method: 'POST',
      });

      const res = await POST(req);
      assert.equal(res.status, 303);
      assert.ok(res.headers.get('location')?.endsWith('/login'));
    });

    test('GET request returns redirect to /login', async () => {
      const req = new Request('http://localhost:3000/auth/logout', {
        method: 'GET',
      });

      const res = await GET(req);
      assert.ok(res.status === 303 || res.status === 302 || res.status === 307);
      assert.ok(res.headers.get('location')?.endsWith('/login'));
    });

    test('/auth/logout implementation binds response to createClient and clears session cookies', () => {
      const logoutRoutePath = path.join(projectRoot, 'src/app/auth/logout/route.ts');
      const content = fs.readFileSync(logoutRoutePath, 'utf8');

      assert.ok(
        content.includes('createClient(response)'),
        'Must pass response to createClient so Set-Cookie deletion headers attach to the redirect'
      );
      assert.ok(
        content.includes('maxAge: 0') && content.includes('expires: new Date(0)'),
        'Must authoritatively expire session and auth cookies'
      );
    });
  });

  describe('3. Prevention of Infinite Logout & Session Expiration Loop', () => {
    test('TransactionAppShell performs sign-out on physical mobile and desktop browsers without isPwa guard', () => {
      const shellPath = path.join(projectRoot, 'src/features/transactions/TransactionAppShell.tsx');
      const content = fs.readFileSync(shellPath, 'utf8');

      assert.ok(
        !content.includes('if (!isPwa) return;'),
        'TransactionAppShell must not block sign-out when not in installed PWA standalone mode'
      );
      assert.ok(
        content.includes('const { signOut } = useAuth()'),
        'TransactionAppShell must use unified signOut hook'
      );
      assert.ok(
        content.includes('<AuthProvider user={user}>'),
        'TransactionAppShell must wrap shell with AuthProvider'
      );
    });

    test('AuthForm clears cached PWA user on error and prevents bounce loops back to root', () => {
      const authFormPath = path.join(projectRoot, 'src/app/login/AuthForm.tsx');
      const content = fs.readFileSync(authFormPath, 'utf8');

      assert.ok(
        content.includes('clearCachedPwaUserContext()'),
        'AuthForm must clear cached PWA user context when error or logout query is present'
      );
      assert.ok(
        content.includes('const isOffline = typeof navigator !== \'undefined\' && !navigator.onLine'),
        'AuthForm must only consider offline status before hydrating root PWA entry'
      );
    });

    test('UnauthenticatedHome guards cached user restoration: only hydrates when offline', () => {
      const homePath = path.join(projectRoot, 'src/app/UnauthenticatedHome.tsx');
      const content = fs.readFileSync(homePath, 'utf8');

      assert.ok(
        content.includes('const isOffline = typeof navigator !== \'undefined\' && !navigator.onLine'),
        'UnauthenticatedHome must check offline status'
      );
      assert.ok(
        content.includes('clearCachedPwaUserContext()'),
        'UnauthenticatedHome must clean up stale user context when reached online without a server session'
      );
      assert.ok(
        content.includes('<TransactionAppShell user={cachedUser} />'),
        'Must preserve invariant for offline rendering'
      );
    });
  });

  describe('4. Financial Data Preservation on Logout', () => {
    test('clearCachedPwaUserContext in offline-db only deletes active user pointer, never transactions or outbox', () => {
      const dbPath = path.join(projectRoot, 'src/lib/offline-db.ts');
      const content = fs.readFileSync(dbPath, 'utf8');

      const clearFnMatch = content.match(
        /export async function clearCachedPwaUserContext\(\)[\s\S]*?^}/m
      );
      assert.ok(clearFnMatch, 'clearCachedPwaUserContext function must exist');
      const fnBody = clearFnMatch[0];

      assert.ok(
        fnBody.includes("tx.objectStore('pwa_context').delete('current')"),
        'Must delete only active current pointer in pwa_context store'
      );
      assert.ok(
        !fnBody.includes('transactions') && !fnBody.includes('pending_mutations'),
        'Must never purge transactions or pending outbox mutations on sign out'
      );
    });
  });

  describe('5. Session Expiration UI & Balance Card Labeling', () => {
    test('DashboardPage provides dedicated session recovery actions without misleading retry loops', () => {
      const dashboardPath = path.join(projectRoot, 'src/features/dashboard/DashboardPage.tsx');
      const content = fs.readFileSync(dashboardPath, 'utf8');

      assert.ok(
        content.includes('Authentication session expired'),
        'DashboardPage must display clear session expired heading'
      );
      assert.ok(
        content.includes('recoverSession()'),
        'DashboardPage must wire recovery action that clears stale context'
      );
      assert.ok(
        content.includes('Sign In Again'),
        'DashboardPage must provide Sign In Again button'
      );
    });

    test('BalanceCard distinguishes auth session expiration from network offline status', () => {
      const balanceCardPath = path.join(projectRoot, 'src/features/dashboard/BalanceCard.tsx');
      const content = fs.readFileSync(balanceCardPath, 'utf8');

      assert.ok(
        content.includes('Session expired'),
        'BalanceCard must identify auth expiration'
      );
      assert.ok(
        content.includes('Showing saved balances'),
        'BalanceCard must retain truthful saved balances label for network offline states'
      );
      assert.ok(
        content.includes('!/401|403|unauthorized|session expired/i.test(error)'),
        'BalanceCard must suppress misleading Retry button when token is expired'
      );
    });
  });
});
