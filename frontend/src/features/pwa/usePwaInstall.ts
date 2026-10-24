'use client';

import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';

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
  installApp: () => Promise<boolean>;
}

function subscribeStandalone(callback: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }
  const mediaQuery = window.matchMedia('(display-mode: standalone)');
  mediaQuery.addEventListener('change', callback);
  window.addEventListener('appinstalled', callback);

  return () => {
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

export function usePwaInstall(): PwaInstallState {
  const isStandalone = useSyncExternalStore(
    subscribeStandalone,
    getStandaloneSnapshot,
    getStandaloneServerSnapshot
  );

  const isIos = useSyncExternalStore(
    () => () => {},
    getIsIosSnapshot,
    getIsIosServerSnapshot
  );

  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installedManually, setInstalledManually] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setInstalledManually(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const installApp = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) {
      return false;
    }

    try {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setInstalledManually(true);
        setDeferredPrompt(null);
        return true;
      }
      setDeferredPrompt(null);
      return false;
    } catch (err) {
      console.error('Error invoking PWA install prompt:', err);
      return false;
    }
  }, [deferredPrompt]);

  return {
    isStandalone,
    isInstallable: Boolean(deferredPrompt),
    isInstalled: isStandalone || installedManually,
    isIos,
    installApp,
  };
}
