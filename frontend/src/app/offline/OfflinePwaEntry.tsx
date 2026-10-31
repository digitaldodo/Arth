'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TransactionAppShell } from '@/features/transactions/TransactionAppShell';
import { getCachedPwaUser, getSyncMeta } from '@/lib/offline-db';
import { getApplicationRuntimeMode } from '@/lib/platform-mode';
import type { CachedPwaUser } from '@/lib/offline-db';

type EntryState = 'checking' | 'not-prepared' | 'ready';

export function OfflinePwaEntry() {
  const router = useRouter();
  const [state, setState] = useState<EntryState>('checking');
  const [user, setUser] = useState<CachedPwaUser | null>(null);

  useEffect(() => {
    if (getApplicationRuntimeMode() !== 'installed-mobile-pwa') {
      router.replace('/');
      return;
    }
    if (navigator.onLine) {
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
      const prepared = meta.transactionsSnapshotComplete && meta.categoriesSnapshotComplete && meta.balancesCachedAt !== null;
      if (cancelled) return;
      if (prepared) {
        setUser(localUser);
        setState('ready');
      } else {
        setState('not-prepared');
      }
    })();
    return () => { cancelled = true; };
  }, [router]);

  if (state === 'ready' && user) return <TransactionAppShell user={user} />;
  return (
    <main className="min-h-screen grid place-items-center px-6 py-12 bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      <section className="w-full max-w-sm rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold">{state === 'checking' ? 'Opening Arth' : 'Offline access not prepared'}</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
          {state === 'checking'
            ? 'Checking this device for your saved Arth data…'
            : 'Connect to the internet and open Arth once to securely load your account data for offline use.'}
        </p>
        {state === 'not-prepared' && (
          <button type="button" onClick={() => window.location.reload()} className="mt-5 rounded-md bg-[var(--action-primary-bg)] px-4 py-2 text-sm font-semibold text-[var(--action-primary-fg)]">
            Try again
          </button>
        )}
      </section>
    </main>
  );
}
