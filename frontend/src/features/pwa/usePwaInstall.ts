'use client';

import { useEffect, useCallback, useSyncExternalStore } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export interface PwaInstallState {
  isStandalone: boolean;
  isInstallable: boolean;
  isInstalled: boolean;
  isIos: boolean;
  installOutcome: 'accepted' | 'dismissed' | null;
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

function notifyListeners() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Ignore subscriber errors
    }
  });
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
  const mediaQuery = window.matchMedia('(display-mode: standalone)');
  mediaQuery.addEventListener('change', callback);
  window.addEventListener('appinstalled', callback);

  return () => {
    listeners.delete(callback);
    mediaQuery.removeEventListener('change', callback);
    window.removeEventListener('appinstalled', callback);
  };
}

function getStandaloneSnapshot(): boolean {
  if (typeof window === 'undefined') return false;
  const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches;
  const isIosStandalone =
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return Boolean(isStandaloneMode || isIosStandalone);
}

function getStandaloneServerSnapshot(): boolean {
  return false;
}

function getIsIosSnapshot(): boolean {
  if (typeof window === 'undefined') return false;
  return /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
}

function getIsIosServerSnapshot(): boolean {
  return false;
}

function getStoreVersion(): string {
  return `${Boolean(deferredPrompt)}:${installedManually}:${installOutcome ?? 'none'}`;
}

export function usePwaInstall(): PwaInstallState {
  const isStandalone = useSyncExternalStore(
    subscribeInstallStore,
    getStandaloneSnapshot,
    getStandaloneServerSnapshot
  );

  const isIos = useSyncExternalStore(
    () => () => {},
    getIsIosSnapshot,
    getIsIosServerSnapshot
  );

  useSyncExternalStore(
    subscribeInstallStore,
    getStoreVersion,
    () => 'false:false:none'
  );

  useEffect(() => {
    initPwaInstallCapture();
  }, []);

  const installApp = useCallback(async (): Promise<boolean> => {
    const promptEvent = deferredPrompt ?? (typeof window !== 'undefined' ? window.__arthDeferredInstallPrompt ?? null : null);
    if (!promptEvent) {
      return false;
    }

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
      return false;
    }
  }, []);

  return {
    isStandalone,
    isInstallable: Boolean(deferredPrompt),
    isInstalled: isStandalone || installedManually,
    isIos,
    installOutcome,
    installApp,
  };
}
