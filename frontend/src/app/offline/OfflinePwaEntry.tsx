'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TransactionAppShell } from '@/features/transactions/TransactionAppShell';
import { getCachedPwaUser, getSyncMeta } from '@/lib/offline-db';
import { isStandalonePwaClient } from '@/lib/platform-mode';
import type { CachedPwaUser } from '@/lib/offline-db';

type EntryState = 'checking' | 'browser-offline' | 'not-prepared' | 'ready';

export function OfflinePwaEntry() {
  const router = useRouter();
  const [state, setState] = useState<EntryState>('checking');
  const [user, setUser] = useState<CachedPwaUser | null>(null);

  useEffect(() => {
    const isStandalonePwa = isStandalonePwaClient();

    if (!isStandalonePwa) {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        router.replace('/');
      } else {
        // Defer state transition out of synchronous effect body
        queueMicrotask(() => setState('browser-offline'));
      }
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.onLine && typeof window !== 'undefined' && window.location.pathname === '/offline') {
      router.replace('/');
      return;
    }

    let cancelled = false;
    void (async () => {
      const localUser = await getCachedPwaUser();
      if (!localUser) {
        if (!cancelled) setState('not-prepared');
        return;
      }
      const meta = await getSyncMeta(localUser.id);
      const prepared =
        (meta.transactionsSnapshotComplete && meta.categoriesSnapshotComplete && meta.balancesCachedAt !== null) ||
        Boolean(localUser);
      if (cancelled) return;
      if (prepared) {
        setUser(localUser);
        setState('ready');
      } else {
        setState('not-prepared');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    const handleOnline = () => {
      if (typeof window !== 'undefined' && window.location.pathname === '/offline') {
        router.replace('/');
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [router]);

  if (state === 'ready' && user) return <TransactionAppShell user={user} />;

  return (
    <main className="min-h-screen grid place-items-center px-6 py-12 bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      <section className="w-full max-w-sm rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold">
          {state === 'checking'
            ? 'Opening SpendSense'
            : state === 'browser-offline'
              ? 'Internet Connection Required'
              : 'Sign In Required for Offline Access'}
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
          {state === 'checking'
            ? 'Checking this device for your saved SpendSense session…'
            : state === 'browser-offline'
              ? 'Reconnect to open SpendSense in your browser, or launch the installed SpendSense app for offline ledger access.'
              : 'Connect to the internet and sign in to SpendSense once to securely use your ledger offline on this device.'}
        </p>
        {(state === 'not-prepared' || state === 'browser-offline') && (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 rounded-md bg-[var(--action-primary-bg)] px-4 py-2 text-sm font-semibold text-[var(--action-primary-fg)] hover:bg-[var(--action-primary-hover)] transition-colors cursor-pointer"
          >
            Try again
          </button>
        )}
      </section>
    </main>
  );
}
