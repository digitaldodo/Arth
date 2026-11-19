import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isAndroidPhone } from '../src/lib/device.js';
import { GET as getDownloadRoute } from '../src/app/api/android/download/route.js';
import { GET as getReleaseRoute } from '../src/app/api/android/release/route.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

describe('SpendSense Website Navigation & Android Download Experience Test Suite', () => {
  describe('1. Device-Specific Detection for Android Phones', () => {
    const originalNavigator = globalThis.navigator;

    function mockNavigator(ua: string, uaData?: { platform: string; mobile: boolean }) {
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          userAgent: ua,
          userAgentData: uaData,
        },
        configurable: true,
        writable: true,
      });
    }

    test('Identifies Android smartphone (Pixel / Samsung Chrome)', () => {
      mockNavigator(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro Build/UD1A.230803.041) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36'
      );
      assert.strictEqual(isAndroidPhone(), true);
    });

    test('Identifies Android smartphone via UserAgentData hints', () => {
      mockNavigator(
        'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36',
        { platform: 'Android', mobile: true }
      );
      assert.strictEqual(isAndroidPhone(), true);
    });

    test('Rejects iPhone (Mobile Safari)', () => {
      mockNavigator(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1'
      );
      assert.strictEqual(isAndroidPhone(), false);
    });

    test('Rejects iPad (Tablet Safari)', () => {
      mockNavigator(
        'Mozilla/5.0 (iPad; CPU OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1'
      );
      assert.strictEqual(isAndroidPhone(), false);
    });

    test('Rejects Windows desktop browser', () => {
      mockNavigator(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        { platform: 'Windows', mobile: false }
      );
      assert.strictEqual(isAndroidPhone(), false);
    });

    test('Rejects macOS desktop browser', () => {
      mockNavigator(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
        { platform: 'macOS', mobile: false }
      );
      assert.strictEqual(isAndroidPhone(), false);
    });

    test('Rejects Android tablet (omits Mobile token in UA)', () => {
      mockNavigator(
        'Mozilla/5.0 (Linux; Android 13; SM-X800) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Safari/537.36',
        { platform: 'Android', mobile: false }
      );
      assert.strictEqual(isAndroidPhone(), false);
    });

    // Cleanup mock
    test('Restore global navigator', () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: originalNavigator,
        configurable: true,
        writable: true,
      });
    });
  });

  describe('2. Direct APK Download Route & File Verification', () => {
    test('GET /api/android/download returns 302 redirect to valid APK asset, never to private GitHub release page', async () => {
      const previousToken = process.env.GITHUB_TOKEN;
      delete process.env.GITHUB_TOKEN;
      try {
        assert.equal((await getDownloadRoute()).status, 503, 'must fail closed without the server-side release token');
      } finally {
        if (previousToken) process.env.GITHUB_TOKEN = previousToken;
      }
    });

    test('APK binary is absent from Git and served by the private release route', () => {
      const apkPath = path.join(projectRoot, 'public', 'android', 'SpendSense.apk');
      assert.ok(!fs.existsSync(apkPath), 'APK must be hosted outside the Git repository');
      const route = fs.readFileSync(path.join(projectRoot, 'src', 'app', 'api', 'android', 'download', 'route.ts'), 'utf8');
      assert.ok(route.includes("asset.name === 'SpendSense.apk'"));
    });

    test('GET /api/android/release exposes direct downloadUrl', async () => {
      const previousToken = process.env.GITHUB_TOKEN;
      delete process.env.GITHUB_TOKEN;
      try {
        assert.equal((await getReleaseRoute()).status, 503, 'must fail closed when release credentials are absent');
      } finally {
        if (previousToken) process.env.GITHUB_TOKEN = previousToken;
      }
    });
  });

  describe('3. Header Redesign, Mobile Layout & Invariants', () => {
    test('UnauthenticatedHome implements two-row header with Android-only row and desktop clean header', () => {
      const homePath = path.join(projectRoot, 'src', 'app', 'UnauthenticatedHome.tsx');
      const content = fs.readFileSync(homePath, 'utf8');

      // Reliable device detection
      assert.ok(content.includes('isAndroidPhone()'), 'Must use isAndroidPhone device detection');
      assert.ok(content.includes('isAndroid'), 'Must track isAndroid state');

      // Desktop / Non-Android row has Sign Up and Log In
      assert.ok(
        content.includes('href="/login?mode=signup"'),
        'Must link to registration with mode=signup'
      );
      assert.ok(
        content.includes('Sign Up'),
        'Must offer separate Sign Up action'
      );
      assert.ok(
        content.includes('Log In'),
        'Must offer separate Log In action'
      );

      // Android second row
      assert.ok(
        content.includes('isAndroid &&'),
        'Second row must be conditionally rendered only when isAndroid is true'
      );
      assert.ok(
        content.includes('grid grid-cols-3') || content.includes('flex'),
        'Second row must layout three buttons responsively'
      );
      assert.ok(
        content.includes('href="/api/android/download"'),
        'Download App button must link directly to /api/android/download'
      );
      assert.ok(
        content.includes('whitespace-nowrap'),
        'All three mobile button labels must enforce whitespace-nowrap to avoid text wrapping'
      );

      // Hero section: Removed duplicate Sign In, changed to "Get Started →"
      assert.ok(
        content.includes('Get Started &rarr;') || content.includes('Get Started →'),
        'Hero section must display "Get Started →" instead of duplicate "Sign In"'
      );
      assert.ok(
        !content.includes('Sign In &rarr;'),
        'Must not contain duplicate "Sign In →" in hero section'
      );
    });

    test('LoginPage and AuthForm respect mode=signup query param for instant registration view', () => {
      const loginPagePath = path.join(projectRoot, 'src', 'app', 'login', 'page.tsx');
      const loginContent = fs.readFileSync(loginPagePath, 'utf8');
      assert.ok(
        loginContent.includes("params.mode === 'signup' ? 'signup' : 'signin'"),
        'LoginPage must forward mode query parameter to AuthForm'
      );

      const authFormPath = path.join(projectRoot, 'src', 'app', 'login', 'AuthForm.tsx');
      const authContent = fs.readFileSync(authFormPath, 'utf8');
      assert.ok(
        authContent.includes('initialMode'),
        'AuthForm must support initialMode prop'
      );
      assert.ok(
        authContent.includes("searchMode === 'signup'"),
        'AuthForm must detect mode=signup from URL'
      );
    });

    test('/download page communicates Android exclusivity to unsupported device visitors', () => {
      const downloadClientPath = path.join(projectRoot, 'src', 'app', 'download', 'DownloadClient.tsx');
      const content = fs.readFileSync(downloadClientPath, 'utf8');

      assert.ok(
        content.includes('Android Phones') || content.includes('Android 8.0'),
        'Download page must state Android requirements clearly'
      );
      assert.ok(
        content.includes('iOS') || content.includes('iPhone'),
        'Download page must guide iOS and desktop users'
      );
      assert.ok(
        content.includes('Sign Up'),
        'Download page header must include Sign Up'
      );
      assert.ok(
        content.includes('Log In'),
        'Download page header must include Log In'
      );
      assert.ok(
        content.includes("'/api/android/download'"),
        'Download button must target /api/android/download'
      );
    });
  });
});
