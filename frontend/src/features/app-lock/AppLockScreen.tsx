'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArthLogo } from '@/components/brand/ArthLogo';

interface AppLockScreenProps {
  isInitializing?: boolean;
  supportsPlatformAuth: boolean;
  onUnlock: () => Promise<void>;
  onResetViaAccount?: () => void;
}

export function AppLockScreen({ isInitializing = false, supportsPlatformAuth, onUnlock, onResetViaAccount }: AppLockScreenProps) {
  const router = useRouter();
  const attempted = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false);
  const runPrompt = useCallback(async () => {
    if (busy || !supportsPlatformAuth) return;
    setBusy(true); setError(null);
    try { await onUnlock(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Device biometric verification failed.'); }
    finally { setBusy(false); }
  }, [busy, onUnlock, supportsPlatformAuth]);
  useEffect(() => {
    if (!isInitializing && supportsPlatformAuth && !attempted.current) {
      attempted.current = true;
      void runPrompt();
    }
  }, [isInitializing, supportsPlatformAuth, runPrompt]);

  return (
    <main data-app-lock-screen role="dialog" aria-modal="true" aria-labelledby="app-lock-title" className="fixed inset-0 z-[100] flex min-h-dvh items-center justify-center bg-[var(--bg-canvas)] px-5 py-8 text-[var(--text-primary)]">
      <section className="w-full max-w-sm rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 text-center shadow-xl">
        <ArthLogo variant="full" className="mx-auto mb-5 h-7 w-auto max-w-[140px] text-[var(--text-primary)]" />
        <h1 id="app-lock-title" className="text-lg font-semibold">{isInitializing ? 'Preparing SpendSense…' : 'Unlock SpendSense'}</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">{isInitializing ? 'Checking this device…' : 'Verify with your device biometric to continue.'}</p>
        <p className="mt-2 text-xs text-[var(--text-muted)]">The operating system selects the available biometric. Fingerprint-only authentication is not guaranteed.</p>
        {error && <p role="alert" className="mt-4 rounded-lg border border-rose-300 p-3 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
        {!isInitializing && <div className="mt-5 flex flex-col gap-3">
          {supportsPlatformAuth ? <button type="button" onClick={() => void runPrompt()} disabled={busy} className="min-h-11 rounded-lg bg-[var(--action-primary-bg)] px-4 text-sm font-semibold text-[var(--action-primary-fg)] disabled:opacity-60">{busy ? 'Waiting for device…' : 'Unlock with device biometric'}</button> : <p className="text-sm text-[var(--text-secondary)]">Device biometric verification is unavailable in this browser.</p>}
          <button type="button" disabled={recovering} onClick={async () => {
            if (!onResetViaAccount) { router.push('/login'); return; }
            setRecovering(true); setError(null);
            try { await onResetViaAccount(); } catch (e) { setError(e instanceof Error ? e.message : 'Account recovery failed. SpendSense remains locked.'); }
            finally { setRecovering(false); }
          }} className="text-sm text-[var(--text-secondary)] underline underline-offset-2 disabled:opacity-60">{recovering ? 'Signing out…' : 'Account recovery'}</button>
        </div>}
      </section>
    </main>
  );
}
