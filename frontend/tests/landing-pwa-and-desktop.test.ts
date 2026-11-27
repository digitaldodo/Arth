import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getDeviceInstallContext, isAndroidPhone } from '../src/lib/device';
import { getApplicationRuntimeMode, isStandalonePwaClient } from '../src/lib/platform-mode';
import { GetSpendSenseSection } from '../src/features/install/GetSpendSenseSection';
import { UnauthenticatedHome } from '../src/app/UnauthenticatedHome';

const projectRoot = path.resolve(__dirname, '..');

describe('Universal PWA Landing Page, Device Detection & Desktop Windows Runtime', () => {
  test('device.ts accurately classifies Android phones/tablets, iPhone, iPad, touch Windows laptops, macOS, Linux, and unknown devices', () => {
    const originalNavigator = globalThis.navigator;
    const setNav = (ua: string, platform = '', uaData?: Record<string, unknown>, maxTouchPoints = 0) => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: ua, platform, userAgentData: uaData, maxTouchPoints },
        configurable: true,
        writable: true,
      });
    };

    try {
      // 1. Windows Edge (including touch-enabled Windows laptop with maxTouchPoints = 10)
      setNav(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
        'Win32',
        { platform: 'Windows', mobile: false, brands: [{ brand: 'Microsoft Edge', version: '126' }] },
        10
      );
      const winEdge = getDeviceInstallContext();
      assert.equal(winEdge.platform, 'windows');
      assert.equal(winEdge.browser, 'edge');
      assert.equal(winEdge.isWindows, true);
      assert.equal(winEdge.isDesktop, true);
      assert.equal(winEdge.isAndroid, false);
      assert.equal(isAndroidPhone(), false);

      // 2. Windows Chrome without UA-CH
      setNav(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Win32',
        undefined,
        10
      );
      const winChrome = getDeviceInstallContext();
      assert.equal(winChrome.platform, 'windows');
      assert.equal(winChrome.browser, 'chrome');
      assert.equal(winChrome.isAndroid, false);

      // 3. iPhone Safari
      setNav(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
        'iPhone',
        undefined,
        5
      );
      const iphone = getDeviceInstallContext();
      assert.equal(iphone.platform, 'ios');
      assert.equal(iphone.browser, 'safari');
      assert.equal(iphone.isIos, true);
      assert.equal(iphone.isIpad, false);
      assert.equal(iphone.isAndroid, false);

      // 4. iPad (desktop-mode Safari reporting Macintosh with maxTouchPoints > 1)
      setNav(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
        'MacIntel',
        undefined,
        5
      );
      const ipad = getDeviceInstallContext();
      assert.equal(ipad.platform, 'ios');
      assert.equal(ipad.isIos, true);
      assert.equal(ipad.isIpad, true);
      assert.equal(ipad.isAndroid, false);

      // 5. Android Phone Chrome
      setNav(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
        'Linux armv8l',
        { platform: 'Android', mobile: true }
      );
      const androidPhone = getDeviceInstallContext();
      assert.equal(androidPhone.platform, 'android');
      assert.equal(androidPhone.isAndroid, true);
      assert.equal(androidPhone.isAndroidPhone, true);
      assert.equal(androidPhone.isAndroidTablet, false);
      assert.equal(androidPhone.isDesktop, false);

      // 6. Android Samsung Internet
      setNav(
        'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
        'Linux aarch64'
      );
      const samsung = getDeviceInstallContext();
      assert.equal(samsung.platform, 'android');
      assert.equal(samsung.browser, 'samsung');
      assert.equal(samsung.isAndroid, true);
      assert.equal(samsung.isAndroidPhone, true);

      // 7. Android Tablet (no Mobile token, mobile: false)
      setNav(
        'Mozilla/5.0 (Linux; Android 13; SM-X800) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Linux aarch64',
        { platform: 'Android', mobile: false }
      );
      const androidTablet = getDeviceInstallContext();
      assert.equal(androidTablet.platform, 'android');
      assert.equal(androidTablet.isAndroid, true);
      assert.equal(androidTablet.isAndroidTablet, true);
      assert.equal(androidTablet.isAndroidPhone, false);

      // 8. macOS desktop Safari
      setNav(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
        'MacIntel',
        { platform: 'macOS', mobile: false },
        0
      );
      const macos = getDeviceInstallContext();
      assert.equal(macos.platform, 'macos');
      assert.equal(macos.browser, 'safari');
      assert.equal(macos.isDesktop, true);
      assert.equal(macos.isAndroid, false);

      // 9. Linux desktop browser
      setNav(
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Linux x86_64',
        { platform: 'Linux', mobile: false }
      );
      const linux = getDeviceInstallContext();
      assert.equal(linux.platform, 'linux');
      assert.equal(linux.isDesktop, true);
      assert.equal(linux.isAndroid, false);

      // 10. Unknown user-agent hides Android APK
      setNav('CustomMinimalBrowser/1.0', '');
      const unknown = getDeviceInstallContext();
      assert.equal(unknown.platform, 'unknown');
      assert.equal(unknown.isUnknown, true);
      assert.equal(unknown.isAndroid, false);
    } finally {
      Object.defineProperty(globalThis, 'navigator', {
        value: originalNavigator,
        configurable: true,
        writable: true,
      });
    }
  });

  test('platform-mode detects installed-desktop-pwa via display-mode without trusting query parameters', () => {
    const originalWindow = globalThis.window;
    const originalNavigator = globalThis.navigator;

    const mockWindow = (standaloneMatch: boolean, ua: string, mobileHint: boolean, search = '') => {
      const nav = {
        userAgent: ua,
        platform: mobileHint ? 'Linux' : 'Win32',
        maxTouchPoints: mobileHint ? 5 : 0,
        userAgentData: { mobile: mobileHint, platform: mobileHint ? 'Android' : 'Windows' },
      };
      Object.defineProperty(globalThis, 'navigator', {
        value: nav,
        configurable: true,
        writable: true,
      });
      Object.defineProperty(globalThis, 'window', {
        value: {
          navigator: nav,
          location: { search },
          matchMedia: (query: string) => ({
            matches: standaloneMatch && query.includes('display-mode: standalone'),
            media: query,
            addEventListener: () => {},
            removeEventListener: () => {},
          }),
        },
        configurable: true,
        writable: true,
      });
    };

    try {
      mockWindow(
        false,
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0 Safari/537.36',
        false,
        '?arth_runtime=installed-mobile-pwa'
      );
      assert.equal(getApplicationRuntimeMode(), 'desktop-web');
      assert.equal(isStandalonePwaClient(), false);

      mockWindow(
        true,
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0 Safari/537.36',
        false
      );
      assert.equal(getApplicationRuntimeMode(), 'installed-desktop-pwa');
      assert.equal(isStandalonePwaClient(), true);

      mockWindow(
        true,
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36',
        true
      );
      assert.equal(getApplicationRuntimeMode(), 'installed-mobile-pwa');
      assert.equal(isStandalonePwaClient(), true);
    } finally {
      Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true, writable: true });
      Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, configurable: true, writable: true });
    }
  });

  test('UnauthenticatedHome SSR places PWA guidance in the hero and hides Android APK until hydration', () => {
    const homeMarkup = renderToStaticMarkup(React.createElement(UnauthenticatedHome));
    assert.ok(homeMarkup.includes('Get SpendSense'));
    assert.ok(homeMarkup.includes('Install for this device'));
    assert.ok(homeMarkup.includes('Install SpendSense'));
    assert.ok(homeMarkup.indexOf('Get Started') < homeMarkup.indexOf('get-spendsense-heading'));
    // Unknown / pre-hydration SSR state must NEVER expose Android APK options
    assert.ok(!homeMarkup.includes('landing-android-card'));
    assert.ok(!homeMarkup.includes('Download for Android'));
    assert.ok(!homeMarkup.includes('SpendSense.apk.json'));

    const sectionMarkup = renderToStaticMarkup(React.createElement(GetSpendSenseSection));
    assert.ok(sectionMarkup.includes('Install SpendSense'));
    assert.ok(!sectionMarkup.includes('landing-android-card'));
  });

  test('GetSpendSenseSection checks Android endpoint via HEAD before enabling APK CTA and never appends .json', () => {
    const sectionSrc = fs.readFileSync(path.join(projectRoot, 'src/features/install/GetSpendSenseSection.tsx'), 'utf8');
    const apkHook = fs.readFileSync(path.join(projectRoot, 'src/features/android/useApkDownload.ts'), 'utf8');
    const landing = fs.readFileSync(path.join(projectRoot, 'src/app/UnauthenticatedHome.tsx'), 'utf8');

    assert.match(sectionSrc, /const showAndroidCard = isHydrated && isAndroid;/);
    assert.match(sectionSrc, /method:\s*'HEAD'/);
    assert.match(sectionSrc, /application\/vnd\.android\.package-archive/);
    assert.match(apkHook, /application\/vnd\.android\.package-archive/);
    assert.match(apkHook, /isValidApkHeaderBytes/);
    assert.doesNotMatch(landing, /download="SpendSense\.apk"/);
  });
});
