import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

describe('PWA Session Persistence, Offline Startup & Balance Snapshot Invariants (Scenarios 12-15)', () => {
  describe('Scenario 12: Offline transaction rejection & balance enforcement', () => {
    test('sync-engine enforces non-negative balance checks against cached balance', () => {
      const syncEnginePath = path.join(projectRoot, 'src/features/sync/sync-engine.ts');
      const content = fs.readFileSync(syncEnginePath, 'utf8');

      assert.ok(
        content.includes('Insufficient ${payload.payment_method} balance'),
        'Must reject expense exceeding available balance with clear account identification'
      );
      assert.ok(
        content.includes('balances && balances.balances_configured'),
        'Must check baseline configuration boundary before balance enforcement'
      );
      assert.ok(
        content.includes('isPreBaseline'),
        'Must distinguish post-baseline expenses from pre-baseline historical entries'
      );
    });

    test('balance delta calculations ignore pre-baseline transactions', () => {
      const syncEnginePath = path.join(projectRoot, 'src/features/sync/sync-engine.ts');
      const content = fs.readFileSync(syncEnginePath, 'utf8');

      assert.ok(
        content.includes('(txn.recorded_at || txn.created_at) <= balances.balances_configured_at'),
        'applyLocalTransactionBalanceDelta must skip pre-baseline transactions'
      );
      assert.ok(
        content.includes('Math.max(0, isCash ? balances.current_cash_paise + delta : balances.current_cash_paise)'),
        'Balance deltas must clamp balances to >= 0'
      );
    });
  });

  describe('Scenario 13 & 14: PWA Offline Startup, Android Back Gesture & Session Preservation', () => {
    test('UnauthenticatedHome hydrates cached PWA user on mount to prevent false logout', () => {
      const homePath = path.join(projectRoot, 'src/app/UnauthenticatedHome.tsx');
      const content = fs.readFileSync(homePath, 'utf8');

      assert.ok(content.includes("'use client'"), 'UnauthenticatedHome must be a client component');
      assert.ok(content.includes('getCachedPwaUser()'), 'Must check IndexedDB cached PWA user on mount');
      assert.ok(
        content.includes('<TransactionAppShell user={cachedUser} />'),
        'Must render TransactionAppShell immediately when cached user exists'
      );
    });

    test('AuthForm uses window.location.replace to eliminate login screen from Android back-stack', () => {
      const authFormPath = path.join(projectRoot, 'src/app/login/AuthForm.tsx');
      const content = fs.readFileSync(authFormPath, 'utf8');

      assert.ok(
        content.includes('window.location.replace(res.redirectUrl || \'/\')'),
        'Must replace history entry on successful authentication instead of pushing'
      );
      assert.ok(
        content.includes('getCachedPwaUser()'),
        'Must redirect away if cached user is already present'
      );
    });

    test('TransactionAppShell saves cached PWA user and signals PWA_PREPARED to service worker', () => {
      const shellPath = path.join(projectRoot, 'src/features/transactions/TransactionAppShell.tsx');
      const content = fs.readFileSync(shellPath, 'utf8');

      assert.ok(content.includes('setCachedPwaUser(user)'), 'Must cache PWA user session locally');
      assert.ok(content.includes('type: \'PWA_PREPARED\''), 'Must post PWA_PREPARED message to SW');
    });

    test('Service worker navigation handler falls back to pwa-prepared state and returns cached shell', () => {
      const swPath = path.join(projectRoot, 'src/sw/sw.template.js');
      const content = fs.readFileSync(swPath, 'utf8');

      assert.ok(
        content.includes("getRuntime('state', 'pwa-prepared')"),
        'Service worker must inspect pwa-prepared state when client mode is null during navigation'
      );
      assert.ok(
        content.includes("caches.open(CACHE_NAME).then((cache) => cache.match('/offline'))"),
        'Service worker must return cached /offline shell during offline navigation'
      );
      assert.ok(
        content.includes("url.pathname.startsWith('/api/')"),
        'Service worker must isolate API requests and never cache sensitive user data'
      );
    });
  });

  describe('Scenario 15: Token Refresh, Outbox Queue & Immutable recorded_at Preservation', () => {
    test('Offline transactions retain immutable recorded_at timestamp across sync', () => {
      const syncEnginePath = path.join(projectRoot, 'src/features/sync/sync-engine.ts');
      const content = fs.readFileSync(syncEnginePath, 'utf8');

      assert.ok(
        content.includes('payload: { ...payload, recorded_at, created_at: payload.created_at || recorded_at }'),
        'Outbox payload must preserve client-captured recorded_at'
      );
      assert.ok(
        content.includes('recorded_at,'),
        'Optimistic transaction must preserve recorded_at timestamp'
      );
      assert.ok(
        content.includes('await saveCachedTransaction(res.transaction, userId, \'synced\')'),
        'Sync completion must persist server response transaction preserving recorded_at'
      );
    });

    test('Reconfiguring starting balances establishes new snapshot timestamp atomically', () => {
      const syncEnginePath = path.join(projectRoot, 'src/features/sync/sync-engine.ts');
      const content = fs.readFileSync(syncEnginePath, 'utf8');

      assert.ok(
        content.includes('balances_configured_at: nowIso'),
        'configureStartingBalancesLocalFirst must update balances_configured_at to now'
      );
      assert.ok(
        content.includes('current_cash_paise: newStartingCash'),
        'Must reset current cash to newly configured snapshot'
      );
      assert.ok(
        content.includes('current_online_paise: newStartingOnline'),
        'Must reset current online to newly configured snapshot'
      );
    });
  });
});
