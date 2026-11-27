import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InstallPromptCard } from '../src/features/pwa/InstallPromptCard';
import { DashboardSkeleton } from '../src/features/dashboard/DashboardSkeleton';

const projectRoot = path.resolve(__dirname, '..');

describe('Mobile Two-Row Header, Responsive Settings, PWA Install Restoration & Startup Optimization', () => {
  test('layout.tsx and PwaRuntimeManager capture beforeinstallprompt before feature views mount', () => {
    const layout = fs.readFileSync(path.join(projectRoot, 'src/app/layout.tsx'), 'utf8');
    const manager = fs.readFileSync(path.join(projectRoot, 'src/app/PwaRuntimeManager.tsx'), 'utf8');
    const hook = fs.readFileSync(path.join(projectRoot, 'src/features/pwa/usePwaInstall.ts'), 'utf8');

    assert.match(layout, /beforeinstallprompt/);
    assert.match(layout, /__arthDeferredInstallPrompt/);
    assert.match(manager, /initPwaInstallCapture/);
    assert.match(hook, /export function initPwaInstallCapture/);
    assert.match(hook, /useSyncExternalStore/);
    assert.match(hook, /outcome === 'accepted'/);
  });

  test('InstallPromptCard exposes non-fake Install SpendSense guidance and never mentions APK', () => {
    const cardSrc = fs.readFileSync(path.join(projectRoot, 'src/features/pwa/InstallPromptCard.tsx'), 'utf8');
    assert.match(cardSrc, /Install SpendSense/);
    assert.match(cardSrc, /pwa-install-button/);
    assert.doesNotMatch(cardSrc, /APK/);

    const markup = renderToStaticMarkup(React.createElement(InstallPromptCard));
    assert.ok(markup.includes('Offline Support'));
    assert.ok(markup.includes('Install SpendSense'));
    assert.ok(!markup.includes('APK'));
  });

  test('TransactionAppShell implements two-row mobile header and lazy-loads heavy modals/settings', () => {
    const shell = fs.readFileSync(path.join(projectRoot, 'src/features/transactions/TransactionAppShell.tsx'), 'utf8');

    // Row 1 brand + sync, Row 2 mobile/tablet navigation rail
    assert.match(shell, /glass-nav/);
    assert.match(shell, /HeaderSyncIndicator/);
    assert.match(shell, /aria-label="Primary sections"/);
    assert.match(shell, /overflow-x-auto scrollbar-none/);
    // Mobile planning menu popover rendered outside overflow-x-auto
    assert.match(shell, /aria-label="Planning tools"/);

    // Lazy loading for heavy modules so they stay out of the initial dashboard bundle
    assert.match(shell, /dynamic\(\(\) => import\('\.\/QuickAddModal'\)/);
    assert.match(shell, /dynamic\(\(\) => import\('@\/features\/imports\/StatementImportModal'\)/);
    assert.match(shell, /dynamic\(\(\) => import\('@\/features\/settings\/SettingsView'\)/);
    assert.match(shell, /dynamic\(\(\) => import\('@\/features\/export\/DataExportCard'\)/);
  });

  test('SettingsView provides a compact mobile section selector and scrollable tablet/desktop rail', () => {
    const settings = fs.readFileSync(path.join(projectRoot, 'src/features/settings/SettingsView.tsx'), 'utf8');
    assert.match(settings, /id="settings-section-select"/);
    assert.match(settings, /aria-label="Settings sections"/);
    assert.match(settings, /usePwaInstall/);
    assert.match(settings, /Install SpendSense/);
  });

  test('UnauthenticatedHome lazy-loads TransactionAppShell and avoids blocking online initial paint', () => {
    const home = fs.readFileSync(path.join(projectRoot, 'src/app/UnauthenticatedHome.tsx'), 'utf8');
    assert.match(home, /dynamic\(\s*\(\) => import\('@\/features\/transactions\/TransactionAppShell'\)/);
    assert.match(home, /!navigator\.onLine/);
  });

  test('DashboardSkeleton renders calm static placeholders without continuous pulse animation', () => {
    const markup = renderToStaticMarkup(React.createElement(DashboardSkeleton));
    assert.ok(!markup.includes('animate-pulse'));
    assert.ok(markup.includes('aria-busy="true"'));
  });

  test('download page separates APK from PWA, gates APK button on release.published, and play manifest strips SMS permissions', () => {
    const downloadClient = fs.readFileSync(path.join(projectRoot, 'src/app/download/DownloadClient.tsx'), 'utf8');
    assert.ok(downloadClient.includes('Your finances. With you everywhere.'), 'Hero headline must match product copy');
    assert.ok(downloadClient.includes('useStandalonePwa()'), 'Download page must detect active PWA standalone mode');
    assert.ok(downloadClient.includes('release.published ? ('), 'APK download action must be gated on published release');
    assert.ok(downloadClient.includes("'/api/android/download'"), 'Download CTA must target /api/android/download');

    const playManifest = fs.readFileSync(path.join(projectRoot, '../android/app/src/play/AndroidManifest.xml'), 'utf8');
    assert.ok(
      playManifest.includes('android.permission.READ_SMS') && playManifest.includes('tools:node="remove"'),
      'play manifest must remove READ_SMS for Google Play policy compliance'
    );
    assert.ok(
      fs.existsSync(path.join(projectRoot, '../docs/ANDROID_TRANSACTION_CAPTURE_FEASIBILITY.md')),
      'Android capture feasibility report must exist'
    );
  });
});
