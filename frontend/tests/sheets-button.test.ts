import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SheetsConnectionCard } from '../src/features/sheets/SheetsConnectionCard';
import { InstallPromptCard } from '../src/features/pwa/InstallPromptCard';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

describe('Google Sheets Connection & Offline Support UI/UX Improvements', () => {
  const sheetsComponentPath = path.join(
    projectRoot,
    'src',
    'features',
    'sheets',
    'SheetsConnectionCard.tsx'
  );
  const pwaComponentPath = path.join(
    projectRoot,
    'src',
    'features',
    'pwa',
    'InstallPromptCard.tsx'
  );

  test('Component sources exist', () => {
    assert.ok(fs.existsSync(sheetsComponentPath), 'SheetsConnectionCard.tsx must exist');
    assert.ok(fs.existsSync(pwaComponentPath), 'InstallPromptCard.tsx must exist');
  });

  const sheetsSource = fs.readFileSync(sheetsComponentPath, 'utf8');
  const pwaSource = fs.readFileSync(pwaComponentPath, 'utf8');

  describe('1. Google Sheets Synchronization UX Polish', () => {
    test('simplified description matches requirement', () => {
      assert.ok(
        sheetsSource.includes('Automatically sync your Arth transactions to your personal Google Sheet.'),
        'Must display simplified description "Automatically sync your Arth transactions to your personal Google Sheet."'
      );
      assert.ok(
        !sheetsSource.includes('Asynchronously replicate your financial transactions'),
        'Old complex description must be removed'
      );
    });

    test('Step 1 heading and instructions match requirement', () => {
      assert.ok(
        sheetsSource.includes('Step 1: Share your Google Sheet'),
        'Step 1 heading must be "Step 1: Share your Google Sheet"'
      );
      assert.ok(
        sheetsSource.includes(
          'Create a spreadsheet in Google Sheets and share it with the email address below. Set the permission to Editor so Arth can add your transactions.'
        ),
        'Must provide clear Editor permission sharing instructions'
      );
    });

    test('Service account email presentation is responsive and copyable', () => {
      // Responsive layout on mobile (stacked on narrow screens, inline on sm+)
      assert.ok(
        sheetsSource.includes('flex flex-col sm:flex-row sm:items-center gap-2'),
        'Must use flex-col on mobile to prevent squeezing email into narrow unreadable column'
      );
      assert.ok(
        sheetsSource.includes('overflow-x-auto whitespace-nowrap'),
        'Email code block must support horizontal scrolling for long service account addresses'
      );
      assert.ok(
        sheetsSource.includes('select-all'),
        'Email code block must allow instant full selection'
      );
      assert.ok(
        sheetsSource.includes('Copied!'),
        'Copy button must provide brief "Copied!" feedback'
      );
    });

    test('Step 2 heading, supporting text, and placeholder match requirement', () => {
      assert.ok(
        sheetsSource.includes('Step 2: Connect your spreadsheet'),
        'Step 2 heading must be "Step 2: Connect your spreadsheet"'
      );
      assert.ok(
        sheetsSource.includes(
          "Copy the link from your Google Sheet's address bar and paste it below. You can also enter the spreadsheet ID."
        ) ||
          sheetsSource.includes(
            "Copy the link from your Google Sheet&apos;s address bar and paste it below. You can also enter the spreadsheet ID."
          ),
        'Step 2 must explain copying link or entering ID'
      );
      assert.ok(
        sheetsSource.includes('placeholder="Paste Google Sheets URL or spreadsheet ID"'),
        'Input must have placeholder "Paste Google Sheets URL or spreadsheet ID"'
      );
    });

    test('Client-side validation accepts both URL and raw spreadsheet ID', () => {
      assert.ok(
        sheetsSource.includes('/spreadsheets\\/d\\/([a-zA-Z0-9-_]+)/') ||
          sheetsSource.includes('/spreadsheets\\/d\\/'),
        'Must validate Google Sheets URL format'
      );
      assert.ok(
        sheetsSource.includes('/^[a-zA-Z0-9-_]{20,80}$/'),
        'Must validate raw spreadsheet ID format'
      );
      assert.ok(
        sheetsSource.includes(
          'Please enter a valid Google Sheets URL (e.g., https://docs.google.com/spreadsheets/d/...) or spreadsheet ID.'
        ),
        'Must show helpful format validation error'
      );
    });

    test('Button states and contrast tokens', () => {
      assert.ok(
        !sheetsSource.includes('var(--bg-app)'),
        'var(--bg-app) must not exist'
      );
      assert.ok(
        sheetsSource.includes('bg-[var(--action-primary-bg)]'),
        'Button must use action primary background token'
      );
      assert.ok(
        sheetsSource.includes('text-[var(--action-primary-fg)]'),
        'Button must use action primary foreground token'
      );
      assert.ok(
        sheetsSource.includes("'Connect Google Sheet'"),
        'Button label must default to "Connect Google Sheet"'
      );
      assert.ok(
        sheetsSource.includes("'Connecting…'"),
        'Button label must show "Connecting…" during submission'
      );
      assert.ok(
        sheetsSource.includes("'Retry Connection'"),
        'Button label must show "Retry Connection" on failure'
      );
      assert.ok(
        sheetsSource.includes('Change Sheet'),
        'Must provide Change Sheet action in connected state'
      );
    });

    test('Privacy explanation is rendered below connection controls', () => {
      assert.ok(
        sheetsSource.includes(
          'Your spreadsheet remains private. Arth uses the sharing permission you grant to sync your transactions.'
        ),
        'Must include concise privacy note below connection controls'
      );
    });

    test('Renders initial static markup cleanly', () => {
      const markup = renderToStaticMarkup(React.createElement(SheetsConnectionCard));
      assert.ok(typeof markup === 'string');
      assert.ok(markup.includes('Google Sheets Synchronization'));
      assert.ok(markup.includes('Automatically sync your Arth transactions'));
    });
  });

  describe('2. Offline Support Card Redesign', () => {
    test('Row 1 contains icon, title, and status badge', () => {
      assert.ok(
        pwaSource.includes('Offline Support'),
        'Must display "Offline Support" title'
      );
      assert.ok(
        pwaSource.includes('flex items-center justify-between gap-3') ||
          pwaSource.includes('flex items-center justify-between gap-2'),
        'Row 1 must align icon + title with status badge using space-between'
      );
    });

    test('Row 2 contains full-width concise description', () => {
      assert.ok(
        pwaSource.includes('Use Arth offline and sync your changes when you&apos;re back online.') ||
          pwaSource.includes("Use Arth offline and sync your changes when you're back online."),
        'Must display concise description "Use Arth offline and sync your changes when you\'re back online."'
      );
    });

    test('Accurate status tracks both standalone mode and service worker offline readiness', () => {
      assert.ok(
        pwaSource.includes('isOfflineReady'),
        'Must track offline readiness via service worker controller'
      );
      assert.ok(
        pwaSource.includes('navigator.serviceWorker'),
        'Must check navigator.serviceWorker readiness'
      );
      assert.ok(
        pwaSource.includes('Installed'),
        'Must show Installed badge when running standalone'
      );
    });

    test('Renders static markup cleanly', () => {
      const markup = renderToStaticMarkup(React.createElement(InstallPromptCard));
      assert.ok(typeof markup === 'string');
      assert.ok(markup.includes('Offline Support'));
      assert.ok(
        markup.includes("Use Arth offline and sync your changes when you're back online") ||
          markup.includes('Use Arth offline and sync your changes when you&#x27;re back online')
      );
    });
  });
});
