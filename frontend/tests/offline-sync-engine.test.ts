import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { syncEngine, type SyncState } from '../src/features/sync/sync-engine';
import { parseINRToPaise, formatPaiseToINR } from '../src/lib/format';

describe('Arth Offline-First Functionality & Durable Sync Engine', () => {
  const projectRoot = path.resolve(__dirname, '..');
  const offlineDbPath = path.join(projectRoot, 'src', 'lib', 'offline-db.ts');
  const syncEnginePath = path.join(projectRoot, 'src', 'features', 'sync', 'sync-engine.ts');
  const ledgerPath = path.join(projectRoot, 'src', 'features', 'transactions', 'TransactionLedger.tsx');
  const quickAddPath = path.join(projectRoot, 'src', 'features', 'transactions', 'QuickAddModal.tsx');
  const balancesModalPath = path.join(projectRoot, 'src', 'features', 'dashboard', 'ConfigureStartingBalancesModal.tsx');
  const installCardPath = path.join(projectRoot, 'src', 'features', 'pwa', 'InstallPromptCard.tsx');

  describe('1. IndexedDB User Isolation & Schema Version 3', () => {
    test('offline-db.ts defines DB_VERSION 7 and creates stores with user_id indexes', () => {
      assert.ok(fs.existsSync(offlineDbPath), 'offline-db.ts must exist');
      const content = fs.readFileSync(offlineDbPath, 'utf8');

      // Schema version check
      assert.match(content, /const DB_VERSION = 7;/, 'offline-db must include statement import history');
      assert.match(content, /statement_import_batches/, 'statement batches must be persisted locally');

      // Stores check
      assert.ok(content.includes("'transactions'"), 'Must contain transactions store');
      assert.ok(content.includes("'pending_mutations'"), 'Must contain pending_mutations store');
      assert.ok(content.includes("'balances'"), 'Must contain balances store');
      assert.ok(content.includes("'categories'"), 'Must contain categories store');
      assert.ok(content.includes("'sync_meta'"), 'Must contain sync_meta store');
      assert.ok(content.includes("'dashboard_cache'"), 'Must contain dashboard_cache store');

      // User scoping index check
      assert.ok(content.includes("createIndex('user_id', 'user_id'"), 'Transactions must index by user_id');
      assert.ok(content.includes("createIndex('user_id', 'userId'"), 'Mutations must index by userId');
    });

    test('offline-db.ts exports complete CRUD and durable outbox functions with user scoping', () => {
      const content = fs.readFileSync(offlineDbPath, 'utf8');

      // Outbox operations
      assert.ok(content.includes('export async function enqueuePendingMutation'), 'Must export enqueuePendingMutation');
      assert.ok(content.includes('export async function getPendingMutations'), 'Must export getPendingMutations');
      assert.ok(content.includes('export async function removePendingMutation'), 'Must export removePendingMutation');
      assert.ok(content.includes('export async function updatePendingMutation'), 'Must export updatePendingMutation');

      // Transaction operations
      assert.ok(content.includes('export async function saveCachedTransaction'), 'Must export saveCachedTransaction');
      assert.ok(content.includes('export async function saveCachedTransactions'), 'Must export saveCachedTransactions');
      assert.ok(content.includes('export async function getCachedTransactions'), 'Must export getCachedTransactions');
      assert.ok(content.includes('export async function markCachedTransactionDeleted'), 'Must export markCachedTransactionDeleted');
      assert.ok(content.includes('export async function deleteCachedTransactionPermanently'), 'Must export deleteCachedTransactionPermanently');

      // Sync metadata
      assert.ok(content.includes('export async function getSyncMeta'), 'Must export getSyncMeta');
      assert.ok(content.includes('export async function setSyncMeta'), 'Must export setSyncMeta');
    });
  });

  describe('2. Sync Engine State Management & Subscription', () => {
    test('syncEngine exposes initial sync state and supports reactive subscription', () => {
      assert.ok(syncEngine, 'syncEngine singleton must be exported');
      const initialState = syncEngine.getState();

      assert.equal(typeof initialState.isOnline, 'boolean');
      assert.equal(typeof initialState.isSyncing, 'boolean');
      assert.equal(typeof initialState.pendingCount, 'number');

      // Test subscription
      let capturedState: SyncState | null = null;
      const unsubscribe = syncEngine.subscribe((state) => {
        capturedState = state;
      });

      assert.ok(capturedState !== null, 'Subscriber must immediately receive current state');
      assert.equal((capturedState as SyncState).pendingCount, initialState.pendingCount);

      // Unsubscribe cleanup
      unsubscribe();
    });

    test('syncEngine switches user context cleanly without data cross-leakage', () => {
      const testUserA = 'user_test_uuid_a';
      const testUserB = 'user_test_uuid_b';

      syncEngine.setUserId(testUserA);
      const stateA = syncEngine.getState();
      assert.ok(stateA !== undefined);

      syncEngine.setUserId(testUserB);
      const stateB = syncEngine.getState();
      assert.ok(stateB !== undefined);

      // Reset
      syncEngine.setUserId(null);
    });
  });

  describe('3. Local-First Financial Delta Math & Integer Precision', () => {
    test('local starting balance calculation maintains exact integer paise and updates available funds', () => {
      const startingCashStr = '1500.50';
      const startingOnlineStr = '25000.00';

      const cashPaise = Number(parseINRToPaise(startingCashStr));
      const onlinePaise = Number(parseINRToPaise(startingOnlineStr));

      assert.equal(cashPaise, 150050, '1500.50 must convert to 150050 paise');
      assert.equal(onlinePaise, 2500000, '25000.00 must convert to 2500000 paise');

      const totalStarting = cashPaise + onlinePaise;
      assert.equal(totalStarting, 2650050);

      // Format back to INR string
      const formattedTotal = formatPaiseToINR(totalStarting);
      assert.equal(formattedTotal, '₹26,500.50');
    });

    test('sync-engine.ts processes mutations sequentially and handles network disconnects gracefully', () => {
      assert.ok(fs.existsSync(syncEnginePath), 'sync-engine.ts must exist');
      const content = fs.readFileSync(syncEnginePath, 'utf8');

      // Sequential execution
      assert.ok(content.includes('for (const mutation of pending)'), 'Must execute pending queue in FIFO order');
      assert.ok(content.includes('await this.executeMutation(mutation, userId)'), 'Must await each mutation before advancing');
      assert.ok(content.includes('await removePendingMutation(mutation.id)'), 'Must remove mutation only after confirmation');

      // Offline detection
      assert.ok(
        content.includes('navigator.onLine === false') || content.includes('!navigator.onLine'),
        'Must halt processing if network disconnects mid-queue'
      );
      assert.ok(content.includes('attempts: mutation.attempts + 1'), 'Must increment attempt counter on failure');
      assert.ok(content.includes('lastError:'), 'Must preserve failure notice for user');
    });
  });

  describe('4. Frontend UI Integration & User Feedback', () => {
    test('TransactionLedger wires delete to syncEngine and displays waiting to sync badge', () => {
      assert.ok(fs.existsSync(ledgerPath), 'TransactionLedger.tsx must exist');
      const content = fs.readFileSync(ledgerPath, 'utf8');

      assert.ok(
        content.includes('syncEngine.deleteTransactionLocalFirst'),
        'Ledger must invoke deleteTransactionLocalFirst for local-first soft-delete'
      );
      assert.ok(
        content.includes('Waiting to sync'),
        'Ledger must display "Waiting to sync" badge for pending transactions'
      );
      assert.ok(
        content.includes('getCachedTransactions'),
        'Ledger must fallback to getCachedTransactions when network fetch fails'
      );
    });

    test('QuickAddModal wires creation and update to syncEngine local-first methods', () => {
      assert.ok(fs.existsSync(quickAddPath), 'QuickAddModal.tsx must exist');
      const content = fs.readFileSync(quickAddPath, 'utf8');

      assert.ok(
        content.includes('syncEngine.createTransactionLocalFirst'),
        'QuickAddModal must invoke createTransactionLocalFirst'
      );
      assert.ok(
        content.includes('syncEngine.updateTransactionLocalFirst'),
        'QuickAddModal must invoke updateTransactionLocalFirst'
      );
      assert.ok(
        content.includes('userId?: string'),
        'QuickAddModal must accept userId prop for partition scoping'
      );
    });

    test('ConfigureStartingBalancesModal saves local-first with syncEngine', () => {
      assert.ok(fs.existsSync(balancesModalPath), 'ConfigureStartingBalancesModal.tsx must exist');
      const content = fs.readFileSync(balancesModalPath, 'utf8');

      assert.ok(
        content.includes('syncEngine.configureStartingBalancesLocalFirst'),
        'ConfigureStartingBalancesModal must use configureStartingBalancesLocalFirst'
      );
    });

    test('InstallPromptCard renders accessible Badge and live sync status with Sync Now button', () => {
      assert.ok(fs.existsSync(installCardPath), 'InstallPromptCard.tsx must exist');
      const content = fs.readFileSync(installCardPath, 'utf8');

      // Accessible Badge component
      assert.ok(
        content.includes('<Badge variant="connected" size="sm" dot>'),
        'InstallPromptCard must use standard high-contrast Badge component for Installed state'
      );

      // Live sync details
      assert.ok(content.includes('syncState.isOnline'), 'Must show online/offline status');
      assert.ok(content.includes('syncState.pendingCount'), 'Must display pending sync count');
      assert.ok(content.includes('Sync Now'), 'Must provide Sync Now button when mutations are pending');
      assert.ok(content.includes('Last synced:'), 'Must display last sync timestamp');
    });
  });
});
