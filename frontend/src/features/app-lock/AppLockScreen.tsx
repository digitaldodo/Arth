'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ArthLogo } from '@/components/brand/ArthLogo';

interface AppLockScreenProps {
  isInitializing?: boolean;
  hasLocalPasscode: boolean;
  biometricsEnabled: boolean;
  supportsPlatformAuth: boolean;
  onUnlockPasscode: (passcode: string) => Promise<boolean>;
  onUnlockBiometrics?: () => Promise<void>;
  onUnlock?: () => Promise<void>;
  onResetViaAccount?: () => void;
}

export function AppLockScreen({
  isInitializing = false,
  hasLocalPasscode,
  biometricsEnabled,
  supportsPlatformAuth,
  onUnlockPasscode,
  onUnlockBiometrics,
  onUnlock,
  onResetViaAccount,
}: AppLockScreenProps) {
  const [passcode, setPasscode] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRecoveryDialog, setShowRecoveryDialog] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isInitializing) {
      inputRef.current?.focus();
    }
  }, [isInitializing]);

  const handlePasscodeSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (busy || !passcode.trim()) return;

    setBusy(true);
    setError(null);

    try {
      const success = await onUnlockPasscode(passcode.trim());
      if (!success) {
        setError('Incorrect passcode. Please try again.');
        setPasscode('');
        inputRef.current?.focus();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
      setPasscode('');
    } finally {
      setBusy(false);
    }
  };

  const handleBiometricClick = async () => {
    const unlockAction = onUnlock || onUnlockBiometrics;
    if (busy || !unlockAction) return;
    setBusy(true);
    setError(null);
    try {
      if (onUnlock) {
        await onUnlock();
      } else if (onUnlockBiometrics) {
        await onUnlockBiometrics();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Biometric verification failed.');
    } finally {
      setBusy(false);
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
        <ArthLogo variant="full" className="mx-auto mb-6 h-8 w-auto max-w-[160px] text-[var(--text-primary)]" />

        <div
          className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)]"
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>

        <h1 id="app-lock-title" className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
          {isInitializing ? 'Preparing Arth…' : 'Arth is Locked'}
        </h1>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          {isInitializing
            ? 'Initializing secure lock state…'
            : 'Enter your local passcode to unlock your ledger.'}
        </p>

        {!isInitializing && (
          <>
            {error && (
              <div
                role="alert"
                className="mt-4 p-2.5 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-700 dark:text-rose-300 font-medium"
              >
                {error}
              </div>
            )}

            <form onSubmit={handlePasscodeSubmit} className="mt-5 space-y-3.5">
              <div className="relative">
                <input
                  ref={inputRef}
                  type={showPasscode ? 'text' : 'password'}
                  inputMode="numeric"
                  autoComplete="current-password"
                  value={passcode}
                  onChange={(e) => {
                    setPasscode(e.target.value);
                    if (error) setError(null);
                  }}
                  disabled={busy}
                  placeholder="Enter passcode"
                  aria-label="App Lock Passcode"
                  className="w-full text-center tracking-widest text-base font-mono rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-4 py-2.5 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-hidden focus:ring-2 focus:ring-[var(--focus-ring)] disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowPasscode(!showPasscode)}
                  aria-label={showPasscode ? 'Hide passcode' : 'Show passcode'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  {showPasscode ? '🙈' : '👁️'}
                </button>
              </div>

              <button
                type="submit"
                disabled={busy || !passcode.trim()}
                className="w-full min-h-11 rounded-lg bg-[var(--action-primary-bg)] px-4 text-xs font-semibold text-[var(--action-primary-fg)] transition-colors hover:bg-[var(--action-primary-hover)] active:scale-[0.99] disabled:opacity-50 cursor-pointer shadow-xs"
              >
                {busy ? 'Verifying…' : 'Unlock Arth'}
              </button>

              {biometricsEnabled && supportsPlatformAuth && onUnlockBiometrics && (
                <button
                  type="button"
                  onClick={handleBiometricClick}
                  disabled={busy}
                  className="w-full min-h-10 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface-subtle)] hover:text-[var(--text-primary)] transition-colors cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>🔐</span>
                  <span>Unlock with Biometrics</span>
                </button>
              )}
            </form>

            <div className="mt-5 pt-3 border-t border-[var(--border-hairline)] flex items-center justify-center">
              <button
                type="button"
                onClick={() => setShowRecoveryDialog(true)}
                className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] underline transition-colors cursor-pointer"
              >
                Forgot passcode?
              </button>
            </div>
          </>
        )}

        {/* Recovery Guidance Modal */}
        {showRecoveryDialog && (
          <div
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
            role="dialog"
            aria-modal="true"
            aria-labelledby="recovery-title"
          >
            <div className="w-full max-w-xs rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 text-left shadow-2xl space-y-3">
              <h2 id="recovery-title" className="text-sm font-semibold text-[var(--text-primary)]">
                Reset App Lock
              </h2>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                If you forgot your local app passcode, you can safely reset it by re-signing in with your Arth account when online.
              </p>
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                Your offline transactions and pending changes remain safely stored on this device.
              </p>
              <div className="pt-2 flex flex-col gap-2">
                <a
                  href="/login"
                  className="w-full py-2 px-3 text-center text-xs font-semibold rounded-lg bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] hover:bg-[var(--action-primary-hover)] transition-colors shadow-xs"
                >
                  Sign In to Reset Lock
                </a>
                <button
                  type="button"
                  onClick={() => setShowRecoveryDialog(false)}
                  className="w-full py-2 text-center text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  Back to Passcode
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
