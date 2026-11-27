'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArthLogo } from '@/components/brand/ArthLogo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { AdminClientError, adminClient } from '@/lib/admin-api';

function ResetPasswordForm() {
  const params = useSearchParams();
  const initialToken = params.get('token') || '';
  const [token, setToken] = useState(initialToken);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await adminClient.resetPassword(token.trim(), newPassword, confirmPassword);
      setDone(true);
    } catch (err) {
      setError(err instanceof AdminClientError ? err.message : 'Unable to reset password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 shadow-sm sm:p-8">
      <h1 className="text-lg font-semibold tracking-tight">Set New Administrator Password</h1>
      <p className="mt-1.5 text-xs text-[var(--text-secondary)]">
        Enter your single-use reset token and choose a new strong password (12+ chars with uppercase, lowercase, digit, symbol).
      </p>

      {error && (
        <div
          className="mt-4 rounded-md border px-3 py-2 text-xs"
          style={{
            color: 'var(--status-error-fg)',
            backgroundColor: 'var(--status-error-bg)',
            borderColor: 'var(--status-error-border)',
          }}
        >
          {error}
        </div>
      )}

      {done ? (
        <div className="mt-5 space-y-4">
          <div
            className="rounded-md border p-4 text-xs"
            style={{
              color: 'var(--status-success-fg)',
              backgroundColor: 'var(--status-success-bg)',
              borderColor: 'var(--status-success-border)',
            }}
          >
            Password reset completed. All previous admin sessions have been revoked.
          </div>
          <Link
            href="/login"
            className="block w-full rounded-md bg-[var(--action-primary-bg)] px-4 py-2.5 text-center text-sm font-medium text-[var(--action-primary-fg)]"
          >
            Sign In With New Password
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label htmlFor="reset-token" className="block text-xs font-medium text-[var(--text-secondary)]">
              Recovery Token
            </label>
            <input
              id="reset-token"
              type="text"
              required
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 font-mono text-xs"
            />
          </div>
          <div>
            <label htmlFor="reset-new-pw" className="block text-xs font-medium text-[var(--text-secondary)]">
              New Strong Password
            </label>
            <input
              id="reset-new-pw"
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="reset-confirm-pw" className="block text-xs font-medium text-[var(--text-secondary)]">
              Confirm Password
            </label>
            <input
              id="reset-confirm-pw"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-[var(--action-primary-bg)] px-4 py-2.5 text-sm font-medium text-[var(--action-primary-fg)] hover:bg-[var(--action-primary-hover)] disabled:opacity-60 cursor-pointer"
          >
            {busy ? 'Updating Password...' : 'Reset Password'}
          </button>
        </form>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex flex-col justify-between bg-[var(--bg-canvas)] px-4 py-6">
      <div className="mx-auto flex w-full max-w-md items-center justify-between">
        <Link href="/login" className="flex items-center gap-2.5">
          <ArthLogo variant="symbol" className="h-7 w-7" title="SpendSense Admin" />
          <span className="text-sm font-semibold tracking-tight">SpendSense Admin</span>
        </Link>
        <ThemeToggle />
      </div>
      <main className="mx-auto my-8 w-full max-w-md">
        <Suspense fallback={<div className="text-center text-sm text-[var(--text-muted)]">Loading...</div>}>
          <ResetPasswordForm />
        </Suspense>
      </main>
      <div />
    </div>
  );
}
