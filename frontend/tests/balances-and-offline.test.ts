import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

describe('Critical Improvements: Balances, Offline PWA, Quick Add & Persistent Navigation', () => {
  describe('1. Balance BFF Proxy Endpoints Authentication & Contracts', () => {
    test('GET /api/backend/balances returns 401 Unauthorized when unauthenticated', async () => {
      const { GET } = await import('../src/app/api/backend/balances/route.js');
      const res = await GET();
      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.statusCode, 401);
      assert.equal(data.error, 'Unauthorized');
    });

    test('POST /api/backend/balances/starting returns 401 Unauthorized when unauthenticated', async () => {
      const { POST } = await import('../src/app/api/backend/balances/starting/route.js');
      const dummyReq = {
        json: async () => ({ starting_cash: '1000', starting_online: '5000' }),
      } as any;
      const res = await POST(dummyReq);
      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.statusCode, 401);
    });

    test('POST /api/backend/balances/transfers returns 401 Unauthorized when unauthenticated', async () => {
      const { POST } = await import('../src/app/api/backend/balances/transfers/route.js');
      const dummyReq = {
        json: async () => ({
          amount: '500',
          from_method: 'cash',
          to_method: 'online',
        }),
      } as any;
      const res = await POST(dummyReq);
      assert.equal(res.status, 401);
    });

    test('POST /api/backend/balances/adjustments returns 401 Unauthorized when unauthenticated', async () => {
      const { POST } = await import('../src/app/api/backend/balances/adjustments/route.js');
      const dummyReq = {
        json: async () => ({
          payment_method: 'cash',
          amount: '100',
          direction: 'increase',
          reason: 'Correction',
        }),
      } as any;
      const res = await POST(dummyReq);
      assert.equal(res.status, 401);
    });

    test('GET /api/backend/balances/movements returns 401 Unauthorized when unauthenticated', async () => {
      const { GET } = await import('../src/app/api/backend/balances/movements/route.js');
      const res = await GET();
      assert.equal(res.status, 401);
    });
  });

  describe('2. Cash Balance and Online Balance UI Components', () => {
    test('BalanceCard renders Total Available, Cash, and Online balances and action buttons', () => {
      const balanceCardPath = path.join(
        projectRoot,
        'src',
        'features',
        'dashboard',
        'BalanceCard.tsx'
      );
      assert.ok(fs.existsSync(balanceCardPath), 'BalanceCard.tsx must exist');
      const content = fs.readFileSync(balanceCardPath, 'utf8');

      assert.ok(content.includes('Total Available Balance'), 'Must display Total Available Balance');
      assert.ok(content.includes('Cash Balance'), 'Must display Cash Balance');
      assert.ok(content.includes('Online Balance'), 'Must display Online Balance');
      assert.ok(content.includes('Transfer'), 'Must provide Transfer button');
      assert.ok(content.includes('Adjust'), 'Must provide Adjust button');
      assert.ok(content.includes('Starting Balances'), 'Must provide Starting Balances button');
      assert.ok(
        content.includes('balances_configured'),
        'Must handle unconfigured starting balances state'
      );
    });

    test('DashboardPage includes BalanceCard above summary metrics', () => {
      const dashboardPath = path.join(
        projectRoot,
        'src',
        'features',
        'dashboard',
        'DashboardPage.tsx'
      );
      const content = fs.readFileSync(dashboardPath, 'utf8');
      assert.ok(content.includes('<BalanceCard'), 'DashboardPage must render BalanceCard');
      assert.ok(content.includes('getCachedBalances'), 'DashboardPage must load cached balances');
      assert.ok(content.includes('getCachedTransactions'), 'DashboardPage must derive summaries from the local ledger');
    });

    test('ConfigureStartingBalancesModal supports setting and updating starting cash and online funds', () => {
      const modalPath = path.join(
        projectRoot,
        'src',
        'features',
        'dashboard',
        'ConfigureStartingBalancesModal.tsx'
      );
      assert.ok(fs.existsSync(modalPath));
      const content = fs.readFileSync(modalPath, 'utf8');
      assert.ok(content.includes('Starting Cash Balance'));
      assert.ok(content.includes('Starting Online Balance'));
      assert.ok(content.includes('Total Starting Available'));
      assert.ok(content.includes('configureStartingBalances'));
    });

    test('TransferModal supports internal Cash <-> Online transfer without affecting income/expense', () => {
      const modalPath = path.join(
        projectRoot,
        'src',
        'features',
        'dashboard',
        'TransferModal.tsx'
      );
      assert.ok(fs.existsSync(modalPath));
      const content = fs.readFileSync(modalPath, 'utf8');
      assert.ok(content.includes('Transfer Between Accounts'));
      assert.ok(content.includes('createBalanceTransfer'));
    });

    test('AdjustBalanceModal requires reason for auditable reconciliation', () => {
      const modalPath = path.join(
        projectRoot,
        'src',
        'features',
        'dashboard',
        'AdjustBalanceModal.tsx'
      );
      assert.ok(fs.existsSync(modalPath));
      const content = fs.readFileSync(modalPath, 'utf8');
      assert.ok(content.includes('Adjust Balance (Reconciliation)'));
      assert.ok(content.includes('Reason for Adjustment'));
      assert.ok(content.includes('createBalanceAdjustment'));
    });
  });

  describe('3. Fast Quick Add Entry & Form Specifications', () => {
    test('QuickAddModal labels payment method as "Paid using" for expense and "Received as" for income', () => {
      const modalPath = path.join(
        projectRoot,
        'src',
        'features',
        'transactions',
        'QuickAddModal.tsx'
      );
      const content = fs.readFileSync(modalPath, 'utf8');
      assert.ok(
        content.includes("type === 'expense' ? 'Paid using' : 'Received as'"),
        'Must label payment method Paid using for expense and Received as for income'
      );
      assert.ok(content.includes('Online'), 'Must offer Online payment method');
      assert.ok(content.includes('Cash'), 'Must offer Cash payment method');
    });

    test('QuickAddModal supports rapid consecutive entry via Save & Add Another', () => {
      const modalPath = path.join(
        projectRoot,
        'src',
        'features',
        'transactions',
        'QuickAddModal.tsx'
      );
      const content = fs.readFileSync(modalPath, 'utf8');
      assert.ok(
        content.includes('Save & Add Another') || content.includes('Save &amp; Add Another'),
        'Must provide Save & Add Another button for fast consecutive entries'
      );
      assert.ok(
        content.includes('inputMode="decimal"'),
        'Amount field must specify inputMode="decimal"'
      );
    });

    test('QuickAddModal requires explicit necessity verification for expense without auto-defaulting', () => {
      const modalPath = path.join(
        projectRoot,
        'src',
        'features',
        'transactions',
        'QuickAddModal.tsx'
      );
      const content = fs.readFileSync(modalPath, 'utf8');
      // For new expense, necessity starts as null
      assert.ok(
        content.includes('editingTransaction?.necessity ?? null') ||
          content.includes('setNecessity(null)'),
        'Must not pre-select necessity for new expenses'
      );
      assert.ok(
        content.includes('Please verify necessity'),
        'Must validate necessity selection on expense submission'
      );
    });
  });

  describe('4. Persistent Navigation & Service Worker App Shell Precache', () => {
    test('TransactionAppShell lazily mounts screens on first visit, then preserves them for quick navigation', () => {
      const shellPath = path.join(
        projectRoot,
        'src',
        'features',
        'transactions',
        'TransactionAppShell.tsx'
      );
      const content = fs.readFileSync(shellPath, 'utf8');

      for (const view of ['home', 'ledger', 'people', 'categories', 'documents', 'more']) {
        assert.ok(
          content.includes(`visitedViews.has('${view}') &&`),
          `${view} screen must mount on first visit and stay mounted afterward`
        );
      }
      assert.ok(content.includes("new Set(['home'])"), 'Only the dashboard should be mounted on initial navigation');
      assert.ok(content.includes("import('./TransactionLedger')"), 'Large screens should be split into on-demand chunks');
      assert.ok(content.includes("import('@/features/imports/StatementImport')"), 'Document imports should load on demand');
      assert.ok(content.includes('lg:hidden fixed inset-x-0 bottom-0'), 'Mobile and tablet navigation should stay available below desktop width');
      assert.ok(content.includes('hidden lg:flex items-center gap-1.5'), 'The full navigation bar should appear only when desktop has room');
    });

    test('InstallPromptCard displays pending offline sync status and manual sync action while TransactionAppShell keeps main screens clean', () => {
      const shellPath = path.join(
        projectRoot,
        'src',
        'features',
        'transactions',
        'TransactionAppShell.tsx'
      );
      const installCardPath = path.join(
        projectRoot,
        'src',
        'features',
        'pwa',
        'InstallPromptCard.tsx'
      );
      const shellContent = fs.readFileSync(shellPath, 'utf8');
      const cardContent = fs.readFileSync(installCardPath, 'utf8');
      assert.ok(
        cardContent.includes('Saved locally'),
        'InstallPromptCard must display Saved locally breakdown'
      );
      assert.ok(
        cardContent.includes('Sync Now'),
        'InstallPromptCard must provide manual Sync Now button'
      );
      assert.ok(shellContent.includes('syncEngine.subscribe'), 'Must use centralized sync engine state');
      assert.ok(!shellContent.includes('saved locally (pending sync)'), 'TransactionAppShell must not display persistent global sync banner');
    });

    test('Service worker caches public assets and isolates authenticated APIs', () => {
      const swPath = path.join(projectRoot, 'public', 'sw.js');
      assert.ok(fs.existsSync(swPath));
      const content = fs.readFileSync(swPath, 'utf8');
      assert.ok(content.includes('arth-shell-v2'));
      assert.ok(content.includes('/manifest.webmanifest'));
      assert.ok(content.includes("url.pathname.startsWith('/api/')"));
      assert.ok(content.includes("'installed-mobile-pwa'") && content.includes("'installed-desktop-pwa'"));
      assert.ok(!content.includes("caches.match('/')"));
    });
  });

  describe('5. Black Startup Screen with Crisp White Logo', () => {
    test('PWA manifest specifies deep black/charcoal background and theme color', async () => {
      const { default: manifest } = await import('../src/app/manifest.js');
      const m = manifest();
      assert.equal(m.background_color, '#0D0D0F');
      assert.equal(m.theme_color, '#0D0D0F');
    });

    test('SplashScreen component utilizes #0D0D0F background and centered white logo mark', () => {
      const splashPath = path.join(
        projectRoot,
        'src',
        'components',
        'brand',
        'SplashScreen.tsx'
      );
      const content = fs.readFileSync(splashPath, 'utf8');
      assert.ok(content.includes('#0D0D0F'), 'SplashScreen must use #0D0D0F background');
      assert.ok(content.includes('ArthSymbol'), 'SplashScreen must display ArthSymbol');
    });
  });
});
