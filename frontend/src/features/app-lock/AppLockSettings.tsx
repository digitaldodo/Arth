'use client';

import React, { useState } from 'react';
import type { PasswordStatus } from '@/lib/auth/password-status';
import { AppLockPasswordFallback } from './AppLockPasswordFallback';
import type { useAppLock } from './useAppLock';

interface AppLockSettingsProps {
  appLock: ReturnType<typeof useAppLock>;
  passwordStatus: PasswordStatus;
}

export function AppLockSettings({ appLock, passwordStatus }: AppLockSettingsProps) {
  const [busy, setBusy] = useState(false);
  const [showPasswordFallback, setShowPasswordFallback] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const hasPassword = passwordStatus === 'configured';

  const changeEnabledState = async (viaPassword = false) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      if (!viaPassword) await appLock.verifyDevice();
      if (appLock.isEnabled) appLock.disableAfterVerification();
      else appLock.enableAfterSetup();
      setShowPasswordFallback(false);
      setMessage(appLock.isEnabled ? 'App Lock disabled on this device.' : 'App Lock enabled on this device.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Verification did not complete.');
      if (hasPassword) setShowPasswordFallback(true);
    } finally {
      setBusy(false);
    }
  };

  const register = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await appLock.registerDevice();
      setMessage('This device is configured and App Lock is on.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Device setup failed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const testUnlock = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await appLock.verifyDevice();
      setMessage('Device verification is working.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Device verification failed.');
      if (hasPassword) setShowPasswordFallback(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 p-4" aria-labelledby="app-lock-settings-title">
      <div className="flex items-start gap-3">
        <span className="text-lg" aria-hidden="true">🛡️</span>
        <div className="min-w-0 flex-1">
          <h3 id="app-lock-settings-title" className="text-xs font-semibold text-[var(--text-primary)]">App Lock</h3>
          <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-muted)]">
            Lock this device after 5 minutes without activity. Your browser asks its platform authenticator—such as fingerprint, face recognition, or device PIN—to verify you. Arth never receives biometric data.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium text-[var(--text-primary)]">Enable App Lock</p>
          <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
            {appLock.isConfigured ? 'Configured for this device.' : 'This device has not been configured.'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={appLock.isEnabled}
          aria-label="Enable App Lock on this device"
          disabled={!appLock.isConfigured || busy}
          onClick={() => void changeEnabledState()}
          className={`relative inline-flex min-h-11 w-full items-center justify-center rounded-lg border px-4 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50 sm:w-28 ${appLock.isEnabled ? 'border-[var(--action-primary-bg)] bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)]' : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-subtle)]'}`}
        >
          {busy ? 'Verifying…' : appLock.isEnabled ? 'On' : 'Off'}
        </button>
      </div>

      {!appLock.isConfigured && (
        <div className="space-y-2">
          {appLock.supportsPlatformAuth ? (
            <button type="button" onClick={() => void register()} disabled={busy} className="min-h-11 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-primary)] active:scale-[0.99] disabled:opacity-50 motion-reduce:transition-none">
              {busy ? 'Setting up…' : 'Set Up Biometric Unlock'}
            </button>
          ) : appLock.isCheckingPlatformAuth ? (
            <p role="status" className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3 text-[11px] text-[var(--text-secondary)]">
              Checking whether this browser can use a platform authenticator…
            </p>
          ) : (
            <p className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3 text-[11px] text-[var(--text-secondary)]">
              A compatible platform authenticator is not available here. Use a supported browser on HTTPS to configure this device.
            </p>
          )}
        </div>
      )}

      {appLock.isConfigured && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button type="button" onClick={() => void testUnlock()} disabled={busy} className="min-h-11 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface-subtle)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-primary)] active:opacity-70 disabled:opacity-50 motion-reduce:transition-none">
            {busy ? 'Waiting for device…' : 'Test Unlock'}
          </button>
          {appLock.isEnabled && (
            <button type="button" onClick={appLock.lockNow} disabled={busy} className="min-h-11 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface-subtle)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-primary)] active:opacity-70 disabled:opacity-50 motion-reduce:transition-none">
              Lock Arth Now
            </button>
          )}
        </div>
      )}

      {message && <p role="status" aria-live="polite" className="text-[11px] text-[var(--text-secondary)]">{message}</p>}
      {showPasswordFallback && hasPassword && (
        <AppLockPasswordFallback
          buttonLabel={appLock.isEnabled ? 'Disable App Lock' : 'Enable App Lock'}
          onCancel={() => setShowPasswordFallback(false)}
          onVerified={() => {
            if (appLock.isEnabled) appLock.disableAfterVerification();
            else appLock.enableAfterSetup();
            setShowPasswordFallback(false);
            setMessage(appLock.isEnabled ? 'App Lock disabled on this device.' : 'App Lock enabled on this device.');
          }}
        />
      )}

      <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">
        App Lock is a device privacy barrier. Unlock verification needs an internet connection; offline transactions and pending sync data remain stored while Arth is locked. It preserves your session and does not replace server authorization or account security.
      </p>
    </section>
  );
}
