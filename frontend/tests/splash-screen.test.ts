import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SplashScreen } from '../src/components/brand/SplashScreen';
import manifest from '../src/app/manifest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

describe('PWA Splash Screen & Initialization Experience', () => {
  describe('1. PWA Manifest & System Status Bar Metadata', () => {
    test('manifest background_color and theme_color use deep charcoal #0D0D0F to fix white splash and status bar contrast', () => {
      const m = manifest();

      // Deep charcoal background matching dark visual identity
      assert.equal(
        m.background_color,
        '#0D0D0F',
        'PWA manifest background_color must be #0D0D0F to prevent white splash flash on launch'
      );
      assert.equal(
        m.theme_color,
        '#0D0D0F',
        'PWA manifest theme_color must be #0D0D0F so Android renders high-contrast white status bar icons'
      );
      assert.equal(m.display, 'standalone');
      assert.equal(m.start_url, '/');
    });

    test('layout.tsx establishes dark theme and background before hydration to eliminate white flash', () => {
      const layoutPath = path.join(projectRoot, 'src', 'app', 'layout.tsx');
      assert.ok(fs.existsSync(layoutPath), 'layout.tsx must exist');

      const content = fs.readFileSync(layoutPath, 'utf8');

      // Verify inline blocking script in head
      assert.ok(
        content.includes('dangerouslySetInnerHTML'),
        'layout.tsx must contain inline script in head to establish theme before hydration'
      );
      assert.ok(
        content.includes("document.documentElement.classList.add('dark')"),
        'inline script must apply dark class by default or preference'
      );

      // Verify body has canvas background token
      assert.ok(
        content.includes('bg-[var(--bg-canvas)]'),
        'body must use --bg-canvas token'
      );
    });

    test('globals.css sets #0D0D0F html baseline to eliminate pre-paint background flash', () => {
      const cssPath = path.join(projectRoot, 'src', 'app', 'globals.css');
      assert.ok(fs.existsSync(cssPath), 'globals.css must exist');

      const content = fs.readFileSync(cssPath, 'utf8');

      assert.ok(
        content.includes('html {') && content.includes('#0D0D0F'),
        'globals.css must set html background-color to #0D0D0F'
      );
      assert.ok(
        content.includes('html.light') && content.includes('#FBFBF9'),
        'globals.css must set html.light background-color to #FBFBF9'
      );
    });
  });

  describe('2. SplashScreen Component Presentation & Brand Identity', () => {
    test('renders with deep charcoal #0D0D0F background and accessible ARIA attributes', () => {
      const markup = renderToStaticMarkup(React.createElement(SplashScreen));

      assert.ok(
        markup.includes('bg-[#0D0D0F]'),
        'SplashScreen must have #0D0D0F background'
      );
      assert.ok(
        markup.includes('role="status"'),
        'SplashScreen must have role="status" for accessibility'
      );
      assert.ok(
        markup.includes('aria-live="polite"'),
        'SplashScreen must have aria-live="polite"'
      );
      assert.ok(
        markup.includes('aria-busy="true"'),
        'SplashScreen must have aria-busy="true" while loading'
      );
    });

    test('renders brand name Arth, tagline, and ArthSymbol on elevated contrasting surface', () => {
      const markup = renderToStaticMarkup(React.createElement(SplashScreen));

      // Brand wordmark
      assert.ok(
        markup.includes('Arth</h1>') || markup.includes('>Arth<'),
        'SplashScreen must display brand name Arth'
      );

      // Tagline
      assert.ok(
        markup.includes('Your money, clearly.'),
        'SplashScreen must display subtle tagline "Your money, clearly."'
      );

      // Contrasting surface badge: rounded squircle with subtle border preventing black circle disappearance
      assert.ok(
        markup.includes('bg-[#161518]') || markup.includes('rounded-2xl'),
        'SplashScreen must place logo symbol on an elevated, contrasting surface'
      );
      assert.ok(
        markup.includes('border-white/10') || markup.includes('border'),
        'Contrasting surface must have subtle border for sharp edge definition'
      );

      // SVG logo symbol is present
      assert.ok(
        markup.includes('<svg') && markup.includes('</svg>'),
        'SplashScreen must render the vector Arth emblem'
      );
    });

    test('renders restrained pulsing dots animation in emerald brand color', () => {
      const markup = renderToStaticMarkup(React.createElement(SplashScreen));

      // Emerald brand color: #10B981
      assert.ok(
        markup.includes('bg-[#10B981]'),
        'Loading indicator must use emerald #10B981 brand color'
      );
      assert.ok(
        markup.includes('animate-pulse'),
        'Dots must use animate-pulse for restrained loading animation'
      );

      // Verify 3 dots
      const dotMatches = markup.match(/bg-\[#10B981\]/g);
      assert.equal(dotMatches?.length, 3, 'Must render exactly 3 restrained loading dots');
    });

    test('renders custom status message when provided', () => {
      const markup = renderToStaticMarkup(
        React.createElement(SplashScreen, {
          statusMessage: 'Preparing your ledger…',
        })
      );

      assert.ok(
        markup.includes('Preparing your ledger…'),
        'SplashScreen must render the custom status message'
      );
    });

    test('renders recoverable error state with Retry button when errorMessage is provided', () => {
      const errorMsg = 'Failed to load ledger configuration';
      const markup = renderToStaticMarkup(
        React.createElement(SplashScreen, { errorMessage: errorMsg })
      );

      assert.ok(
        markup.includes(errorMsg),
        'SplashScreen must display the error message'
      );
      assert.ok(
        markup.includes('Retry'),
        'SplashScreen must provide a Retry button in error state'
      );
      assert.ok(
        markup.includes('aria-busy="false"'),
        'SplashScreen aria-busy must be false when in error state'
      );
      // When error is present, pulsing dots should be replaced by the error action
      assert.ok(
        !markup.includes('animate-pulse'),
        'Pulsing dots must be replaced by recoverable error interface'
      );
    });

    test('supports smooth fade-out state with opacity transition', () => {
      const markupFading = renderToStaticMarkup(
        React.createElement(SplashScreen, { isFadingOut: true })
      );

      assert.ok(
        markupFading.includes('opacity-0'),
        'SplashScreen must apply opacity-0 when isFadingOut is true'
      );
      assert.ok(
        markupFading.includes('pointer-events-none'),
        'SplashScreen must disable pointer events when fading out'
      );
    });
  });

  describe('3. Next.js App Router loading.tsx', () => {
    test('src/app/loading.tsx exists and renders SplashScreen', () => {
      const loadingPath = path.join(projectRoot, 'src', 'app', 'loading.tsx');
      assert.ok(fs.existsSync(loadingPath), 'src/app/loading.tsx must exist');

      const content = fs.readFileSync(loadingPath, 'utf8');
      assert.ok(
        content.includes('SplashScreen'),
        'src/app/loading.tsx must import and render SplashScreen'
      );
    });
  });

  describe('4. TransactionAppShell Initial Startup Coordination', () => {
    test('TransactionAppShell integrates SplashScreen with initial boot state and smooth transition', () => {
      const shellPath = path.join(
        projectRoot,
        'src',
        'features',
        'transactions',
        'TransactionAppShell.tsx'
      );
      const content = fs.readFileSync(shellPath, 'utf8');

      // Verify imports and session boot tracker
      assert.ok(
        content.includes("import { SplashScreen } from '@/components/brand/SplashScreen';"),
        'TransactionAppShell must import SplashScreen'
      );
      assert.ok(
        content.includes('hasAppBootedSession'),
        'TransactionAppShell must track session boot so splash only shows on initial launch'
      );

      // Verify state coordination
      assert.ok(
        content.includes('isInitialBoot'),
        'TransactionAppShell must maintain isInitialBoot state'
      );
      assert.ok(
        content.includes('isFadingOut'),
        'TransactionAppShell must maintain isFadingOut state for smooth transition'
      );
      assert.ok(
        content.includes('handleInitialReady'),
        'TransactionAppShell must define handleInitialReady callback'
      );

      // Verify DashboardPage wiring
      assert.ok(
        content.includes('onInitialReady='),
        'TransactionAppShell must pass onInitialReady to DashboardPage'
      );

      // Verify splash screen overlay is rendered conditionally on isInitialBoot
      assert.ok(
        content.includes('{isInitialBoot &&'),
        'TransactionAppShell must conditionally render SplashScreen during isInitialBoot'
      );
    });

    test('DashboardPage accepts onInitialReady and notifies on summary load or failure', () => {
      const dashboardPath = path.join(
        projectRoot,
        'src',
        'features',
        'dashboard',
        'DashboardPage.tsx'
      );
      const content = fs.readFileSync(dashboardPath, 'utf8');

      assert.ok(
        content.includes('onInitialReady?: (error?: string) => void'),
        'DashboardPageProps must include onInitialReady'
      );
      assert.ok(
        content.includes('onInitialReady?.()'),
        'DashboardPage must call onInitialReady() on successful summary fetch'
      );
      assert.ok(
        content.includes('onInitialReady?.(message)'),
        'DashboardPage must call onInitialReady(message) on failed fetch'
      );
    });
  });
});
