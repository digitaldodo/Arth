import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

describe('Arth Fast Startup & Non-Blocking App Shell Suite', () => {
  const loadingPath = path.join(projectRoot, 'src', 'app', 'loading.tsx');
  const shellPath = path.join(
    projectRoot,
    'src',
    'features',
    'transactions',
    'TransactionAppShell.tsx'
  );
  const dashboardPath = path.join(
    projectRoot,
    'src',
    'features',
    'dashboard',
    'DashboardPage.tsx'
  );
  const splashPath = path.join(
    projectRoot,
    'src',
    'components',
    'brand',
    'SplashScreen.tsx'
  );
  const offlineDbPath = path.join(projectRoot, 'src', 'lib', 'offline-db.ts');
  const swTemplatePath = path.join(projectRoot, 'src', 'sw', 'sw.template.js');
  const swScriptPath = path.join(projectRoot, 'public', 'sw.js');

  // ─── 1. Non-Blocking Loading Skeleton Verification ────────────────────────
  describe('1. Non-blocking App Shell Streaming Skeleton', () => {
    test('src/app/loading.tsx renders AppShell skeleton with DashboardSkeleton and ArthLogo', () => {
      assert.ok(fs.existsSync(loadingPath), 'loading.tsx must exist');
      const content = fs.readFileSync(loadingPath, 'utf8');

      assert.ok(
        content.includes('DashboardSkeleton'),
        'loading.tsx must render DashboardSkeleton'
      );
      assert.ok(
        content.includes('ArthLogo'),
        'loading.tsx must render monochrome ArthLogo in header'
      );
      assert.ok(
        !content.includes('SplashScreen'),
        'loading.tsx must NOT render full-screen blocking SplashScreen'
      );
      assert.ok(
        content.includes('bg-[var(--bg-canvas)]'),
        'loading.tsx must use canvas background token'
      );
    });
  });

  // ─── 2. TransactionAppShell Immediate Mount Verification ──────────────────
  describe('2. TransactionAppShell Immediate Mounting', () => {
    test('TransactionAppShell removes blocking splash screen overlay and artificial delays', () => {
      assert.ok(fs.existsSync(shellPath), 'TransactionAppShell.tsx must exist');
      const content = fs.readFileSync(shellPath, 'utf8');

      assert.ok(
        !content.includes('{isInitialBoot &&'),
        'TransactionAppShell must not gate UI behind isInitialBoot overlay'
      );
      assert.ok(
        !content.includes("import { SplashScreen } from '@/components/brand/SplashScreen';"),
        'TransactionAppShell must not import SplashScreen'
      );
      assert.ok(
        !content.includes('hasAppBootedSession'),
        'TransactionAppShell must not have session boot blocker'
      );
    });

    test('TransactionAppShell loads cached balances on mount and shares with DashboardPage', () => {
      const content = fs.readFileSync(shellPath, 'utf8');

      assert.ok(
        content.includes('getCachedBalances'),
        'TransactionAppShell must read cached balances from IndexedDB on mount'
      );
      assert.ok(
        content.includes('initialBalances={shellBalances}'),
        'TransactionAppShell must forward cached balances to DashboardPage'
      );
      assert.ok(
        content.includes('onBalancesLoaded='),
        'TransactionAppShell must receive updated balances from DashboardPage'
      );
    });
  });

  // ─── 3. Stale-While-Revalidate Dashboard Architecture ─────────────────────
  describe('3. Dashboard Stale-While-Revalidate Architecture', () => {
    test('DashboardPage derives summary from the shared local ledger snapshot', () => {
      assert.ok(fs.existsSync(dashboardPath), 'DashboardPage.tsx must exist');
      const content = fs.readFileSync(dashboardPath, 'utf8');

      assert.ok(
        content.includes('getCachedTransactions'),
        'DashboardPage must read the local transaction snapshot'
      );
      assert.ok(
        content.includes('getCachedCategories'),
        'DashboardPage must resolve category names from cached categories'
      );
    });

    test('DashboardPage does not turn ordinary offline reads into server error banners', () => {
      const content = fs.readFileSync(dashboardPath, 'utf8');
      assert.ok(content.includes('getCachedTransactions(userId)'));
      assert.doesNotMatch(content, /Unable to refresh from server/);
    });
  });

  // ─── 4. IndexedDB Financial Data Safety & Version Upgrade ─────────────────
  describe('4. IndexedDB Upgrade & Financial Data Safety', () => {
    test('offline-db.ts upgrades DB_VERSION to 2 with dashboard_cache store while preserving transactions', () => {
      assert.ok(fs.existsSync(offlineDbPath), 'offline-db.ts must exist');
      const content = fs.readFileSync(offlineDbPath, 'utf8');

      assert.ok(
        /const DB_VERSION = [234567];/.test(content),
        'offline-db must be at version 2 or higher'
      );
      assert.ok(
        content.includes("db.createObjectStore('dashboard_cache'"),
        'offline-db must create dashboard_cache object store'
      );
      assert.ok(
        content.includes("db.createObjectStore('transactions'"),
        'offline-db must maintain transactions store'
      );
      assert.ok(
        content.includes("db.createObjectStore('pending_mutations'"),
        'offline-db must maintain pending_mutations outbox store'
      );
      assert.ok(
        content.includes("db.createObjectStore('balances'"),
        'offline-db must maintain balances store'
      );
    });

    test('offline-db.ts exports getCachedDashboardSummary and setCachedDashboardSummary', () => {
      const content = fs.readFileSync(offlineDbPath, 'utf8');

      assert.ok(
        content.includes('export async function getCachedDashboardSummary'),
        'Must export getCachedDashboardSummary'
      );
      assert.ok(
        content.includes('export async function setCachedDashboardSummary'),
        'Must export setCachedDashboardSummary'
      );
    });
  });

  // ─── 5. Service Worker Navigation Timeout & Fast Fallback ─────────────────
  describe('5. Service Worker Fast Navigation Strategy', () => {
    test('sw.template.js limits offline navigation fallback to installed mobile PWA clients', () => {
      assert.ok(fs.existsSync(swTemplatePath), 'sw.template.js must exist');
      const content = fs.readFileSync(swTemplatePath, 'utf8');

      assert.ok(
        content.includes("request.mode === 'navigate'"),
        'Service worker must handle navigation requests'
      );
      assert.ok(content.includes("mode === 'installed-mobile-pwa'"), 'Only installed mobile PWA clients receive offline entry');
      assert.ok(content.includes("url.pathname === '/offline'"), 'PWA offline entry route is explicit');
      assert.ok(content.includes("'Connection required'"), 'Desktop web gets a network-required state');
      assert.ok(!content.includes('cache.put(event.request'), 'Authenticated navigation HTML must not be cached');
    });

    test('generated public/sw.js matches fast navigation strategy', () => {
      assert.ok(fs.existsSync(swScriptPath), 'public/sw.js must exist');
      const content = fs.readFileSync(swScriptPath, 'utf8');

      assert.ok(
        content.includes("request.mode === 'navigate'"),
        'Generated sw.js must handle navigation requests'
      );
      assert.ok(content.includes("mode === 'installed-mobile-pwa'"), 'Generated worker must isolate installed PWA behavior');
      assert.ok(content.includes("'Connection required'"), 'Generated worker must not display PWA fallback on desktop');
    });
  });

  // ─── 6. Splash Screen Component Safety ────────────────────────────────────
  describe('6. SplashScreen Component Refinements', () => {
    test('SplashScreen removes 8-second slow connection warning message', () => {
      assert.ok(fs.existsSync(splashPath), 'SplashScreen.tsx must exist');
      const content = fs.readFileSync(splashPath, 'utf8');

      assert.ok(
        !content.includes('Taking longer than usual. Please check your connection.'),
        'SplashScreen must not show artificial "Taking longer than usual" message'
      );
      assert.ok(
        content.includes('#0D0D0F'),
        'SplashScreen must preserve #0D0D0F background'
      );
    });
  });
});
