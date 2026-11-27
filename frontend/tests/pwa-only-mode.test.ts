import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('PWA standalone offline and desktop Windows support', () => {
  const root = path.resolve(__dirname, '../src');
  const shell = fs.readFileSync(path.join(root, 'features/transactions/TransactionAppShell.tsx'), 'utf8');
  const dashboard = fs.readFileSync(path.join(root, 'features/dashboard/DashboardPage.tsx'), 'utf8');
  const ledger = fs.readFileSync(path.join(root, 'features/transactions/TransactionLedger.tsx'), 'utf8');
  const sync = fs.readFileSync(path.join(root, 'features/sync/sync-engine.ts'), 'utf8');
  const runtime = fs.readFileSync(path.join(root, 'lib/platform-mode.ts'), 'utf8');
  const worker = fs.readFileSync(path.join(root, 'sw/sw.template.js'), 'utf8');
  const offlineEntry = fs.readFileSync(path.join(root, 'app/offline/OfflinePwaEntry.tsx'), 'utf8');
  const updateHook = fs.readFileSync(path.join(root, 'features/pwa/usePwaUpdate.ts'), 'utf8');

  it('enables the web biometric lock only for mobile standalone PWAs', () => {
    assert.match(shell, /useMobileStandalonePwa/);
    assert.match(shell, /useAppLock\(user\?\.id \?\? 'anonymous', isMobilePwa\)/);
    assert.match(shell, /isMobilePwa && <AppLockSettings/);
  });

  it('uses remote reads in normal web tabs and local-first reads in installed standalone PWAs (mobile and desktop)', () => {
    assert.match(dashboard, /if \(!isPwa\)[\s\S]*fetchDashboardSummary\(dateRange\)/);
    assert.match(ledger, /if \(!isPwa\)[\s\S]*fetchTransactions\(/);
    assert.match(ledger, /getCachedTransactions\(userId\)/);
  });

  it('does not queue offline writes from an uninstalled normal browser tab', () => {
    assert.match(sync, /Offline changes are available in the installed SpendSense app/);
    assert.match(sync, /isStandalonePwaClient\(\)/);
  });

  it('classifies desktop web, mobile web, installed mobile PWA, and installed desktop PWA in one runtime utility', () => {
    assert.match(runtime, /'desktop-web'/);
    assert.match(runtime, /'mobile-web'/);
    assert.match(runtime, /'installed-mobile-pwa'/);
    assert.match(runtime, /'installed-desktop-pwa'/);
    assert.match(runtime, /display-mode:\s*standalone/);
    assert.match(runtime, /userAgentData/);
  });

  it('registers /sw.js and classifies clients accurately across browser and installed PWA modes', () => {
    assert.match(updateHook, /\.register\('\/sw\.js'/);
    assert.match(updateHook, /CLASSIFY_CLIENT/);
    assert.match(updateHook, /getApplicationRuntimeMode/);
  });

  it('never sends uninstalled desktop browser navigation failures to the PWA app shell and never caches SSR HTML', () => {
    assert.match(worker, /'installed-mobile-pwa'/);
    assert.match(worker, /'installed-desktop-pwa'/);
    assert.match(worker, /isInstalledPwaMode\(mode\)/);
    assert.match(worker, /'Connection required'/);
    assert.doesNotMatch(worker, /cache\.put\(event\.request/);
  });

  it('requires standalone PWA runtime and complete local snapshots before mounting financial UI offline', () => {
    assert.match(offlineEntry, /isStandalonePwaClient\(\)/);
    assert.match(offlineEntry, /transactionsSnapshotComplete && meta\.categoriesSnapshotComplete/);
    assert.match(offlineEntry, /balancesCachedAt !== null/);
    assert.match(offlineEntry, /<TransactionAppShell user=\{user\}/);
  });
});
