'use client';

import React, { useState } from 'react';
import { verifyCurrentPasswordAction } from '@/app/login/actions';

interface AppLockPasswordFallbackProps {
  onVerified: () => void;
  onCancel?: () => void;
  buttonLabel?: string;
}

export function AppLockPasswordFallback({ onVerified, onCancel, buttonLabel = 'Verify password' }: AppLockPasswordFallbackProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await verifyCurrentPasswordAction(password);
      if (!result.valid) {
        setError(result.error || 'Verification failed. Try again.');
        return;
      }
      setPassword('');
      onVerified();
    } catch {
      setError('Verification could not be completed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="w-full space-y-3 text-left">
      <label htmlFor="app-lock-password" className="block text-xs font-medium text-[var(--text-secondary)]">
        Arth account password
      </label>
      <input
        id="app-lock-password"
        type="password"
        autoFocus
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        disabled={busy}
        required
        className="h-11 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 text-sm text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-primary)]"
      />
      {error && <p role="alert" className="text-xs text-[var(--status-error-fg)]">{error}</p>}
      <div className="flex gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={busy} className="min-h-11 flex-1 rounded-lg border border-[var(--border-hairline)] px-3 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-primary)] disabled:opacity-60">
            Cancel
          </button>
        )}
        <button type="submit" disabled={!password || busy} className="min-h-11 flex-1 rounded-lg bg-[var(--action-primary-bg)] px-3 text-sm font-semibold text-[var(--action-primary-fg)] transition-colors hover:bg-[var(--action-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-primary)] active:scale-[0.99] disabled:opacity-60 motion-reduce:transition-none">
          {busy ? 'Verifying…' : buttonLabel}
        </button>
      </div>
    </form>
  );
}
