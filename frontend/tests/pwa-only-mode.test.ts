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
    assert.match(sync, /Offline changes are available in the installed Arth app/);
    assert.match(sync, /isStandalonePwaClient\(\)/);
  });
});
