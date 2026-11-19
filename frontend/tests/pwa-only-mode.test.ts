import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('PWA-only offline and biometric behavior', () => {
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
  it('uses remote reads in desktop web and local-first reads in standalone PWA mode', () => {
    assert.match(dashboard, /if \(!isPwa\)[\s\S]*fetchDashboardSummary\(dateRange\)/);
    assert.match(ledger, /if \(!isPwa\)[\s\S]*fetchTransactions\(/);
    assert.match(ledger, /getCachedTransactions\(userId\)/);
  });
  it('does not queue offline writes from a normal desktop browser', () => {
    assert.match(sync, /Offline changes are available in the installed SpendSense app/);
    assert.match(sync, /isStandalonePwaClient\(\)/);
  });
  it('classifies desktop, mobile browser, and installed mobile PWA in one runtime utility', () => {
    assert.match(runtime, /'desktop-web' \| 'mobile-web' \| 'installed-mobile-pwa'/);
    assert.match(runtime, /display-mode:\s*standalone/);
    assert.match(runtime, /userAgentData/);
  });
  it('does not register a new root worker for normal web clients', () => {
    assert.match(updateHook, /if \(!isInstalledMobilePwa\)[\s\S]*getRegistration\('\/'\)/);
    assert.match(updateHook, /\.register\('\/sw\.js'/);
    assert.match(updateHook, /CLASSIFY_CLIENT/);
  });
  it('never sends desktop navigation failures to the PWA app shell', () => {
    assert.match(worker, /mode === 'installed-mobile-pwa'/);
    assert.match(worker, /'Connection required'/);
    assert.doesNotMatch(worker, /cache\.put\(event\.request/);
  });
  it('requires installed mobile runtime and complete local snapshots before mounting financial UI offline', () => {
    assert.match(offlineEntry, /getApplicationRuntimeMode\(\) !== 'installed-mobile-pwa'/);
    assert.match(offlineEntry, /transactionsSnapshotComplete && meta\.categoriesSnapshotComplete/);
    assert.match(offlineEntry, /balancesCachedAt !== null/);
    assert.match(offlineEntry, /<TransactionAppShell user=\{user\}/);
  });
});
