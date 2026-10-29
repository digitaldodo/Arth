'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ArthLogo } from '@/components/brand/ArthLogo';
import { AppLockPasswordFallback } from './AppLockPasswordFallback';

interface AppLockScreenProps {
  isInitializing?: boolean;
  hasPassword: boolean;
  deviceConfigured: boolean;
  supportsPlatformAuth: boolean;
  isCheckingPlatformAuth: boolean;
  onUnlock: () => Promise<void>;
  onPasswordVerified: () => void;
  onRecoverBySigningIn: () => Promise<void>;
}

export function AppLockScreen({
  isInitializing = false,
  hasPassword,
  deviceConfigured,
  supportsPlatformAuth,
  isCheckingPlatformAuth,
  onUnlock,
  onPasswordVerified,
  onRecoverBySigningIn,
}: AppLockScreenProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const unlockButtonRef = useRef<HTMLButtonElement>(null);
  const passwordFallbackRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isInitializing || isCheckingPlatformAuth) return;
    if (deviceConfigured && supportsPlatformAuth) unlockButtonRef.current?.focus();
    else passwordFallbackRef.current?.focus();
  }, [deviceConfigured, isCheckingPlatformAuth, isInitializing, supportsPlatformAuth]);

  const unlock = async () => {
    if (busy || !deviceConfigured || !supportsPlatformAuth) return;
    setBusy(true);
    setError(null);
    try {
      await onUnlock();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not verify this device. Arth remains locked.');
    } finally {
      setBusy(false);
    }
  };

  const recover = async () => {
    if (busy || recovering) return;
    setRecovering(true);
    setError(null);
    try {
      await onRecoverBySigningIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign out could not be completed. Arth remains locked.');
      setRecovering(false);
    }
  };

  return (
    <main
      data-app-lock-screen
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-lock-title"
      className="fixed inset-0 z-[100] flex min-h-dvh items-center justify-center overflow-y-auto bg-[var(--bg-canvas)] px-5 py-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] text-[var(--text-primary)]"
    >
      <section className="my-auto w-full max-w-sm shrink-0 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 text-center shadow-xl sm:p-8">
        <ArthLogo variant="full" className="mx-auto mb-8 h-8 w-auto max-w-[160px] text-[var(--text-primary)]" />
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)]" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" />
            <path d="M9 12.2 11 14l4-4.2" />
          </svg>
        </div>
        <h1 id="app-lock-title" className="text-lg font-semibold tracking-tight">
          {isInitializing ? 'Preparing Arth' : 'Arth is locked'}
        </h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          {isInitializing ? 'Checking this device’s lock settings…' : "Verify it's you to continue."}
        </p>

        {!isInitializing && (
          <div className="mt-6 space-y-3">
            <button
              type="button"
              ref={unlockButtonRef}
              onClick={unlock}
              disabled={busy || recovering || !deviceConfigured || !supportsPlatformAuth}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[var(--action-primary-bg)] px-4 text-sm font-semibold text-[var(--action-primary-fg)] transition-colors hover:bg-[var(--action-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-surface)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
            >
              <span aria-hidden="true">⌁</span>
              {busy ? 'Waiting for device…' : 'Unlock Arth'}
            </button>
            {isCheckingPlatformAuth && <p role="status" className="text-xs text-[var(--text-muted)]">Checking device support…</p>}
            {!supportsPlatformAuth && !isCheckingPlatformAuth && (
              <p className="text-xs text-[var(--text-muted)]">
                This browser cannot reach the configured device authenticator. Use your account recovery option below.
              </p>
            )}
            {error && <p role="alert" className="text-xs text-[var(--status-error-fg)]">{error}</p>}

            {hasPassword && (
              showPassword ? (
                <AppLockPasswordFallback
                  onVerified={onPasswordVerified}
                  onCancel={() => setShowPassword(false)}
                  buttonLabel="Unlock Arth"
                />
              ) : (
                <button ref={passwordFallbackRef} type="button" disabled={recovering} onClick={() => setShowPassword(true)} className="min-h-11 w-full rounded-lg px-3 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface-subtle)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-primary)] active:opacity-70 disabled:opacity-60 motion-reduce:transition-none">
                  Use account password
                </button>
              )
            )}

            <button type="button" onClick={() => void recover()} disabled={busy || recovering} className="min-h-11 w-full rounded-lg px-3 text-xs text-[var(--text-muted)] underline underline-offset-4 hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-primary)] disabled:opacity-60">
              {recovering ? 'Signing out…' : hasPassword ? 'Sign out and use account sign-in' : 'Can’t use this device? Sign in again'}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
