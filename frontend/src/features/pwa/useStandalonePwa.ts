'use client';

import { useSyncExternalStore } from 'react';
import {
  isDesktopStandalonePwaClient,
  isMobileStandalonePwaClient,
  isStandalonePwaClient,
} from '@/lib/platform-mode';

function addMediaChangeListener(mql: MediaQueryList, callback: () => void): () => void {
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', callback);
    return () => mql.removeEventListener('change', callback);
  }
  const legacy = mql as MediaQueryList & {
    addListener?: (listener: () => void) => void;
    removeListener?: (listener: () => void) => void;
  };
  legacy.addListener?.(callback);
  return () => legacy.removeListener?.(callback);
}

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const cleanups: Array<() => void> = [];

  try {
    cleanups.push(addMediaChangeListener(window.matchMedia('(display-mode: standalone)'), callback));
    cleanups.push(
      addMediaChangeListener(window.matchMedia('(display-mode: window-controls-overlay)'), callback)
    );
  } catch {
    // Ignore unsupported matchMedia queries
  }

  window.addEventListener('appinstalled', callback);
  window.addEventListener('arth:pwa-installed', callback);

  return () => {
    cleanups.forEach((cleanup) => cleanup());
    window.removeEventListener('appinstalled', callback);
    window.removeEventListener('arth:pwa-installed', callback);
  };
}

export function useStandalonePwa(): boolean {
  return useSyncExternalStore(subscribe, isStandalonePwaClient, () => false);
}

export function useMobileStandalonePwa(): boolean {
  return useSyncExternalStore(subscribe, isMobileStandalonePwaClient, () => false);
}

export function useDesktopStandalonePwa(): boolean {
  return useSyncExternalStore(subscribe, isDesktopStandalonePwaClient, () => false);
}
