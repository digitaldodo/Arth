'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArthLogo } from '@/components/brand/ArthLogo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { AdminClientError, adminClient } from '@/lib/admin-api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await adminClient.forgotPassword(email.trim());
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof AdminClientError ? err.message : 'Unable to process recovery request.');
    } finally {
      setBusy(false);
    }
  };

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
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 shadow-sm sm:p-8">
          <h1 className="text-lg font-semibold tracking-tight">Administrator Password Recovery</h1>
          <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-secondary)]">
            Password resets are dispatched exclusively to verified administrator email addresses on active accounts.
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

          {submitted ? (
            <div
              className="mt-5 rounded-md border p-4 text-xs leading-relaxed"
              style={{
                color: 'var(--status-success-fg)',
                backgroundColor: 'var(--status-success-bg)',
                borderColor: 'var(--status-success-border)',
              }}
            >
              If that email matches an active verified administrator record, a single-use password reset link has been dispatched.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <label htmlFor="recovery-email" className="block text-xs font-medium text-[var(--text-secondary)]">
                  Verified Administrator Email
                </label>
                <input
                  id="recovery-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1.5 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm focus:border-[var(--focus-ring)] focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-md bg-[var(--action-primary-bg)] px-4 py-2.5 text-sm font-medium text-[var(--action-primary-fg)] hover:bg-[var(--action-primary-hover)] disabled:opacity-60 cursor-pointer"
              >
                {busy ? 'Sending Recovery Email...' : 'Send Recovery Link'}
              </button>
            </form>
          )}

          <div className="mt-5 border-t border-[var(--border-hairline)] pt-4 text-xs">
            <Link href="/login" className="text-[var(--text-secondary)] underline underline-offset-2 hover:text-[var(--text-primary)]">
              Return to Administrator Sign In
            </Link>
          </div>
        </div>
      </main>
      <div />
    </div>
  );
}
