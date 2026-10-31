'use client';

import { useSyncExternalStore } from 'react';
import { isMobileClient, isStandalonePwaClient } from '@/lib/platform-mode';

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const mode = window.matchMedia('(display-mode: standalone)');
  mode.addEventListener('change', callback);
  window.addEventListener('appinstalled', callback);
  return () => {
    mode.removeEventListener('change', callback);
    window.removeEventListener('appinstalled', callback);
  };
}

function getSnapshot(): boolean {
  return isStandalonePwaClient();
}

export function useStandalonePwa(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export function useMobileStandalonePwa(): boolean {
  return useSyncExternalStore(subscribe, () => isStandalonePwaClient() && isMobileClient(), () => false);
}

