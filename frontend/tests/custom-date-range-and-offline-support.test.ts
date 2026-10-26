import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DateRangeSelector } from '../src/features/dashboard/DateRangeSelector';
import { InstallPromptCard } from '../src/features/pwa/InstallPromptCard';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

describe('Dashboard Custom Date Range & Offline Support UI Polish', () => {
  describe('1. DateRangeSelector Preset Structure & Active State Behavior', () => {
    test('contains the 4 specified presets: This Month, Last Month, This Year, and Custom', () => {
      const markup = renderToStaticMarkup(
        React.createElement(DateRangeSelector, {
          currentPreset: 'this_month',
          startDate: '2026-10-01',
          endDate: '2026-10-31',
          onSelectPreset: () => {},
          onApplyCustomRange: () => {},
        })
      );

      assert.ok(markup.includes('>This Month<'), 'Must contain "This Month" button');
      assert.ok(markup.includes('>Last Month<'), 'Must contain "Last Month" button');
      assert.ok(markup.includes('>This Year<'), 'Must contain "This Year" button');
      assert.ok(markup.includes('>Custom<'), 'Must contain "Custom" button');

      // Verify that obsolete today and this_week are not in the selector
      assert.ok(!markup.includes('>Today<'), 'Should not contain obsolete "Today"');
      assert.ok(!markup.includes('>This Week<'), 'Should not contain obsolete "This Week"');
    });

    test('selected "This Year" button has primary active styling and Custom has inactive styling', () => {
      const markup = renderToStaticMarkup(
        React.createElement(DateRangeSelector, {
          currentPreset: 'this_year',
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          onSelectPreset: () => {},
          onApplyCustomRange: () => {},
        })
      );

      // Verify This Year is active
      const thisYearMatch = markup.match(/<button[^>]*>This Year<\/button>/);
      assert.ok(thisYearMatch, 'This Year button must exist');
      assert.ok(
        thisYearMatch[0].includes('bg-[var(--action-primary-bg)]') &&
          thisYearMatch[0].includes('text-[var(--action-primary-fg)]'),
        'This Year button must have active tokens'
      );

      // Verify Custom is inactive
      const customMatch = markup.match(/<button[^>]*>Custom<\/button>/);
      assert.ok(customMatch, 'Custom button must exist');
      assert.ok(
        customMatch[0].includes('bg-[var(--bg-surface)]') &&
          customMatch[0].includes('text-[var(--text-secondary)]'),
        'Custom button must have inactive tokens when This Year is selected'
      );
    });

    test('Custom button receives the exact same active styling as This Year when currentPreset is "custom"', () => {
      const markupCustom = renderToStaticMarkup(
        React.createElement(DateRangeSelector, {
          currentPreset: 'custom',
          startDate: '2026-04-01',
          endDate: '2026-04-20',
          onSelectPreset: () => {},
          onApplyCustomRange: () => {},
        })
      );

      const customMatch = markupCustom.match(/<button[^>]*>Custom<\/button>/);
      assert.ok(customMatch, 'Custom button must exist');
      assert.ok(
        customMatch[0].includes('bg-[var(--action-primary-bg)]') &&
          customMatch[0].includes('text-[var(--action-primary-fg)]'),
        'Custom button must have the identical active styling tokens as other active presets'
      );

      // Other buttons must not be active
      const thisYearMatch = markupCustom.match(/<button[^>]*>This Year<\/button>/);
      assert.ok(thisYearMatch, 'This Year button must exist');
      assert.ok(
        !thisYearMatch[0].includes('bg-[var(--action-primary-bg)]'),
        'This Year button must not be active when Custom is applied'
      );
    });

    test('DateRangeSelector source code derives active state from dialog open state and applied preset', () => {
      const componentPath = path.join(
        projectRoot,
        'src',
        'features',
        'dashboard',
        'DateRangeSelector.tsx'
      );
      const content = fs.readFileSync(componentPath, 'utf8');

      // Check reactive derivation of effectiveActivePreset
      assert.ok(
        content.includes('effectiveActivePreset'),
        'Must declare effectiveActivePreset'
      );
      assert.ok(
        content.includes("isCustomOpen ? 'custom' : currentPreset"),
        'Must set effectiveActivePreset to custom while dialog is open or currentPreset otherwise'
      );

      // Check cancellation handler
      assert.ok(
        content.includes('handleCancelCustom'),
        'Must define handleCancelCustom to restore previous selection and discard draft dates'
      );

      // Check date range validation
      assert.ok(
        content.includes('isValidDateRange') || content.includes('customStart > customEnd'),
        'Must validate start and end dates'
      );
    });
  });

  describe('2. Offline Support Card & APK Removal', () => {
    test('InstallPromptCard user-facing header and text is renamed to Offline Support', () => {
      const markup = renderToStaticMarkup(React.createElement(InstallPromptCard));

      // User-facing header must be Offline Support
      assert.ok(
        markup.includes('Offline Support'),
        'InstallPromptCard must display "Offline Support" title'
      );
      assert.ok(
        !markup.includes('Progressive Web App</h3>'),
        'Must not display "Progressive Web App" heading'
      );

      // Supporting text must state offline usage and sync
      assert.ok(
        markup.includes("Use Arth offline and synchronize your changes when you're back online") ||
          markup.includes('Use Arth offline and synchronize your changes when you&#x27;re back online'),
        'Must include supporting text about using Arth offline and synchronizing changes'
      );

      // Must not contain any APK options or download buttons
      assert.ok(!markup.includes('APK'), 'InstallPromptCard must not mention APK');
      assert.ok(!markup.includes('Download APK'), 'InstallPromptCard must not have Download APK');
    });

    test('TransactionAppShell removes Install APK and renders InstallPromptCard (Offline Support)', () => {
      const shellPath = path.join(
        projectRoot,
        'src',
        'features',
        'transactions',
        'TransactionAppShell.tsx'
      );
      const content = fs.readFileSync(shellPath, 'utf8');

      // AndroidDownloadCard is gone
      assert.ok(
        !content.includes('AndroidDownloadCard'),
        'TransactionAppShell must not import or render AndroidDownloadCard'
      );

      // InstallPromptCard is rendered
      assert.ok(
        content.includes('<InstallPromptCard'),
        'TransactionAppShell must render InstallPromptCard under More & Settings'
      );

      // No APK mentions in settings
      assert.ok(
        !content.includes('Install APK'),
        'TransactionAppShell must not render any "Install APK" option'
      );
    });

    test('no obsolete APK download card file remains in src/features/android', () => {
      const androidCardPath = path.join(
        projectRoot,
        'src',
        'features',
        'android',
        'AndroidDownloadCard.tsx'
      );
      assert.ok(
        !fs.existsSync(androidCardPath),
        'AndroidDownloadCard.tsx must be removed to eliminate dead UI code'
      );
    });
  });
});
