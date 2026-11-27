import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GET as getAuthHealth } from '../src/app/api/auth/health/route';
import { GET as getNativeGoogle, POST as postNativeGoogle } from '../src/app/api/native/auth/google/route';
import { GetSpendSenseSection } from '../src/features/install/GetSpendSenseSection';

const projectRoot = path.resolve(__dirname, '..');

describe('Product Identity, Auth Diagnostics & Unified SpendSense Install Experience', () => {
  test('GET /api/auth/health fails gracefully with sanitized unconfigured payload when env vars are absent', async () => {
    const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const prevKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    try {
      const response = await getAuthHealth();
      assert.equal(response.status, 503);
      const body = (await response.json()) as {
        ok?: boolean;
        category?: string;
        message?: string;
        checks?: { supabaseConfigured?: boolean };
      };
      assert.equal(body.ok, false);
      assert.equal(body.category, 'supabase_unconfigured');
      assert.equal(body.checks?.supabaseConfigured, false);
      assert.equal(typeof body.message, 'string');
      assert.ok(!(body.message as string).includes('service_role'));
    } finally {
      if (prevUrl !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
      else delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (prevKey !== undefined) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevKey;
      else delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    }
  });

  test('Native Google OAuth GET renders HTML app callback instead of raw 500 JSON when misconfigured', async () => {
    const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const prevKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    try {
      const getRes = await getNativeGoogle(new Request('http://localhost:3000/api/native/auth/google'));
      assert.equal(getRes.status, 503);
      assert.ok((getRes.headers.get('content-type') || '').includes('text/html'));
      const html = await getRes.text();
      assert.ok(html.includes('arth://auth/callback?error='));
      assert.ok(html.includes('Return to SpendSense'));

      const postRes = await postNativeGoogle(
        new Request('http://localhost:3000/api/native/auth/google', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id_token: 'fake-token' }),
        })
      );
      assert.equal(postRes.status, 503);
      const json = (await postRes.json()) as { code?: string; error?: string };
      assert.equal(json.code, 'CONFIGURATION_ERROR');
      assert.equal(typeof json.error, 'string');
    } finally {
      if (prevUrl !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
      else delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (prevKey !== undefined) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevKey;
      else delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    }
  });

  test('Ledger Minimal identity tokens & auth UI wiring are present on web and Android', () => {
    const css = fs.readFileSync(path.join(projectRoot, 'src/app/globals.css'), 'utf8');
    assert.ok(css.includes('--bg-canvas: #0C0A09;'));
    assert.ok(css.includes('--bg-surface: #171513;'));
    assert.ok(css.includes('--brand-evergreen: #193F37;'));
    assert.ok(css.includes('--brand-copper: #B67645;'));

    const loginPage = fs.readFileSync(path.join(projectRoot, 'src/app/login/page.tsx'), 'utf8');
    assert.ok(loginPage.includes('<ThemeToggle compact />'));
    assert.ok(loginPage.includes('Personal Financial Ledger'));
    assert.ok(loginPage.includes('border-t-[var(--brand-evergreen)]'));

    const authForm = fs.readFileSync(path.join(projectRoot, 'src/app/login/AuthForm.tsx'), 'utf8');
    assert.ok(authForm.includes("'/api/auth/health'"));
    assert.ok(authForm.includes('alertRef.current.focus()'));
    assert.ok(authForm.includes('aria-busy={isSubmitting}'));

    const loginKt = fs.readFileSync(
      path.join(projectRoot, '../android/app/src/main/java/com/digitaldodo/arth/feature/auth/LoginScreen.kt'),
      'utf8'
    );
    assert.ok(loginKt.includes('ArthCard('));
    assert.ok(loginKt.includes('ThemePillToggle('));
    assert.ok(loginKt.includes('SpendSenseBrandLockup('));
    assert.ok(loginKt.includes('isGoogleLoading'));
    assert.ok(loginKt.includes('isConfirmPasswordVisible'));
    assert.ok(loginKt.includes('showBrowserGoogleFallback'));
    assert.ok(loginKt.includes('checkAuthConnectivity()'));

    const googleAuthRoute = fs.readFileSync(
      path.join(projectRoot, 'src/app/api/native/auth/google/route.ts'),
      'utf8'
    );
    assert.ok(googleAuthRoute.includes('pendingCookies'));
    assert.ok(googleAuthRoute.includes('response.cookies.set(c.name, c.value, c.options)'));
  });

  test('Unified installation UI and in-app InstallSuggestionBanner avoid technical PWA/APK jargon', () => {
    const sectionHtml = renderToStaticMarkup(React.createElement(GetSpendSenseSection));
    const visibleText = sectionHtml.replace(/<[^>]+>/g, ' ');
    assert.ok(visibleText.includes('Get SpendSense'));
    assert.ok(visibleText.includes('Take SpendSense with you. Install it on your device for convenient access to your personal financial ledger.'));
    assert.ok(!/\bPWA\b/i.test(visibleText));
    assert.ok(!/Installed App/.test(visibleText));
    assert.ok(!/Running as Installed SpendSense App/.test(visibleText));

    const bannerSrc = fs.readFileSync(
      path.join(projectRoot, 'src/features/install/InstallSuggestionBanner.tsx'),
      'utf8'
    );
    assert.ok(bannerSrc.includes('Make SpendSense easier to access'));
    assert.ok(bannerSrc.includes('Add SpendSense to your home screen for quick access whenever you need it.'));
    assert.ok(bannerSrc.includes('Add to Home Screen'));
    assert.ok(bannerSrc.includes('Not now'));
    assert.ok(bannerSrc.includes('localStorage'));
    assert.ok(!bannerSrc.includes('Notification.requestPermission'));

    const appShellSrc = fs.readFileSync(
      path.join(projectRoot, 'src/features/transactions/TransactionAppShell.tsx'),
      'utf8'
    );
    assert.ok(appShellSrc.includes('<InstallSuggestionBanner />'));
  });
});
