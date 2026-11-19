'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SpendSenseLocale } from './messages';

const LOCALE_EVENT = 'spendsense:locale-change';

function storageKey(userId: string | undefined) {
  return `spendsense_locale_v1:${userId || 'guest'}`;
}

export function readSpendSenseLocale(userId?: string): SpendSenseLocale {
  if (typeof window === 'undefined') return 'en-IN';
  try {
    return window.localStorage.getItem(storageKey(userId)) === 'hi-IN' ? 'hi-IN' : 'en-IN';
  } catch {
    return 'en-IN';
  }
}

export function writeSpendSenseLocale(userId: string | undefined, locale: SpendSenseLocale) {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(storageKey(userId), locale);
    window.dispatchEvent(new CustomEvent(LOCALE_EVENT, { detail: { userId: userId || 'guest', locale } }));
    return true;
  } catch {
    return false;
  }
}

export function useSpendSenseLocale(userId?: string) {
  const [locale, setLocale] = useState<SpendSenseLocale>('en-IN');

  useEffect(() => {
    const sync = () => setLocale(readSpendSenseLocale(userId));
    sync();
    const onCustom = (event: Event) => {
      const detail = (event as CustomEvent<{ userId: string; locale: SpendSenseLocale }>).detail;
      if (detail?.userId === (userId || 'guest')) setLocale(detail.locale);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey(userId)) sync();
    };
    window.addEventListener(LOCALE_EVENT, onCustom);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(LOCALE_EVENT, onCustom);
      window.removeEventListener('storage', onStorage);
    };
  }, [userId]);

  useEffect(() => {
    document.documentElement.lang = locale === 'hi-IN' ? 'hi-Latn' : 'en-IN';
  }, [locale]);

  const updateLocale = useCallback((next: SpendSenseLocale) => {
    if (writeSpendSenseLocale(userId, next)) setLocale(next);
  }, [userId]);

  return { locale, updateLocale } as const;
}
