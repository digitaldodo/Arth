export type ApplicationRuntimeMode = 'desktop-web' | 'mobile-web' | 'installed-mobile-pwa';

export function getApplicationRuntimeMode(): ApplicationRuntimeMode {
  if (typeof window === 'undefined') return 'desktop-web';
  const nav = window.navigator as Navigator & {
    standalone?: boolean;
    userAgentData?: { mobile?: boolean; platform?: string };
  };
  let standalone = nav.standalone === true;
  try { standalone ||= window.matchMedia('(display-mode: standalone)').matches; } catch { /* uncertain means not installed */ }

  const hints = nav.userAgentData;
  const ua = nav.userAgent.toLowerCase();
  const platform = (hints?.platform || nav.platform || '').toLowerCase();
  const mobileFromUa = /android|iphone|ipad|ipod|mobile/.test(ua);
  const ipadDesktopMode = /mac/.test(platform) && nav.maxTouchPoints > 1;
  const isMobile = hints?.mobile === true || (hints?.mobile !== false && (mobileFromUa || ipadDesktopMode));

  if (standalone && isMobile) return 'installed-mobile-pwa';
  return isMobile ? 'mobile-web' : 'desktop-web';
}

export function isStandalonePwaClient(): boolean {
  return getApplicationRuntimeMode() === 'installed-mobile-pwa';
}
