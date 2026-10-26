import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SheetsConnectionCard } from '../src/features/sheets/SheetsConnectionCard';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

describe('Google Sheets Connection Button & UI States', () => {
  const componentPath = path.join(
    projectRoot,
    'src',
    'features',
    'sheets',
    'SheetsConnectionCard.tsx'
  );

  test('SheetsConnectionCard source exists', () => {
    assert.ok(fs.existsSync(componentPath), 'SheetsConnectionCard.tsx must exist');
  });

  const sourceContent = fs.readFileSync(componentPath, 'utf8');

  test('root cause eliminated: var(--bg-app) is completely removed', () => {
    // var(--bg-app) was an undefined CSS variable in globals.css which caused browsers
    // to discard the text color and fall back to inherited var(--text-primary).
    // Because background was ALSO var(--text-primary), the button was completely blank.
    assert.ok(
      !sourceContent.includes('var(--bg-app)'),
      'var(--bg-app) must NOT exist in SheetsConnectionCard.tsx as it is an undefined CSS token'
    );
  });

  test('button uses approved high-contrast action tokens for dark and light modes', () => {
    // Verified design tokens in globals.css:
    // Light: --action-primary-bg: #1C1917, --action-primary-fg: #FFFFFF
    // Dark:  --action-primary-bg: #FFFFFF, --action-primary-fg: #1C1917
    assert.ok(
      sourceContent.includes('bg-[var(--action-primary-bg)]'),
      'Connect button must use bg-[var(--action-primary-bg)]'
    );
    assert.ok(
      sourceContent.includes('text-[var(--action-primary-fg)]'),
      'Connect button must use text-[var(--action-primary-fg)] for maximum contrast'
    );
    assert.ok(
      sourceContent.includes('hover:bg-[var(--action-primary-hover)]'),
      'Connect button must support hover:bg-[var(--action-primary-hover)]'
    );
  });

  test('button width is content-based rather than forced full-width rectangle', () => {
    assert.ok(
      sourceContent.includes('inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg'),
      'Connect button must size cleanly around its label with standard padding and rounded corners'
    );
  });

  test('button label defaults to "Connect Google Sheet"', () => {
    assert.ok(
      sourceContent.includes("'Connect Google Sheet'"),
      'Button label must explicitly display "Connect Google Sheet"'
    );
  });

  test('accurate interaction states are implemented', () => {
    // 1. In-flight loading state
    assert.ok(
      sourceContent.includes("'Connecting…'"),
      'Button must show "Connecting…" while connection request is in flight'
    );
    assert.ok(
      sourceContent.includes('animate-spin'),
      'Button must render an animated spinner during connection'
    );

    // 2. Disabled when empty or connecting
    assert.ok(
      sourceContent.includes('disabled={connecting || !sheetUrlInput.trim()}'),
      'Button must be disabled when sheet URL input is empty or request is connecting'
    );
    assert.ok(
      sourceContent.includes('disabled:cursor-not-allowed'),
      'Button must have disabled:cursor-not-allowed class for accessibility'
    );

    // 3. Error retry state
    assert.ok(
      sourceContent.includes("'Retry Connection'"),
      'Button must show "Retry Connection" after an error occurs'
    );
    assert.ok(
      sourceContent.includes('setHasConnectionError(true)'),
      'Failure must trigger hasConnectionError state'
    );

    // 4. Change Sheet workflow in connected state
    assert.ok(
      sourceContent.includes('Change Sheet'),
      'Connected view must offer a "Change Sheet" button to pair another spreadsheet'
    );
    assert.ok(
      sourceContent.includes('isChangingSheet'),
      'State isChangingSheet must allow switching back to input view without breaking connection'
    );
  });

  test('renders initial static markup without throwing errors', () => {
    const markup = renderToStaticMarkup(React.createElement(SheetsConnectionCard));
    assert.ok(typeof markup === 'string', 'Should produce static HTML string');
    assert.ok(markup.includes('Google Sheets Synchronization'), 'Should render card header');
    assert.ok(markup.includes('Checking Google Sheets connection...'), 'Should render loading state initially');
  });
});
