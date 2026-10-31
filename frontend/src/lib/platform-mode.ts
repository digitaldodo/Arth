export function isStandalonePwaClient(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return window.matchMedia('(display-mode: standalone)').matches || iosStandalone;
}

export function isMobileClient(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  const mobileUa = /android|iphone|ipad|ipod|mobile/.test(ua);
  const ipadDesktopMode = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return mobileUa || ipadDesktopMode;
}
