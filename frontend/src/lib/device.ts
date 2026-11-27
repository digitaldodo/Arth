/**
 * Device and browser capability detection utilities for platform-specific
 * PWA installation guidance and Android APK distribution.
 *
 * Rules:
 * - Prefer navigator.userAgentData.platform when available.
 * - Fall back cleanly to navigator.userAgent / navigator.platform.
 * - Detect both Android phones and Android tablets.
 * - Never classify devices using viewport/screen width.
 * - Never misclassify touch-enabled Windows laptops or iPads as Android.
 */

export type DevicePlatform =
  | 'android'
  | 'ios'
  | 'windows'
  | 'macos'
  | 'chromeos'
  | 'linux'
  | 'unknown';

export type DeviceBrowser =
  | 'edge'
  | 'chrome'
  | 'safari'
  | 'firefox'
  | 'samsung'
  | 'other';

export interface DeviceInstallContext {
  platform: DevicePlatform;
  browser: DeviceBrowser;
  isAndroid: boolean;
  isAndroidPhone: boolean;
  isAndroidTablet: boolean;
  isIos: boolean;
  isIpad: boolean;
  isWindows: boolean;
  isDesktop: boolean;
  isUnknown: boolean;
  isTouchDevice: boolean;
}

type NavigatorWithClientHints = Navigator & {
  userAgentData?: {
    platform?: string;
    mobile?: boolean;
    brands?: Array<{ brand: string; version: string }>;
  };
};

export function isAndroidPhone(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }

  const uaData = (navigator as NavigatorWithClientHints).userAgentData;

  if (uaData && typeof uaData.platform === 'string') {
    if (uaData.platform.toLowerCase() === 'android') {
      return Boolean(uaData.mobile);
    }
    return false;
  }

  const ua = navigator.userAgent || '';

  if (/iPhone|iPad|iPod/i.test(ua)) return false;
  if (/Windows NT|Macintosh|X11/i.test(ua) && !/Android/i.test(ua)) return false;

  const isAndroid = /Android/i.test(ua);
  const isMobile = /Mobile/i.test(ua);

  return isAndroid && isMobile;
}

export function getDeviceInstallContext(): DeviceInstallContext {
  if (typeof navigator === 'undefined') {
    return {
      platform: 'unknown',
      browser: 'other',
      isAndroid: false,
      isAndroidPhone: false,
      isAndroidTablet: false,
      isIos: false,
      isIpad: false,
      isWindows: false,
      isDesktop: false,
      isUnknown: true,
      isTouchDevice: false,
    };
  }

  const nav = navigator as NavigatorWithClientHints;
  const ua = nav.userAgent || '';
  const uaLower = ua.toLowerCase();
  const hintsPlatform = (nav.userAgentData?.platform || '').trim().toLowerCase();
  const navPlatform = (nav.platform || '').trim().toLowerCase();
  const maxTouchPoints = nav.maxTouchPoints || 0;

  // Explicit platform hint wins when provided cleanly by Chromium UA-CH
  const hintsExplicitlyWindows = hintsPlatform === 'windows';
  const hintsExplicitlyMac = hintsPlatform === 'macos';
  const hintsExplicitlyChromeOs = hintsPlatform === 'chrome os' || hintsPlatform === 'chromeos';
  const hintsExplicitlyLinux = hintsPlatform === 'linux';
  const hintsExplicitlyAndroid = hintsPlatform === 'android';
  const hintsExplicitlyIos = hintsPlatform === 'ios';

  // Never confuse touch Windows laptops or non-Android desktops with Android
  const isWindows =
    hintsExplicitlyWindows ||
    (!hintsExplicitlyAndroid && !hintsExplicitlyIos && /windows nt|win32|win64/i.test(`${ua} ${navPlatform}`));

  const isIpad =
    !isWindows &&
    !hintsExplicitlyAndroid &&
    (/ipad/i.test(ua) ||
      (/mac/i.test(hintsPlatform || navPlatform) && maxTouchPoints > 1 && !/android/i.test(ua)));

  const isIos =
    !isWindows &&
    !hintsExplicitlyAndroid &&
    (hintsExplicitlyIos || /iphone|ipod/i.test(ua) || isIpad);

  // Detect both Android phones and Android tablets via UA-CH or User-Agent
  const isAndroid =
    !isWindows &&
    !isIos &&
    (hintsExplicitlyAndroid || (/android/i.test(ua) && !/windows phone/i.test(ua)));

  const phoneAndroid = isAndroid && (hintsExplicitlyAndroid ? Boolean(nav.userAgentData?.mobile) : /mobile/i.test(ua));
  const isAndroidTablet = isAndroid && !phoneAndroid;

  const isChromeOs =
    !isWindows && !isIos && !isAndroid && (hintsExplicitlyChromeOs || /\bcros\b/i.test(ua));
  const isMac =
    !isWindows &&
    !isIos &&
    !isAndroid &&
    !isChromeOs &&
    (hintsExplicitlyMac || /macintosh|mac os x/i.test(ua));
  const isLinux =
    !isWindows &&
    !isIos &&
    !isAndroid &&
    !isChromeOs &&
    !isMac &&
    (hintsExplicitlyLinux || /linux|x11/i.test(uaLower));

  let platform: DevicePlatform = 'unknown';
  if (isAndroid) platform = 'android';
  else if (isIos) platform = 'ios';
  else if (isWindows) platform = 'windows';
  else if (isChromeOs) platform = 'chromeos';
  else if (isMac) platform = 'macos';
  else if (isLinux) platform = 'linux';

  const brands = (nav.userAgentData?.brands || []).map((b) => b.brand.toLowerCase());
  let browser: DeviceBrowser = 'other';
  if (
    /edg\/|edga\/|edgios\//i.test(ua) ||
    brands.some((b) => b.includes('edge'))
  ) {
    browser = 'edge';
  } else if (/samsungbrowser/i.test(ua)) {
    browser = 'samsung';
  } else if (/firefox|fxios/i.test(ua)) {
    browser = 'firefox';
  } else if (
    /crios|chrome/i.test(ua) ||
    brands.some((b) => b.includes('chrome') || b.includes('chromium'))
  ) {
    browser = 'chrome';
  } else if (/safari/i.test(ua) && !/chrome|crios|android/i.test(ua)) {
    browser = 'safari';
  }

  const isDesktop =
    platform === 'windows' ||
    platform === 'macos' ||
    platform === 'linux' ||
    platform === 'chromeos';

  return {
    platform,
    browser,
    isAndroid,
    isAndroidPhone: phoneAndroid,
    isAndroidTablet,
    isIos,
    isIpad,
    isWindows,
    isDesktop,
    isUnknown: platform === 'unknown',
    isTouchDevice: maxTouchPoints > 0,
  };
}
