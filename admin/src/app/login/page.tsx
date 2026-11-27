'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArthLogo } from '@/components/brand/ArthLogo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { AdminClientError, adminClient } from '@/lib/admin-api';

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await adminClient.login(username.trim(), password);
      if (res.requiresActivation || res.identity.status === 'PENDING_ACTIVATION') {
        router.replace('/activate');
      } else {
        router.replace('/');
      }
      router.refresh();
    } catch (err) {
      if (err instanceof AdminClientError) {
        setError(err.message);
      } else {
        setError('Unable to reach SpendSense authentication service.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[var(--bg-canvas)] px-4 py-6">
      <div className="mx-auto flex w-full max-w-md items-center justify-between">
        <div className="flex items-center gap-2.5">
          <ArthLogo variant="symbol" className="h-7 w-7" title="SpendSense Admin" />
          <span className="text-sm font-semibold tracking-tight">SpendSense Admin</span>
        </div>
        <ThemeToggle />
      </div>

      <main className="mx-auto my-8 w-full max-w-md">
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 shadow-sm sm:p-8">
          <div className="mb-6">
            <p className="font-mono text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              Restricted Governance Surface
            </p>
            <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-[var(--text-primary)]">
              Administrator Sign In
            </h1>
            <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
              Sign in with your pre-authorized SpendSense administrator username. First-time logins proceed through email verification and owner approval.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-4 rounded-md border px-3 py-2.5 text-xs font-medium"
              style={{
                color: 'var(--status-error-fg)',
                backgroundColor: 'var(--status-error-bg)',
                borderColor: 'var(--status-error-border)',
              }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="admin-username" className="block text-xs font-medium text-[var(--text-secondary)]">
                Administrator Username
              </label>
              <input
                id="admin-username"
                name="username"
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter authorized username"
                className="mt-1.5 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--focus-ring)] focus:outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="admin-password" className="block text-xs font-medium text-[var(--text-secondary)]">
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="text-xs font-medium text-[var(--text-secondary)] underline underline-offset-2 hover:text-[var(--text-primary)]"
                >
                  Forgot password?
                </Link>
              </div>
              <input
                id="admin-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Permanent or initial credential"
                className="mt-1.5 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--focus-ring)] focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-[var(--action-primary-bg)] px-4 py-2.5 text-sm font-medium text-[var(--action-primary-fg)] hover:bg-[var(--action-primary-hover)] disabled:opacity-60 transition-colors cursor-pointer"
            >
              {submitting ? 'Verifying Credentials...' : 'Continue to Portal'}
            </button>
          </form>

          <div className="mt-6 border-t border-[var(--border-hairline)] pt-4 text-xs text-[var(--text-muted)]">
            <p>
              Pre-authorized administrators only. Public registration and standard SpendSense user escalation are disabled at the server layer.
            </p>
          </div>
        </div>
      </main>

      <footer className="mx-auto w-full max-w-md text-center text-[11px] text-[var(--text-muted)]">
        SpendSense Operations & Security Portal • Isolated Admin Session
      </footer>
    </div>
  );
}
