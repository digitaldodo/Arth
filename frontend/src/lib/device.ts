/**
 * Device detection utilities for platform-specific capabilities.
 * Reliably detects Android smartphones using both User-Agent Client Hints
 * and standard User-Agent token matching, strictly excluding desktops,
 * iOS devices (iPhones/iPads), and tablet form factors.
 */

export function isAndroidPhone(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }

  // 1. User-Agent Client Hints API (Chrome 90+ on Android)
  const uaData = (
    navigator as unknown as {
      userAgentData?: {
        platform?: string;
        mobile?: boolean;
      };
    }
  ).userAgentData;

  if (uaData && typeof uaData.platform === 'string') {
    if (uaData.platform.toLowerCase() === 'android') {
      return Boolean(uaData.mobile);
    }
    return false;
  }

  // 2. Standard User-Agent Inspection
  const ua = navigator.userAgent || '';

  // Exclude non-Android platforms
  if (/iPhone|iPad|iPod/i.test(ua)) return false;
  if (/Windows NT|Macintosh|X11/i.test(ua) && !/Android/i.test(ua)) return false;

  // Android smartphones contain "Android" AND "Mobile" in user agent tokens.
  // Android tablets omit "Mobile" per Google Chrome user agent guidelines.
  const isAndroid = /Android/i.test(ua);
  const isMobile = /Mobile/i.test(ua);

  return isAndroid && isMobile;
}
