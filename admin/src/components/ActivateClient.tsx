'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminIdentityDTO } from '@arth/contracts';
import { ArthLogo } from '@/components/brand/ArthLogo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { RoleBadge, StatusBadge } from '@/components/AdminBadges';
import { AdminClientError, adminClient } from '@/lib/admin-api';

export function ActivateClient({ initialIdentity }: { initialIdentity: AdminIdentityDTO }) {
  const router = useRouter();
  const [identity, setIdentity] = useState<AdminIdentityDTO>(initialIdentity);
  const [email, setEmail] = useState(
    initialIdentity.pendingEmail || initialIdentity.verifiedEmail || '',
  );
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refreshStatus = async () => {
    setBusy(true);
    setError(null);
    try {
      const me = await adminClient.me();
      setIdentity(me);
      if (me.status === 'ENABLED' && me.activationState === 'ACTIVE') {
        router.replace('/');
        router.refresh();
      } else if (me.status === 'DISABLED') {
        router.replace('/login');
      }
    } catch {
      router.replace('/login');
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await adminClient.submitActivationEmail(email.trim());
      setIdentity(res.identity);
      setNotice('Verification code dispatched to your personal email address.');
    } catch (err) {
      setError(err instanceof AdminClientError ? err.message : 'Unable to send verification code.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await adminClient.verifyActivationEmail(otpCode.trim());
      setIdentity(res.identity);
      if (res.identity.activationState === 'AWAITING_OWNER_APPROVAL') {
        setNotice('Email verified. Primary Owner (Ansh Gupta) approval is now required before password setup.');
      } else {
        setNotice('Email verified. Configure your permanent strong administrator password below.');
      }
    } catch (err) {
      setError(err instanceof AdminClientError ? err.message : 'Invalid verification code.');
    } finally {
      setBusy(false);
    }
  };

  const handleCompletePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await adminClient.completeActivation(newPassword, confirmPassword);
      setIdentity(res.identity);
      router.replace('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof AdminClientError ? err.message : 'Failed to activate password.');
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    await adminClient.logout().catch(() => {});
    router.replace('/login');
  };

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[var(--bg-canvas)] px-4 py-6">
      <div className="mx-auto flex w-full max-w-lg items-center justify-between">
        <div className="flex items-center gap-2.5">
          <ArthLogo variant="symbol" className="h-7 w-7" title="SpendSense Admin" />
          <span className="text-sm font-semibold tracking-tight">SpendSense Admin Onboarding</span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={handleSignOut}
            className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </div>

      <main className="mx-auto my-8 w-full max-w-lg">
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 shadow-sm sm:p-8">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-hairline)] pb-4">
            <div>
              <h1 className="text-lg font-semibold tracking-tight">{identity.fullName}</h1>
              <p className="font-mono text-xs text-[var(--text-muted)]">@{identity.username}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <RoleBadge role={identity.role} isOwner={identity.isOwner} />
              <StatusBadge status={identity.status} activationState={identity.activationState} />
            </div>
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

          {notice && (
            <div
              className="mb-4 rounded-md border px-3 py-2.5 text-xs font-medium"
              style={{
                color: 'var(--status-info-fg)',
                backgroundColor: 'var(--status-info-bg)',
                borderColor: 'var(--status-info-border)',
              }}
            >
              {notice}
            </div>
          )}

          {identity.activationState === 'PENDING_EMAIL' && (
            <form onSubmit={handleSubmitEmail} className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold">Step 1: Register & Verify Personal Email</h2>
                <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
                  Your initial temporary credential has been verified. Enter your personal email address to receive a one-time 6-digit verification code.
                </p>
              </div>
              <div>
                <label htmlFor="activation-email" className="block text-xs font-medium text-[var(--text-secondary)]">
                  Personal Email Address
                </label>
                <input
                  id="activation-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="mt-1.5 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--focus-ring)] focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-md bg-[var(--action-primary-bg)] px-4 py-2.5 text-sm font-medium text-[var(--action-primary-fg)] hover:bg-[var(--action-primary-hover)] disabled:opacity-60 cursor-pointer"
              >
                {busy ? 'Sending Code...' : 'Send Verification Code'}
              </button>
            </form>
          )}

          {identity.activationState === 'PENDING_EMAIL_VERIFICATION' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-sm font-semibold">Step 2: Enter Verification Code</h2>
                <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
                  Enter the 6-digit verification code sent to <span className="font-mono text-[var(--text-primary)]">{identity.pendingEmail}</span>.
                </p>
              </div>
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div>
                  <label htmlFor="activation-otp" className="block text-xs font-medium text-[var(--text-secondary)]">
                    6-Digit Code
                  </label>
                  <input
                    id="activation-otp"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    placeholder="000000"
                    className="mt-1.5 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 font-mono text-base tracking-[0.25em] text-[var(--text-primary)] focus:border-[var(--focus-ring)] focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-md bg-[var(--action-primary-bg)] px-4 py-2.5 text-sm font-medium text-[var(--action-primary-fg)] hover:bg-[var(--action-primary-hover)] disabled:opacity-60 cursor-pointer"
                >
                  {busy ? 'Validating Code...' : 'Verify Email Code'}
                </button>
              </form>
              <form onSubmit={handleSubmitEmail} className="border-t border-[var(--border-hairline)] pt-4">
                <p className="mb-2 text-xs text-[var(--text-muted)]">Need a fresh code or different email?</p>
                <div className="flex gap-2">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="min-w-0 flex-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-xs"
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    className="shrink-0 rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                  >
                    Resend
                  </button>
                </div>
              </form>
            </div>
          )}

          {identity.activationState === 'AWAITING_OWNER_APPROVAL' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold">Step 3: Pending Primary Owner Approval</h2>
                <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-secondary)]">
                  Your verified email (<span className="font-mono text-[var(--text-primary)]">{identity.pendingEmail}</span>) is queued for approval by Primary Owner <strong className="text-[var(--text-primary)]">Ansh Gupta</strong> in the Owner Access Console.
                </p>
              </div>
              <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] p-3.5 text-xs text-[var(--text-secondary)]">
                Operational modules remain locked until the primary owner approves your email binding and activation proceeds to permanent password setup.
              </div>
              <button
                type="button"
                onClick={() => void refreshStatus()}
                disabled={busy}
                className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2.5 text-sm font-medium hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
              >
                {busy ? 'Checking Approval Status...' : 'Refresh Approval Status'}
              </button>
            </div>
          )}

          {identity.activationState === 'AWAITING_PASSWORD_SETUP' && (
            <form onSubmit={handleCompletePassword} className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold">Step 4: Set Permanent Strong Password</h2>
                <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
                  Your email (<span className="font-mono text-[var(--text-primary)]">{identity.verifiedEmail || identity.pendingEmail}</span>) is approved. Set a strong permanent password to permanently retire your initial temporary credential.
                </p>
              </div>
              <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] p-3 text-[11px] text-[var(--text-secondary)]">
                Password requirements: minimum 12 characters, including uppercase, lowercase, number, and symbol. Must not contain your username or numeric roll numbers.
              </div>
              <div>
                <label htmlFor="new-password" className="block text-xs font-medium text-[var(--text-secondary)]">
                  Permanent Password
                </label>
                <input
                  id="new-password"
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="mt-1.5 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm focus:border-[var(--focus-ring)] focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="confirm-password" className="block text-xs font-medium text-[var(--text-secondary)]">
                  Confirm Permanent Password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="mt-1.5 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm focus:border-[var(--focus-ring)] focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-md bg-[var(--action-primary-bg)] px-4 py-2.5 text-sm font-medium text-[var(--action-primary-fg)] hover:bg-[var(--action-primary-hover)] disabled:opacity-60 cursor-pointer"
              >
                {busy ? 'Activating Account...' : 'Activate Administrator Account'}
              </button>
            </form>
          )}
        </div>
      </main>

      <footer className="mx-auto w-full max-w-lg text-center text-[11px] text-[var(--text-muted)]">
        Temporary credentials are single-phase and permanently invalidated upon activation.
      </footer>
    </div>
  );
}
