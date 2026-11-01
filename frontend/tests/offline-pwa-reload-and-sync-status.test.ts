import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

describe('Offline PWA Startup, Reload Resilience & Centralized Sync Status', () => {
  const swTemplatePath = path.join(projectRoot, 'src/sw/sw.template.js');
  const swScriptPath = path.join(projectRoot, 'public/sw.js');
  const offlineEntryPath = path.join(projectRoot, 'src/app/offline/OfflinePwaEntry.tsx');
  const appShellPath = path.join(projectRoot, 'src/features/transactions/TransactionAppShell.tsx');
  const ledgerPath = path.join(projectRoot, 'src/features/transactions/TransactionLedger.tsx');
  const installCardPath = path.join(projectRoot, 'src/features/pwa/InstallPromptCard.tsx');
  const offlineDbPath = path.join(projectRoot, 'src/lib/offline-db.ts');
  const syncEnginePath = path.join(projectRoot, 'src/features/sync/sync-engine.ts');

  describe('1. Service Worker Offline Startup & Navigation Fallback', () => {
    test('sw.template.js and public/sw.js include embedded fallback offline shell and resilient caching', () => {
      assert.ok(fs.existsSync(swTemplatePath), 'sw.template.js must exist');
      assert.ok(fs.existsSync(swScriptPath), 'public/sw.js must exist');

      const template = fs.readFileSync(swTemplatePath, 'utf8');
      const sw = fs.readFileSync(swScriptPath, 'utf8');

      // Precache prioritizes /offline
      assert.ok(
        template.includes("cache.add(new Request('/offline', { cache: 'reload' }))"),
        'Service worker must precache /offline explicitly'
      );

      // Matches /offline on offline navigation
      assert.ok(
        template.includes("caches.open(CACHE_NAME).then((cache) => cache.match('/offline'))"),
        'Service worker must match /offline on navigation'
      );
      assert.ok(
        template.includes('FALLBACK_OFFLINE_HTML'),
        'Service worker must contain fallback offline HTML'
      );

      // Built sw.js has embedded fallback HTML
      assert.ok(
        sw.includes('const FALLBACK_OFFLINE_HTML = "<!DOCTYPE html>'),
        'Generated sw.js must have non-empty embedded fallback HTML'
      );
    });
  });

  describe('2. Offline Entry Reopening & Session Preservation', () => {
    test('OfflinePwaEntry never redirects to / when offline and mounts TransactionAppShell from cached user', () => {
      assert.ok(fs.existsSync(offlineEntryPath), 'OfflinePwaEntry.tsx must exist');
      const content = fs.readFileSync(offlineEntryPath, 'utf8');

      // Does not redirect away when offline
      assert.ok(
        content.includes("if (typeof navigator !== 'undefined' && navigator.onLine)"),
        'OfflinePwaEntry must guard router.replace by checking navigator.onLine'
      );

      // Hydrates local user from IndexedDB
      assert.ok(content.includes('getCachedPwaUser()'), 'Must load cached user from IndexedDB');
      assert.ok(
        content.includes('<TransactionAppShell user={user} />'),
        'Must mount TransactionAppShell once local user is loaded'
      );
    });
  });

  describe('3. Clean Main Screens: Removal of Persistent Sync Indicators & Orange Banners', () => {
    test('TransactionAppShell removes persistent sync dots and orange banners from main views', () => {
      assert.ok(fs.existsSync(appShellPath), 'TransactionAppShell.tsx must exist');
      const content = fs.readFileSync(appShellPath, 'utf8');

      // No persistent sync indicator dot on main views
      assert.ok(
        !content.includes('h-1.5 w-1.5 rounded-full'),
        'TransactionAppShell must not have persistent sync status dot in main views'
      );

      // No persistent orange pending sync banner pushing down content
      assert.ok(
        !content.includes('saved locally (pending sync)'),
        'TransactionAppShell must not display persistent global pending banner'
      );

      // Contextual creation toast feedback
      assert.ok(
        content.includes("Saved on this device. Will sync when you're online."),
        'Must display offline-specific toast message'
      );
      assert.ok(
        content.includes('Transaction saved successfully.'),
        'Must display online-specific toast message'
      );
    });

    test('TransactionLedger displays subtle Pending sync badge on individual pending transactions', () => {
      assert.ok(fs.existsSync(ledgerPath), 'TransactionLedger.tsx must exist');
      const content = fs.readFileSync(ledgerPath, 'utf8');

      assert.ok(
        content.includes('Pending sync'),
        'Ledger must display "Pending sync" badge on individual pending transactions'
      );
    });
  });

  describe('4. Centralized More -> Offline Support Status Center', () => {
    test('InstallPromptCard provides full sync center with outgoing changes, server refresh, history, and actions', () => {
      assert.ok(fs.existsSync(installCardPath), 'InstallPromptCard.tsx must exist');
      const content = fs.readFileSync(installCardPath, 'utf8');

      // Connectivity badge
      assert.ok(content.includes('Connectivity:'), 'Must show connectivity section');
      assert.ok(content.includes('syncState.isOnline'), 'Must check syncState.isOnline');

      // Outgoing changes tiles
      assert.ok(content.includes('Outgoing Changes'), 'Must have Outgoing Changes breakdown');
      assert.ok(content.includes('syncState.pendingCount'), 'Must display pending count');
      assert.ok(content.includes('syncState.syncingCount'), 'Must display syncing count');
      assert.ok(content.includes('syncState.syncedCount'), 'Must display synced count');
      assert.ok(content.includes('syncState.failedCount'), 'Must display failed count');

      // Server data refresh statuses
      assert.ok(content.includes('Server Data Refresh'), 'Must have Server Data Refresh section');
      assert.ok(content.includes('Account balances:'), 'Must monitor account balances refresh');
      assert.ok(content.includes('Transaction history:'), 'Must monitor transaction history refresh');
      assert.ok(content.includes('Categories:'), 'Must monitor categories refresh');

      // History & Actions
      assert.ok(content.includes('Last synced:'), 'Must display last sync timestamp');
      assert.ok(content.includes('Sync Now'), 'Must provide Sync Now button');
      assert.ok(content.includes('Retry failed synchronization'), 'Must provide Retry failed synchronization button');
      assert.ok(content.includes('View details'), 'Must provide error details disclosure');
    });
  });

  describe('5. Atomic Multi-Store IndexedDB Persistence & Outbox Integrity', () => {
    test('offline-db exports atomic multi-store write operations spanning transactions, outbox, and balances', () => {
      assert.ok(fs.existsSync(offlineDbPath), 'offline-db.ts must exist');
      const content = fs.readFileSync(offlineDbPath, 'utf8');

      assert.ok(
        content.includes('export async function saveTransactionCreationAtomic'),
        'Must export saveTransactionCreationAtomic'
      );
      assert.ok(
        content.includes('export async function saveTransactionDeletionAtomic'),
        'Must export saveTransactionDeletionAtomic'
      );
      assert.ok(
        content.includes('export async function saveStartingBalancesAtomic'),
        'Must export saveStartingBalancesAtomic'
      );
      assert.ok(
        content.includes("db.transaction(['transactions', 'pending_mutations', 'balances', 'sync_meta'], 'readwrite')"),
        'Atomic transaction creation must span transactions, pending_mutations, balances, and sync_meta'
      );
    });

    test('sync-engine uses atomic persistence for local-first operations and supports retrying failed mutations', () => {
      assert.ok(fs.existsSync(syncEnginePath), 'sync-engine.ts must exist');
      const content = fs.readFileSync(syncEnginePath, 'utf8');

      assert.ok(
        content.includes('saveTransactionCreationAtomic'),
        'sync-engine must invoke saveTransactionCreationAtomic'
      );
      assert.ok(
        content.includes('saveTransactionDeletionAtomic'),
        'sync-engine must invoke saveTransactionDeletionAtomic'
      );
      assert.ok(
        content.includes('saveStartingBalancesAtomic'),
        'sync-engine must invoke saveStartingBalancesAtomic'
      );
      assert.ok(
        content.includes('retryFailedMutations'),
        'sync-engine must provide retryFailedMutations method'
      );
      assert.ok(
        content.includes('syncingCount: number'),
        'SyncState must expose syncingCount'
      );
      assert.ok(
        content.includes('failedCount: number'),
        'SyncState must expose failedCount'
      );
      assert.ok(
        content.includes('syncedCount: number'),
        'SyncState must expose syncedCount'
      );
    });
  });
});
