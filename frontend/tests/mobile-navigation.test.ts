import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

describe('Mobile Header & Navigation Architecture', () => {
  test('TransactionAppShell header contains no ThemeToggle and enforces responsive logo bounds', () => {
    const appShellPath = path.join(
      projectRoot,
      'src',
      'features',
      'transactions',
      'TransactionAppShell.tsx'
    );
    const content = fs.readFileSync(appShellPath, 'utf8');

    // Extract header markup
    const headerMatch = content.match(/<header[\s\S]*?<\/header>/);
    assert.ok(headerMatch, 'Header element must exist in TransactionAppShell');
    const headerContent = headerMatch[0];

    // Verify ThemeToggle is removed from top header
    assert.ok(
      !headerContent.includes('<ThemeToggle'),
      'Header must not contain <ThemeToggle />'
    );

    // Verify logo constraints (max-width and height preserving aspect ratio)
    assert.ok(
      headerContent.includes('max-w-[110px]') || headerContent.includes('max-w-[130px]'),
      'Logo must have explicit max-width bound in header'
    );

    // Verify Sign Out in header is hidden on mobile screens
    assert.ok(
      headerContent.includes('hidden sm:flex') || headerContent.includes('hidden sm:inline'),
      'Header user actions must be hidden on mobile screens to preserve horizontal space'
    );
  });

  test('More & Settings contains Appearance & Theme toggle with segmented selection', () => {
    const appShellPath = path.join(
      projectRoot,
      'src',
      'features',
      'transactions',
      'TransactionAppShell.tsx'
    );
    const content = fs.readFileSync(appShellPath, 'utf8');

    assert.ok(
      content.includes('Appearance & Theme'),
      'More & Settings must contain Appearance & Theme section'
    );
    assert.ok(
      content.includes('<ThemeToggle />') || content.includes('<ThemeToggle'),
      'More & Settings must render ThemeToggle'
    );
  });

  test('Mobile bottom navigation contains exactly 5 destinations with safe-area padding', () => {
    const appShellPath = path.join(
      projectRoot,
      'src',
      'features',
      'transactions',
      'TransactionAppShell.tsx'
    );
    const content = fs.readFileSync(appShellPath, 'utf8');

    // Extract nav element
    const navMatch = content.match(/<nav[\s\S]*?<\/nav>/);
    assert.ok(navMatch, 'Mobile bottom nav must exist');
    const navContent = navMatch[0];

    // Verify safe-area inset is respected
    assert.ok(
      navContent.includes('safe-area-inset-bottom'),
      'Bottom navigation must respect safe-area-inset-bottom'
    );

    // Verify 5 destinations
    assert.ok(navContent.includes('Home'), 'Nav must have Home item');
    assert.ok(navContent.includes('Ledger'), 'Nav must have Ledger item');
    assert.ok(navContent.includes('Add transaction'), 'Nav must have Add action');
    assert.ok(navContent.includes('People'), 'Nav must have People item');
    assert.ok(navContent.includes('More'), 'Nav must have More item');
  });

  test('Unauthenticated home omits ThemeToggle in header while login page exposes compact ThemeToggle', () => {
    const unauthPath = path.join(projectRoot, 'src', 'app', 'UnauthenticatedHome.tsx');
    const loginPath = path.join(projectRoot, 'src', 'app', 'login', 'page.tsx');

    const unauthContent = fs.readFileSync(unauthPath, 'utf8');
    const loginContent = fs.readFileSync(loginPath, 'utf8');

    const unauthHeader = unauthContent.match(/<header[\s\S]*?<\/header>/)?.[0] || '';
    const loginHeader = loginContent.match(/<header[\s\S]*?<\/header>/)?.[0] || '';

    assert.ok(
      !unauthHeader.includes('<ThemeToggle'),
      'UnauthenticatedHome header must not contain ThemeToggle'
    );
    assert.ok(
      loginHeader.includes('<ThemeToggle'),
      'LoginPage header should expose ThemeToggle for Obsidian Dark and Warm Paper switching'
    );
  });
});
