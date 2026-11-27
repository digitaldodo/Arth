export type ApplicationRuntimeMode =
  | 'desktop-web'
  | 'mobile-web'
  | 'installed-mobile-pwa'
  | 'installed-desktop-pwa';

export function isStandaloneDisplayMode(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;

  try {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: window-controls-overlay)').matches
    );
  } catch {
    return false;
  }
}

export function getApplicationRuntimeMode(): ApplicationRuntimeMode {
  if (typeof window === 'undefined') return 'desktop-web';
  const nav = window.navigator as Navigator & {
    standalone?: boolean;
    userAgentData?: { mobile?: boolean; platform?: string };
  };
  const standalone = isStandaloneDisplayMode();

  const hints = nav.userAgentData;
  const ua = (nav.userAgent || '').toLowerCase();
  const platform = (hints?.platform || nav.platform || '').toLowerCase();
  const mobileFromUa = /android|iphone|ipad|ipod|mobile/.test(ua);
  const ipadDesktopMode = /mac/.test(platform) && nav.maxTouchPoints > 1;
  const isMobile =
    hints?.mobile === true ||
    (hints?.mobile !== false && (mobileFromUa || ipadDesktopMode));

  if (standalone) {
    return isMobile ? 'installed-mobile-pwa' : 'installed-desktop-pwa';
  }

  return isMobile ? 'mobile-web' : 'desktop-web';
}

export function isStandalonePwaClient(): boolean {
  const mode = getApplicationRuntimeMode();
  return mode === 'installed-mobile-pwa' || mode === 'installed-desktop-pwa';
}

export function isMobileStandalonePwaClient(): boolean {
  return getApplicationRuntimeMode() === 'installed-mobile-pwa';
}

export function isDesktopStandalonePwaClient(): boolean {
  return getApplicationRuntimeMode() === 'installed-desktop-pwa';
}
