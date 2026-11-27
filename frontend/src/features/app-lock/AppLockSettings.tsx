'use client';

import React, { useState } from 'react';
import type { AutoLockTimeout } from './storage';
import type { useAppLock } from './useAppLock';

export function AppLockSettings({ appLock }: { appLock: ReturnType<typeof useAppLock> }) {
  const [message, setMessage] = useState<string | null>(null);
  const enable = async () => {
    setMessage(null);
    try {
      await appLock.registerDevice();
      appLock.updateBiometricsEnabled(true);
      setMessage('Device biometric unlock is enabled. Android selects the available biometric; fingerprint-only behavior is not guaranteed.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Device biometric setup failed.'); }
  };
  const timeout = (event: React.ChangeEvent<HTMLSelectElement>) => appLock.updateAutoLockSettings(event.target.value as AutoLockTimeout, appLock.lockOnBackground);
  return <section className="space-y-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4 sm:p-5" aria-labelledby="app-lock-settings-title">
    <div><h3 id="app-lock-settings-title" className="text-sm font-semibold text-[var(--text-primary)]">App Lock</h3><p className="mt-1 text-xs text-[var(--text-secondary)]">Use the operating system’s device biometric prompt when supported.</p></div>
    {message && <p role="status" className="text-xs text-[var(--text-secondary)]">{message}</p>}
    <div className="flex flex-wrap items-center gap-3">
      {appLock.biometricsEnabled ? <button type="button" onClick={() => { appLock.disableAfterVerification(); appLock.updateBiometricsEnabled(false); }} className="rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-xs font-medium">Turn off app lock</button> : <button type="button" disabled={!appLock.supportsPlatformAuth || appLock.isCheckingPlatformAuth} onClick={() => void enable()} className="rounded-lg bg-[var(--action-primary-bg)] px-3 py-2 text-xs font-semibold text-[var(--action-primary-fg)] disabled:opacity-50">Set up device biometric</button>}
      <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">Lock after<select value={appLock.autoLockTimeout} onChange={timeout} className="rounded-md border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2 py-1"><option value="immediate">Immediately</option><option value="1m">1 minute</option><option value="5m">5 minutes</option><option value="15m">15 minutes</option></select></label>
    </div>
    <p className="text-[11px] text-[var(--text-muted)]">In Android full-screen app mode, the OS biometric prompt gates new launches while Chrome controls resuming already-open sessions. Standard browser verification uses the platform authenticator supported by your browser.</p>
  </section>;
}
