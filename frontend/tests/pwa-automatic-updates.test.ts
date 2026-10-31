import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  isCriticalOperationActive,
  registerCriticalOperation,
  onCriticalOperationChange,
} from '../src/features/pwa/critical-operation';

describe('Arth PWA Automatic Updates & Financial Data Safety Suite', () => {
  const rootDir = path.resolve(__dirname, '../..');
  const swTemplatePath = path.join(rootDir, 'frontend/src/sw/sw.template.js');
  const swScriptPath = path.join(rootDir, 'frontend/public/sw.js');
  const buildSwScriptPath = path.join(rootDir, 'frontend/scripts/build-sw.cjs');
  const nextConfigPath = path.join(rootDir, 'frontend/next.config.ts');
  const versionRoutePath = path.join(rootDir, 'frontend/src/app/api/version/route.ts');
  const usePwaUpdatePath = path.join(rootDir, 'frontend/src/features/pwa/usePwaUpdate.ts');
  const criticalOpPath = path.join(rootDir, 'frontend/src/features/pwa/critical-operation.ts');
  const offlineDbPath = path.join(rootDir, 'frontend/src/lib/offline-db.ts');

  // ─── 1. Service Worker & Template Verification ─────────────────────────────
  it('1. sw.template.js precaches app shell into versioned cache and defers skipWaiting', () => {
    assert.ok(fs.existsSync(swTemplatePath), 'sw.template.js must exist');
    const content = fs.readFileSync(swTemplatePath, 'utf8');

    assert.ok(content.includes('const SW_VERSION ='), 'Must define SW_VERSION');
    assert.ok(
      content.includes("const CACHE_NAME = 'arth-shell-v2-' + SW_VERSION;"),
      'Must use versioned cache name'
    );
    assert.ok(content.includes("type === 'SKIP_WAITING'"), 'Must handle SKIP_WAITING message');
    assert.ok(
      !content.includes('self.addEventListener(\'install\', (event) => {\n  event.waitUntil(\n    caches\n      .open(CACHE_NAME)\n      .then((cache) => cache.addAll(PRECACHE_ASSETS))\n      .then(() => self.skipWaiting())'),
      'Must NOT invoke self.skipWaiting() unconditionally in install'
    );
    assert.ok(
      content.includes("key.startsWith('arth-shell-') && key !== CACHE_NAME"),
      'Must clean up older arth-shell caches on activate'
    );
    assert.ok(
      content.includes("url.pathname.startsWith('/api/')"),
      'Must exclude API routes from cache'
    );
    assert.ok(
      content.includes("url.pathname.startsWith('/auth/')"),
      'Must exclude auth routes from cache'
    );
    assert.ok(content.includes("data.type === 'CLASSIFY_CLIENT'"), 'Must classify browser clients before offline fallback decisions');
    assert.ok(content.includes("mode === 'installed-mobile-pwa'"), 'Only mobile standalone PWA clients may use the offline entry');
    assert.ok(content.includes("'Connection required'"), 'Normal web sessions receive a small network-required response');
    assert.ok(content.includes("cache.addAll(PRECACHE_ASSETS)"), 'Must precache built shell assets');
    assert.ok(!content.includes('cache.put(event.request'), 'Must not cache personalized navigation HTML');
  });

  // ─── 2. Build-Time Version Injection ────────────────────────────────────────
  it('2. build-sw.cjs exists and generates public/sw.js and public/version.json', () => {
    assert.ok(fs.existsSync(buildSwScriptPath), 'build-sw.cjs must exist');
    assert.ok(fs.existsSync(swScriptPath), 'public/sw.js must exist');

    const swContent = fs.readFileSync(swScriptPath, 'utf8');
    const version = JSON.parse(fs.readFileSync(path.join(rootDir, 'frontend/public/version.json'), 'utf8')) as { buildId: string };
    assert.ok(
      !swContent.includes('__SW_VERSION__'),
      'public/sw.js must have __SW_VERSION__ placeholder replaced with actual build hash'
    );
    assert.ok(
      swContent.includes('const CACHE_NAME = \'arth-shell-v2-'),
      'public/sw.js must contain versioned CACHE_NAME'
    );
    assert.ok(
      swContent.includes(`const SW_VERSION = '${version.buildId}'`),
      'Generated public/sw.js and version.json must report the same deployment build ID'
    );
  });

  // ─── 3. Version API Route ───────────────────────────────────────────────────
  it('3. /api/version route exists and enforces strict no-cache headers', () => {
    assert.ok(fs.existsSync(versionRoutePath), '/api/version route must exist');
    const routeContent = fs.readFileSync(versionRoutePath, 'utf8');

    assert.ok(
      routeContent.includes("'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0'"),
      'Version route must enforce strict no-cache headers'
    );
    assert.ok(
      routeContent.includes('buildId'),
      'Version route must return buildId for client update checks'
    );
  });

  // ─── 4. Next.js Headers Configuration ───────────────────────────────────────
  it('4. next.config.ts configures no-cache and Service-Worker-Allowed headers for /sw.js', () => {
    assert.ok(fs.existsSync(nextConfigPath), 'next.config.ts must exist');
    const configContent = fs.readFileSync(nextConfigPath, 'utf8');

    assert.ok(
      configContent.includes('source: "/sw.js"'),
      'next.config.ts must define header rules for /sw.js'
    );
    assert.ok(
      configContent.includes('no-cache, no-store, must-revalidate'),
      'next.config.ts must set no-cache for /sw.js'
    );
    assert.ok(
      configContent.includes('Service-Worker-Allowed'),
      'next.config.ts must specify Service-Worker-Allowed header'
    );
  });

  // ─── 5. Critical Operation Coordination & Financial Data Safety ─────────────
  it('5. critical-operation correctly detects active transactions and emits change notifications', () => {
    assert.strictEqual(
      isCriticalOperationActive(),
      false,
      'Initial critical operation state should be inactive'
    );

    let stateChanges: boolean[] = [];
    const unsubscribe = onCriticalOperationChange((busy) => {
      stateChanges.push(busy);
    });

    // 1. User opens QuickAdd modal or begins saving
    const releaseOp1 = registerCriticalOperation();
    assert.strictEqual(isCriticalOperationActive(), true, 'Must report active during critical operation');

    // 2. Concurrent second operation (e.g. background sync also begins)
    const releaseOp2 = registerCriticalOperation();
    assert.strictEqual(isCriticalOperationActive(), true, 'Must remain active with multiple operations');

    // 3. First operation finishes
    releaseOp1();
    assert.strictEqual(isCriticalOperationActive(), true, 'Must remain active until all operations complete');

    // 4. Second operation finishes
    releaseOp2();
    assert.strictEqual(isCriticalOperationActive(), false, 'Must report inactive when all operations complete');

    unsubscribe();
    assert.ok(stateChanges.length >= 2, 'Must have received state change events');
  });

  // ─── 6. usePwaUpdate Hook Architecture ──────────────────────────────────────
  it('6. usePwaUpdate implements periodic 5-minute checks, lifecycle triggers, and loop prevention', () => {
    assert.ok(fs.existsSync(usePwaUpdatePath), 'usePwaUpdate.ts must exist');
    const hookContent = fs.readFileSync(usePwaUpdatePath, 'utf8');

    // Interval: 5 minutes (300,000 ms)
    assert.ok(
      hookContent.includes('5 * 60 * 1000') || hookContent.includes('300000'),
      'Must check for updates on 5-minute interval'
    );

    // Lifecycle triggers
    assert.ok(
      hookContent.includes('document.visibilityState === \'visible\''),
      'Must check for updates when returning from background (visibilitychange)'
    );
    assert.ok(
      hookContent.includes("window.addEventListener('focus'"),
      'Must check for updates on window focus'
    );
    assert.ok(
      hookContent.includes("window.addEventListener('online'"),
      'Must check for updates when reconnecting online'
    );

    // Bypasses HTTP cache
    assert.ok(
      hookContent.includes("updateViaCache: 'none'") && hookContent.includes("runtimeMode === 'installed-mobile-pwa'"),
      'Must only register service worker for an installed mobile PWA'
    );

    // Safe deferred activation
    assert.ok(
      hookContent.includes('isCriticalOperationActive()'),
      'Must check isCriticalOperationActive() before sending SKIP_WAITING'
    );
    assert.ok(hookContent.includes("localStorage.setItem('arth_build_id'"), 'Must retain build ID across reloads');
    assert.ok(hookContent.includes('activationRequestedRef'), 'Must request activation only once per waiting worker');
    assert.ok(hookContent.includes('void checkForUpdate()'), 'Must check deployment version on launch');
    assert.ok(
      hookContent.includes('onCriticalOperationChange'),
      'Must wait for critical operations to complete before activating update'
    );

    // Anti-loop protection
    assert.ok(
      hookContent.includes('arth_last_sw_reload') && hookContent.includes('10000'),
      'Must enforce 10-second reload cooldown to prevent loops'
    );
    assert.ok(
      hookContent.includes('hasLoadedControllerRef'),
      'Must guard against unnecessary reload on first-time installation'
    );
  });

  // ─── 7. Offline Storage & Data Protection ───────────────────────────────────
  it('7. offline-db IndexedDB stores remain isolated and protected across application updates', () => {
    assert.ok(fs.existsSync(offlineDbPath), 'offline-db.ts must exist');
    const offlineContent = fs.readFileSync(offlineDbPath, 'utf8');

    // Confirm that offline-db relies on IndexedDB and is decoupled from Service Worker Cache API
    assert.ok(
      offlineContent.includes('arth_offline_db'),
      'Must use dedicated IndexedDB database arth_offline_db'
    );
    assert.ok(
      offlineContent.includes('pending_mutations'),
      'Must maintain pending_mutations store for offline outbox events'
    );
    assert.ok(
      offlineContent.includes('transactions'),
      'Must maintain transactions cache store'
    );
  });
});
