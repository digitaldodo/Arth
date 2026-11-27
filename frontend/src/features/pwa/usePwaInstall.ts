'use client';

import { useEffect, useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import {
  getDeviceInstallContext,
  type DeviceBrowser,
  type DevicePlatform,
} from '@/lib/device';
import { isStandaloneDisplayMode } from '@/lib/platform-mode';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export interface PwaInstallState {
  isHydrated: boolean;
  isStandalone: boolean;
  isInstallable: boolean;
  isInstalled: boolean;
  isInstalling: boolean;
  isIos: boolean;
  isIpad: boolean;
  isWindows: boolean;
  isAndroid: boolean;
  isDesktop: boolean;
  isUnknown: boolean;
  platform: DevicePlatform;
  browser: DeviceBrowser;
  supportsPromptCapture: boolean;
  installOutcome: 'accepted' | 'dismissed' | null;
  installError: string | null;
  installApp: () => Promise<boolean>;
}

declare global {
  interface Window {
    __arthDeferredInstallPrompt?: BeforeInstallPromptEvent | null;
    __arthPwaInstalled?: boolean;
  }
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installedManually = false;
let installOutcome: 'accepted' | 'dismissed' | null = null;
let initialized = false;
const listeners = new Set<() => void>();

function getActiveDeferredPrompt(): BeforeInstallPromptEvent | null {
  if (deferredPrompt) return deferredPrompt;
  if (typeof window !== 'undefined' && window.__arthDeferredInstallPrompt) {
    deferredPrompt = window.__arthDeferredInstallPrompt;
    return deferredPrompt;
  }
  return null;
}

function notifyListeners() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Ignore subscriber errors
    }
  });
}

function addMediaListener(mql: MediaQueryList, callback: () => void): () => void {
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', callback);
    return () => mql.removeEventListener('change', callback);
  }
  const legacy = mql as MediaQueryList & {
    addListener?: (cb: () => void) => void;
    removeListener?: (cb: () => void) => void;
  };
  legacy.addListener?.(callback);
  return () => legacy.removeListener?.(callback);
}

export function initPwaInstallCapture(): void {
  if (typeof window === 'undefined' || initialized) return;
  initialized = true;

  if (window.__arthDeferredInstallPrompt) {
    deferredPrompt = window.__arthDeferredInstallPrompt;
  }
  if (window.__arthPwaInstalled) {
    installedManually = true;
  }

  const handleBeforeInstallPrompt = (e: Event) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    window.__arthDeferredInstallPrompt = deferredPrompt;
    notifyListeners();
  };

  const handleEarlyCaptured = () => {
    if (window.__arthDeferredInstallPrompt) {
      deferredPrompt = window.__arthDeferredInstallPrompt;
      notifyListeners();
    }
  };

  const handleAppInstalled = () => {
    deferredPrompt = null;
    window.__arthDeferredInstallPrompt = null;
    window.__arthPwaInstalled = true;
    installedManually = true;
    installOutcome = 'accepted';
    notifyListeners();
  };

  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  window.addEventListener('arth:pwa-installable', handleEarlyCaptured);
  window.addEventListener('appinstalled', handleAppInstalled);
  window.addEventListener('arth:pwa-installed', handleAppInstalled);
}

function subscribeInstallStore(callback: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }
  initPwaInstallCapture();
  listeners.add(callback);

  const cleanups: Array<() => void> = [];
  try {
    cleanups.push(addMediaListener(window.matchMedia('(display-mode: standalone)'), callback));
    cleanups.push(addMediaListener(window.matchMedia('(display-mode: window-controls-overlay)'), callback));
  } catch {
    // Ignore unsupported matchMedia
  }
  window.addEventListener('appinstalled', callback);

  return () => {
    listeners.delete(callback);
    cleanups.forEach((cleanup) => cleanup());
    window.removeEventListener('appinstalled', callback);
  };
}

function getStandaloneServerSnapshot(): boolean {
  return false;
}

function getStoreVersion(): string {
  const hasPrompt = Boolean(getActiveDeferredPrompt());
  const isInstalledFlag =
    installedManually || (typeof window !== 'undefined' && Boolean(window.__arthPwaInstalled));
  return `${hasPrompt}:${isInstalledFlag}:${installOutcome ?? 'none'}`;
}

function getClientPlatformKey(): string {
  const ctx = getDeviceInstallContext();
  return [
    ctx.platform,
    ctx.browser,
    ctx.isIos,
    ctx.isIpad,
    ctx.isWindows,
    ctx.isAndroid,
    ctx.isDesktop,
    ctx.isUnknown,
  ].join(':');
}

export function usePwaInstall(): PwaInstallState {
  const [isHydrated, setIsHydrated] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  const isStandalone = useSyncExternalStore(
    subscribeInstallStore,
    isStandaloneDisplayMode,
    getStandaloneServerSnapshot
  );

  const storeSnapshot = useSyncExternalStore(
    subscribeInstallStore,
    getStoreVersion,
    () => 'false:false:none'
  );

  const platformSnapshot = useSyncExternalStore(
    () => () => {},
    getClientPlatformKey,
    () => 'unknown:other:false:false:false:false:false:true'
  );

  useEffect(() => {
    initPwaInstallCapture();
    queueMicrotask(() => setIsHydrated(true));
  }, []);

  const installApp = useCallback(async (): Promise<boolean> => {
    const promptEvent = getActiveDeferredPrompt();
    if (!promptEvent || isInstalling) {
      return false;
    }

    setIsInstalling(true);
    setInstallError(null);
    try {
      await promptEvent.prompt();
      const choiceResult = await promptEvent.userChoice;
      deferredPrompt = null;
      if (typeof window !== 'undefined') {
        window.__arthDeferredInstallPrompt = null;
      }
      if (choiceResult.outcome === 'accepted') {
        installedManually = true;
        installOutcome = 'accepted';
        notifyListeners();
        return true;
      }
      installOutcome = 'dismissed';
      notifyListeners();
      return false;
    } catch (err) {
      console.error('Error invoking PWA install prompt:', err);
      deferredPrompt = null;
      if (typeof window !== 'undefined') {
        window.__arthDeferredInstallPrompt = null;
      }
      setInstallError('The browser install prompt could not be opened. Use your browser menu to install SpendSense.');
      notifyListeners();
      return false;
    } finally {
      setIsInstalling(false);
    }
  }, [isInstalling]);

  const parsedStore = useMemo(() => {
    const [promptStr, installedStr, outcomeStr] = storeSnapshot.split(':');
    const outcome: 'accepted' | 'dismissed' | null =
      outcomeStr === 'accepted' ? 'accepted' : outcomeStr === 'dismissed' ? 'dismissed' : null;
    return {
      hasPrompt: promptStr === 'true',
      hasInstalled: installedStr === 'true',
      outcome,
    };
  }, [storeSnapshot]);

  const parsedPlatform = useMemo(() => {
    const [
      platform,
      browser,
      isIosStr,
      isIpadStr,
      isWinStr,
      isAndStr,
      isDeskStr,
      isUnknownStr,
    ] = platformSnapshot.split(':');
    const typedPlatform = platform as DevicePlatform;
    const typedBrowser = browser as DeviceBrowser;
    return {
      platform: typedPlatform,
      browser: typedBrowser,
      isIos: isIosStr === 'true',
      isIpad: isIpadStr === 'true',
      isWindows: isWinStr === 'true',
      isAndroid: isAndStr === 'true',
      isDesktop: isDeskStr === 'true',
      isUnknown: isUnknownStr === 'true',
      supportsPromptCapture:
        isIosStr !== 'true' && typedBrowser !== 'firefox' && typedBrowser !== 'safari',
    };
  }, [platformSnapshot]);

  return {
    isHydrated,
    isStandalone,
    isInstallable: parsedStore.hasPrompt,
    isInstalled: isStandalone || parsedStore.hasInstalled,
    isInstalling,
    isIos: parsedPlatform.isIos,
    isIpad: parsedPlatform.isIpad,
    isWindows: parsedPlatform.isWindows,
    isAndroid: parsedPlatform.isAndroid,
    isDesktop: parsedPlatform.isDesktop,
    isUnknown: parsedPlatform.isUnknown,
    platform: parsedPlatform.platform,
    browser: parsedPlatform.browser,
    supportsPromptCapture: parsedPlatform.supportsPromptCapture,
    installOutcome: parsedStore.outcome,
    installError,
    installApp,
  };
}
