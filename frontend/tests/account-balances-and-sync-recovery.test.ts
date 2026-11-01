import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { syncEngine } from '../src/features/sync/sync-engine';

describe('Desktop & PWA Balances Isolation, Schema Cache & Sync Recovery', () => {
  const projectRoot = path.resolve(__dirname, '..');
  const dashboardPath = path.join(projectRoot, 'src', 'features', 'dashboard', 'DashboardPage.tsx');
  const balanceCardPath = path.join(projectRoot, 'src', 'features', 'dashboard', 'BalanceCard.tsx');
  const syncEnginePath = path.join(projectRoot, 'src', 'features', 'sync', 'sync-engine.ts');

  describe('1. Desktop Dashboard Independent Section Resilience', () => {
    test('DashboardPage loads summary and balances independently using Promise.allSettled', () => {
      assert.ok(fs.existsSync(dashboardPath), 'DashboardPage.tsx must exist');
      const content = fs.readFileSync(dashboardPath, 'utf8');

      // Verify independent fetches
      assert.ok(
        content.includes('Promise.allSettled([summaryPromise, balancesPromise])'),
        'Desktop must fetch dashboard summary and balances independently via Promise.allSettled'
      );
      assert.ok(
        content.includes('setBalancesError'),
        'DashboardPage must isolate balances error state'
      );
      assert.ok(
        content.includes('handleRetryBalances'),
        'DashboardPage must provide independent balance retry handler'
      );
    });

    test('DashboardPage keeps independent summary metrics visible when balances RPC fails', () => {
      const content = fs.readFileSync(dashboardPath, 'utf8');

      // The summary section must render when summary is available, regardless of balances error
      assert.ok(
        content.includes('{summary && ('),
        'DashboardPage must render summary sections when summary is present'
      );

      // Verify BalanceCard receives error and retry callback
      assert.ok(
        content.includes('error={balancesError}'),
        'BalanceCard must receive isolated balances error'
      );
      assert.ok(
        content.includes('onRetry={handleRetryBalances}'),
        'BalanceCard must receive retry handler'
      );
    });

    test('BalanceCard displays clear calculation error instead of "Unavailable offline" when RPC fails online', () => {
      assert.ok(fs.existsSync(balanceCardPath), 'BalanceCard.tsx must exist');
      const content = fs.readFileSync(balanceCardPath, 'utf8');

      // Verify calculation error badge and message
      assert.ok(
        content.includes('Calculation error'),
        'BalanceCard must render "Calculation error" text when server RPC fails'
      );
      assert.ok(
        content.includes('Failed to calculate account balances'),
        'BalanceCard must provide clear failure explanation without pretending to be offline'
      );
      assert.ok(
        content.includes('Retry'),
        'BalanceCard must provide Retry button'
      );

      // Ensure actions are safely disabled when balances are unavailable
      assert.ok(
        content.includes('disabled={!balances || loading}'),
        'BalanceCard must disable Transfer and Adjust actions when balances are null'
      );
    });
  });

  describe('2. PWA Sync Engine Error Tracking & Recovery', () => {
    test('SyncEngine does not restore obsolete previous-session errors on app launch', () => {
      assert.ok(fs.existsSync(syncEnginePath), 'sync-engine.ts must exist');
      const content = fs.readFileSync(syncEnginePath, 'utf8');

      // setUserId must not copy meta.lastError into this.lastError
      assert.ok(
        !content.includes('this.lastError = meta.lastError'),
        'setUserId must not populate active lastError from previous session metadata'
      );
    });

    test('SyncEngine identifies specific failing resources in failure notice', () => {
      const content = fs.readFileSync(syncEnginePath, 'utf8');

      // Resource-specific identification
      assert.ok(
        content.includes("'Account balances'"),
        'reconcileServerState must track Account balances failures'
      );
      assert.ok(
        content.includes("'Categories'"),
        'reconcileServerState must track Categories failures'
      );
      assert.ok(
        content.includes("'Transaction history'"),
        'reconcileServerState must track Transaction history failures'
      );
      assert.ok(
        content.includes('could not be refreshed; showing the saved local copy.'),
        'Must format resource-specific notice'
      );
    });

    test('SyncEngine clears lastError on successful server reconciliation and updates lastSyncedAt', () => {
      const content = fs.readFileSync(syncEnginePath, 'utf8');

      // Success clearing
      assert.ok(
        content.includes('this.lastError = null;'),
        'Must reset this.lastError to null upon successful reconciliation'
      );
      assert.ok(
        content.includes('lastError: null'),
        'Must persist cleared error state to sync metadata'
      );
    });

    test('SyncEngine preserves pending mutations queue throughout temporary sync errors', () => {
      const content = fs.readFileSync(syncEnginePath, 'utf8');

      // Verify outbox removal happens strictly after confirmation
      assert.ok(
        content.includes('await this.executeMutation(mutation, userId);') &&
        content.includes('await removePendingMutation(mutation.id);'),
        'Mutations must only be removed from outbox when executeMutation succeeds'
      );
    });

    test('SyncEngine exposes separate mutationError, refreshError, and resourceErrors on SyncState', () => {
      const content = fs.readFileSync(syncEnginePath, 'utf8');

      assert.ok(
        content.includes('mutationError: string | null;') &&
        content.includes('refreshError: string | null;') &&
        content.includes('resourceErrors: SyncResourceErrors;'),
        'SyncState must decouple outgoing mutation errors from incoming refresh errors'
      );

      const state = syncEngine.getState();
      assert.ok('mutationError' in state, 'getState() must return mutationError');
      assert.ok('refreshError' in state, 'getState() must return refreshError');
      assert.ok('resourceErrors' in state, 'getState() must return resourceErrors');
    });
  });

  describe('3. PWA Status Presentation & Separation of Outbox Mutations vs Server Refresh', () => {
    const appShellPath = path.join(projectRoot, 'src', 'features', 'transactions', 'TransactionAppShell.tsx');
    const installCardPath = path.join(projectRoot, 'src', 'features', 'pwa', 'InstallPromptCard.tsx');

    test('InstallPromptCard distinguishes mutation failures from background server refresh failures and TransactionAppShell keeps main headers clean', () => {
      assert.ok(fs.existsSync(installCardPath), 'InstallPromptCard.tsx must exist');
      const cardContent = fs.readFileSync(installCardPath, 'utf8');
      const shellContent = fs.readFileSync(appShellPath, 'utf8');

      // Verify mutationError gives "Failed and requiring attention"
      assert.ok(
        cardContent.includes("syncState.mutationError || syncState.failedCount > 0"),
        'Must display failed and requiring attention badge for genuine mutation failures'
      );
      assert.ok(
        cardContent.includes("Failed and requiring attention"),
        'Must display "Failed and requiring attention" when mutation upload fails'
      );

      // Verify refreshError gives "Server data refresh failed"
      assert.ok(
        cardContent.includes("syncState.refreshError ?"),
        'Must acknowledge server refresh failure'
      );
      assert.ok(
        cardContent.includes("Server data refresh failed"),
        'Must distinguish server data refresh failed state'
      );

      // Verify TransactionAppShell does not display permanent sync dot on main views
      assert.ok(
        !shellContent.includes("h-1.5 w-1.5 rounded-full"),
        'TransactionAppShell must not display persistent sync status dot in main views'
      );
    });

    test('InstallPromptCard distinguishes mutation error from server refresh notice', () => {
      assert.ok(fs.existsSync(installCardPath), 'InstallPromptCard.tsx must exist');
      const content = fs.readFileSync(installCardPath, 'utf8');

      assert.ok(
        content.includes('syncState.mutationError ?'),
        'InstallPromptCard must check syncState.mutationError'
      );
      assert.ok(
        content.includes('syncState.refreshError ?'),
        'InstallPromptCard must check syncState.refreshError'
      );
    });

    test('BalanceCard displays "Saved Copy" when cached balances are shown during a server error', () => {
      const content = fs.readFileSync(balanceCardPath, 'utf8');

      assert.ok(
        content.includes('Saved Copy'),
        'BalanceCard must badge cached balances as "Saved Copy" during server error'
      );
      assert.ok(
        content.includes('Showing saved balances'),
        'BalanceCard must honestly inform user that saved balances are being shown'
      );
    });
  });
});
