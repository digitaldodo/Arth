'use client';

import React, { useState } from 'react';
import type { AdminIdentityDTO } from '@arth/contracts';
import { adminClient, AdminClientError } from '@/lib/admin-api';

export function AccountClient({ identity: initialIdentity }: { identity: AdminIdentityDTO }) {
  const [identity, setIdentity] = useState<AdminIdentityDTO>(initialIdentity);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [emailPassword, setEmailPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [emailOtp, setEmailOtp] = useState('');

  const [busy, setBusy] = useState<'pw' | 'email' | 'otp' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);
    setBusy('pw');
    try {
      await adminClient.changePassword(currentPassword, newPassword, confirmPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage('Password updated successfully and old sessions rotated.');
    } catch (err) {
      setError(err instanceof AdminClientError ? err.message : 'Unable to update password.');
    } finally {
      setBusy(null);
    }
  };

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);
    setBusy('email');
    try {
      const res = await adminClient.changeEmail(emailPassword, newEmail.trim());
      setIdentity(res.identity);
      setEmailPassword('');
      setNewEmail('');
      setMessage('Verification code dispatched to your new email address. Enter the 6-digit code below.');
    } catch (err) {
      setError(err instanceof AdminClientError ? err.message : 'Unable to request email change.');
    } finally {
      setBusy(null);
    }
  };

  const handleVerifyPendingEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);
    setBusy('otp');
    try {
      const res = await adminClient.verifyActivationEmail(emailOtp.trim());
      setIdentity(res.identity);
      setEmailOtp('');
      setMessage(
        res.identity.pendingEmailVerified
          ? 'New email OTP verified. Pending Primary Owner approval in Owner Access Controls.'
          : 'Verified email updated successfully.',
      );
    } catch (err) {
      setError(err instanceof AdminClientError ? err.message : 'Invalid verification code.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div
          role="alert"
          className="rounded-lg border px-4 py-3 text-xs font-medium"
          style={{
            color: 'var(--status-error-fg)',
            backgroundColor: 'var(--status-error-bg)',
            borderColor: 'var(--status-error-border)',
          }}
        >
          {error}
        </div>
      )}
      {message && (
        <div
          className="rounded-lg border px-4 py-3 text-xs font-medium"
          style={{
            color: 'var(--status-success-fg)',
            backgroundColor: 'var(--status-success-bg)',
            borderColor: 'var(--status-success-border)',
          }}
        >
          {message}
        </div>
      )}

      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 text-xs">
        <p className="font-semibold text-[var(--text-primary)]">Active Identity Summary</p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div>
            <span className="text-[var(--text-muted)]">Name: </span>
            <span>{identity.fullName}</span>
          </div>
          <div>
            <span className="text-[var(--text-muted)]">Username: </span>
            <span className="font-mono">@{identity.username}</span>
          </div>
          <div>
            <span className="text-[var(--text-muted)]">Verified Email: </span>
            <span className="font-mono">{identity.verifiedEmail || 'Pending'}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <form
          onSubmit={handleChangePassword}
          className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 space-y-4"
        >
          <h2 className="text-sm font-semibold">Change Permanent Password</h2>
          <div>
            <label htmlFor="cur-pw" className="block text-xs font-medium text-[var(--text-secondary)]">
              Current Password
            </label>
            <input
              id="cur-pw"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="acc-new-pw" className="block text-xs font-medium text-[var(--text-secondary)]">
              New Strong Password
            </label>
            <input
              id="acc-new-pw"
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="acc-conf-pw" className="block text-xs font-medium text-[var(--text-secondary)]">
              Confirm New Password
            </label>
            <input
              id="acc-conf-pw"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={busy === 'pw'}
            className="rounded-md bg-[var(--action-primary-bg)] px-4 py-2 text-xs font-medium text-[var(--action-primary-fg)] cursor-pointer"
          >
            {busy === 'pw' ? 'Updating...' : 'Update Password'}
          </button>
        </form>

        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 space-y-4">
          <form onSubmit={handleChangeEmail} className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold">Change Verified Email</h2>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Requires current password verification, new OTP confirmation, and Primary Owner approval.
              </p>
            </div>
            <div>
              <label htmlFor="email-pw" className="block text-xs font-medium text-[var(--text-secondary)]">
                Current Password
              </label>
              <input
                id="email-pw"
                type="password"
                required
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
                className="mt-1.5 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="new-email" className="block text-xs font-medium text-[var(--text-secondary)]">
                New Personal Email
              </label>
              <input
                id="new-email"
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="mt-1.5 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={busy === 'email'}
              className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] px-4 py-2 text-xs font-medium hover:bg-[var(--bg-canvas)] cursor-pointer"
            >
              {busy === 'email' ? 'Dispatching OTP...' : 'Request Email Change'}
            </button>
          </form>

          {identity.pendingEmail && !identity.pendingEmailVerified && (
            <form
              onSubmit={handleVerifyPendingEmail}
              className="border-t border-[var(--border-hairline)] pt-4 space-y-3"
            >
              <p className="text-xs text-[var(--text-secondary)]">
                Pending verification for <span className="font-mono text-[var(--text-primary)]">{identity.pendingEmail}</span>
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={emailOtp}
                  onChange={(e) => setEmailOtp(e.target.value)}
                  placeholder="6-digit OTP"
                  className="min-w-0 flex-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 font-mono text-xs"
                />
                <button
                  type="submit"
                  disabled={busy === 'otp'}
                  className="rounded-md bg-[var(--action-primary-bg)] px-3 py-2 text-xs font-medium text-[var(--action-primary-fg)] cursor-pointer"
                >
                  Verify OTP
                </button>
              </div>
            </form>
          )}

          {identity.pendingEmail && identity.pendingEmailVerified && (
            <div className="border-t border-[var(--border-hairline)] pt-3 text-xs text-[var(--status-info-fg)]">
              Verified email <span className="font-mono">{identity.pendingEmail}</span> is queued for Primary Owner approval.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
