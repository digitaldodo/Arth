'use client';

import React, { useState } from 'react';
import type { AutoLockTimeout } from './storage';
import type { useAppLock } from './useAppLock';
import { Badge } from '@/components/ui/Badge';

interface AppLockSettingsProps {
  appLock: ReturnType<typeof useAppLock>;
}

export function AppLockSettings({ appLock }: AppLockSettingsProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Setup form state
  const [isSettingPasscode, setIsSettingPasscode] = useState(false);
  const [newPasscode, setNewPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);

  // Change passcode form state
  const [isChangingPasscode, setIsChangingPasscode] = useState(false);
  const [currentPasscode, setCurrentPasscode] = useState('');
  const [changeNewPasscode, setChangeNewPasscode] = useState('');
  const [changeConfirmPasscode, setChangeConfirmPasscode] = useState('');

  // Disable confirmation state
  const [isDisabling, setIsDisabling] = useState(false);
  const [disablePasscode, setDisablePasscode] = useState('');

  // Clear messages
  const clearMessage = () => setMessage(null);

  // Handle Set New Passcode
  const handleSetPasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessage();

    if (newPasscode.length < 4) {
      setMessage({ type: 'error', text: 'Passcode must be at least 4 digits or characters.' });
      return;
    }
    if (newPasscode !== confirmPasscode) {
      setMessage({ type: 'error', text: 'Passcodes do not match. Please verify.' });
      return;
    }

    setBusy(true);
    try {
      await appLock.setPasscode(newPasscode);
      setNewPasscode('');
      setConfirmPasscode('');
      setIsSettingPasscode(false);
      setMessage({ type: 'success', text: 'App Lock enabled! Your ledger is now protected with your local passcode.' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to set passcode.' });
    } finally {
      setBusy(false);
    }
  };

  // Handle Change Passcode
  const handleChangePasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessage();

    if (!currentPasscode) {
      setMessage({ type: 'error', text: 'Please enter your current passcode.' });
      return;
    }
    if (changeNewPasscode.length < 4) {
      setMessage({ type: 'error', text: 'New passcode must be at least 4 digits or characters.' });
      return;
    }
    if (changeNewPasscode !== changeConfirmPasscode) {
      setMessage({ type: 'error', text: 'New passcodes do not match.' });
      return;
    }

    setBusy(true);
    try {
      await appLock.changePasscode(currentPasscode, changeNewPasscode);
      setCurrentPasscode('');
      setChangeNewPasscode('');
      setChangeConfirmPasscode('');
      setIsChangingPasscode(false);
      setMessage({ type: 'success', text: 'Passcode updated successfully.' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to change passcode.' });
    } finally {
      setBusy(false);
    }
  };

  // Handle Disable App Lock
  const handleDisableLock = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessage();

    if (!disablePasscode) {
      setMessage({ type: 'error', text: 'Please enter your passcode to turn off App Lock.' });
      return;
    }

    setBusy(true);
    try {
      const valid = await appLock.verifyPasscodeUnlock(disablePasscode);
      if (!valid) {
        setMessage({ type: 'error', text: 'Incorrect passcode. App Lock remains enabled.' });
        return;
      }
      appLock.disableAfterVerification();
      setDisablePasscode('');
      setIsDisabling(false);
      setMessage({ type: 'success', text: 'App Lock disabled on this device.' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to verify passcode.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="p-4 sm:p-5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] space-y-4" aria-labelledby="app-lock-settings-title">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] flex items-center justify-center text-xs shrink-0">
            🛡️
          </div>
          <div>
            <h3 id="app-lock-settings-title" className="text-xs font-semibold text-[var(--text-primary)] truncate">
              App Lock & Privacy Barrier
            </h3>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
              Protect your financial ledger when leaving your device unattended
            </p>
          </div>
        </div>

        {appLock.isEnabled ? (
          <Badge variant="connected" size="sm" dot>
            Locked & Protected
          </Badge>
        ) : (
          <Badge variant="disconnected" size="sm" dot>
            Disabled
          </Badge>
        )}
      </div>

      {/* Messages */}
      {message && (
        <div
          role="alert"
          className={`p-3 rounded-lg border text-xs font-medium ${
            message.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* 1. App Lock Status & Primary Controls */}
      <div className="p-3.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
          <div>
            <p className="text-xs font-semibold text-[var(--text-primary)]">
              Device Passcode Protection
            </p>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
              {appLock.hasLocalPasscode
                ? 'Secured with a local PBKDF2 derived passcode. Works 100% offline.'
                : 'No local passcode configured on this device yet.'}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!appLock.isEnabled ? (
              <button
                type="button"
                onClick={() => {
                  clearMessage();
                  setIsSettingPasscode(true);
                  setIsChangingPasscode(false);
                  setIsDisabling(false);
                }}
                disabled={busy}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] hover:bg-[var(--action-primary-hover)] active:scale-[0.99] transition-all cursor-pointer shadow-xs disabled:opacity-50"
              >
                {appLock.hasLocalPasscode ? 'Turn On App Lock' : 'Set Up App Lock'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  clearMessage();
                  setIsDisabling(true);
                  setIsSettingPasscode(false);
                  setIsChangingPasscode(false);
                }}
                disabled={busy}
                className="px-3.5 py-1.5 text-xs font-medium rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-300 transition-colors cursor-pointer disabled:opacity-50"
              >
                Turn Off Lock
              </button>
            )}
          </div>
        </div>

        {/* Set Passcode Inline Form */}
        {isSettingPasscode && (
          <form onSubmit={handleSetPasscode} className="pt-3 border-t border-[var(--border-hairline)] space-y-3 animate-in fade-in duration-150">
            <p className="text-xs font-semibold text-[var(--text-primary)]">
              Choose a Local App Passcode
            </p>
            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
              Create a 4 to 8 digit or alphanumeric passcode. This is stored securely on this device and works offline without internet.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                type={showPasscode ? 'text' : 'password'}
                inputMode="numeric"
                value={newPasscode}
                onChange={(e) => setNewPasscode(e.target.value)}
                placeholder="New passcode (min 4 chars)"
                className="w-full text-xs font-mono rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-[var(--text-primary)] focus:outline-hidden focus:ring-1 focus:ring-[var(--focus-ring)]"
              />
              <input
                type={showPasscode ? 'text' : 'password'}
                inputMode="numeric"
                value={confirmPasscode}
                onChange={(e) => setConfirmPasscode(e.target.value)}
                placeholder="Confirm new passcode"
                className="w-full text-xs font-mono rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-[var(--text-primary)] focus:outline-hidden focus:ring-1 focus:ring-[var(--focus-ring)]"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showPasscode}
                  onChange={(e) => setShowPasscode(e.target.checked)}
                  className="rounded-xs"
                />
                Show passcode
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsSettingPasscode(false)}
                  className="px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy || newPasscode.length < 4}
                  className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] hover:bg-[var(--action-primary-hover)] transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {busy ? 'Saving…' : 'Save & Enable Lock'}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Disable Lock Confirmation Form */}
        {isDisabling && (
          <form onSubmit={handleDisableLock} className="pt-3 border-t border-[var(--border-hairline)] space-y-3 animate-in fade-in duration-150">
            <p className="text-xs font-semibold text-[var(--text-primary)]">
              Enter Current Passcode to Turn Off App Lock
            </p>
            <div className="flex items-center gap-2">
              <input
                type="password"
                inputMode="numeric"
                value={disablePasscode}
                onChange={(e) => setDisablePasscode(e.target.value)}
                placeholder="Current passcode"
                className="flex-1 text-xs font-mono rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-[var(--text-primary)] focus:outline-hidden"
              />
              <button
                type="button"
                onClick={() => setIsDisabling(false)}
                className="px-3 py-2 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !disablePasscode}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-rose-700 text-white hover:bg-rose-800 transition-colors cursor-pointer disabled:opacity-50"
              >
                {busy ? 'Verifying…' : 'Confirm Turn Off'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* 2. Lock Configuration & Actions (When Enabled) */}
      {appLock.isEnabled && (
        <div className="space-y-3 pt-1">
          {/* Change Passcode */}
          <div className="p-3.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-[var(--text-primary)]">Passcode Management</p>
                <p className="text-[11px] text-[var(--text-muted)]">Update your 4+ digit unlock code</p>
              </div>
              {!isChangingPasscode && (
                <button
                  type="button"
                  onClick={() => {
                    clearMessage();
                    setIsChangingPasscode(true);
                  }}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  Change Passcode
                </button>
              )}
            </div>

            {isChangingPasscode && (
              <form onSubmit={handleChangePasscode} className="pt-2 border-t border-[var(--border-hairline)] space-y-2.5">
                <input
                  type="password"
                  inputMode="numeric"
                  value={currentPasscode}
                  onChange={(e) => setCurrentPasscode(e.target.value)}
                  placeholder="Enter current passcode"
                  className="w-full text-xs font-mono rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-[var(--text-primary)] focus:outline-hidden"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="password"
                    inputMode="numeric"
                    value={changeNewPasscode}
                    onChange={(e) => setChangeNewPasscode(e.target.value)}
                    placeholder="New passcode (min 4 chars)"
                    className="w-full text-xs font-mono rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-[var(--text-primary)] focus:outline-hidden"
                  />
                  <input
                    type="password"
                    inputMode="numeric"
                    value={changeConfirmPasscode}
                    onChange={(e) => setChangeConfirmPasscode(e.target.value)}
                    placeholder="Confirm new passcode"
                    className="w-full text-xs font-mono rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-[var(--text-primary)] focus:outline-hidden"
                  />
                </div>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsChangingPasscode(false)}
                    className="px-3 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={busy || !currentPasscode || changeNewPasscode.length < 4}
                    className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] hover:bg-[var(--action-primary-hover)] transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {busy ? 'Updating…' : 'Update Passcode'}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Automatic Locking Preferences */}
          <div className="p-3.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] space-y-3">
            <p className="text-xs font-semibold text-[var(--text-primary)]">Auto-Lock Timing & Triggers</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label htmlFor="autolock-select" className="block text-[11px] text-[var(--text-muted)] mb-1">
                  Lock after inactivity:
                </label>
                <select
                  id="autolock-select"
                  value={appLock.autoLockTimeout}
                  onChange={(e) =>
                    appLock.updateAutoLockSettings(
                      e.target.value as AutoLockTimeout,
                      appLock.lockOnBackground
                    )
                  }
                  className="w-full text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-[var(--text-primary)] cursor-pointer focus:outline-hidden"
                >
                  <option value="immediate">Immediately</option>
                  <option value="1m">1 minute</option>
                  <option value="5m">5 minutes (Recommended)</option>
                  <option value="15m">15 minutes</option>
                </select>
              </div>

              <div className="flex items-center justify-between sm:justify-start sm:gap-3 pt-3 sm:pt-4">
                <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={appLock.lockOnBackground}
                    onChange={(e) =>
                      appLock.updateAutoLockSettings(
                        appLock.autoLockTimeout,
                        e.target.checked
                      )
                    }
                    className="rounded-xs"
                  />
                  <span>Lock when app moves to background</span>
                </label>
              </div>
            </div>
          </div>

          {/* Test Lock Action */}
          <div className="flex items-center justify-between pt-1">
            <p className="text-[11px] text-[var(--text-muted)]">
              Verify your passcode works by triggering an immediate lock.
            </p>
            <button
              type="button"
              onClick={() => appLock.lockNow()}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-[var(--bg-surface-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer shadow-2xs"
            >
              🔒 Lock Now
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
