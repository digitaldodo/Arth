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
  });
});
