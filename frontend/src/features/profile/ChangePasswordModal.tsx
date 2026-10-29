'use client';

import React, { useState, useTransition, useEffect, useCallback } from 'react';
import { changePasswordAction } from '@/app/login/actions';
import type { PasswordStatus } from '@/lib/auth/password-status';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string;
  hasPassword?: boolean;
  passwordStatus?: PasswordStatus;
  onSuccess?: (message: string) => void;
}

export function ChangePasswordModal({
  isOpen,
  onClose,
  userEmail,
  hasPassword = true,
  passwordStatus,
  onSuccess,
}: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [settingWithoutExistingPassword, setSettingWithoutExistingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleClose = useCallback(() => {
    setCurrentPassword('');
    setSettingWithoutExistingPassword(false);
    setNewPassword('');
    setConfirmPassword('');
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setErrorMessage(null);
    setSuccessMessage(null);
    onClose();
  }, [onClose]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isPending) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isPending, handleClose]);

  if (!isOpen) return null;

  const resolvedPasswordStatus = passwordStatus ?? (hasPassword ? 'configured' : 'not_configured');
  const requiresCurrentPassword = resolvedPasswordStatus === 'configured' ||
    (resolvedPasswordStatus === 'unknown' && !settingWithoutExistingPassword);

  const isPasswordLongEnough = newPassword.trim().length >= 8;
  const isPasswordMatch =
    newPassword.length > 0 &&
    confirmPassword.length > 0 &&
    newPassword === confirmPassword;
  const hasLeadingOrTrailingSpace =
    newPassword.startsWith(' ') ||
    newPassword.endsWith(' ') ||
    confirmPassword.startsWith(' ') ||
    confirmPassword.endsWith(' ');

  const canSubmit =
    !isPending &&
    isPasswordLongEnough &&
    isPasswordMatch &&
    !hasLeadingOrTrailingSpace &&
    (!requiresCurrentPassword || currentPassword.length > 0);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) return;

    setErrorMessage(null);
    setSuccessMessage(null);

    if (hasLeadingOrTrailingSpace) {
      setErrorMessage('Password cannot begin or end with a space.');
      return;
    }

    if (!isPasswordLongEnough) {
      setErrorMessage('New password must be at least 8 characters in length.');
      return;
    }

    if (!isPasswordMatch) {
      setErrorMessage('Passwords do not match. Please verify both fields.');
      return;
    }

    if (requiresCurrentPassword && !currentPassword) {
      setErrorMessage('Please enter your current password.');
      return;
    }

    const formData = new FormData();
    if (requiresCurrentPassword) {
      formData.set('currentPassword', currentPassword);
    }
    formData.set('newPassword', newPassword.trim());
    formData.set('confirmPassword', confirmPassword.trim());

    startTransition(async () => {
      const res = await changePasswordAction(formData);
      if (res.error) {
        setErrorMessage(res.error);
      } else {
        const msg =
          res.message ||
          (hasPassword
            ? 'Your password has been successfully updated.'
            : 'Password successfully set for your account.');
        setSuccessMessage(msg);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => {
          handleClose();
          onSuccess?.(msg);
        }, 1200);
      }
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="password-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={() => {
        if (!isPending) handleClose();
      }}
    >
      <div
        className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl shadow-xl overflow-hidden p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className="flex items-center justify-center w-8 h-8 rounded-full bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] text-base select-none shrink-0"
              aria-hidden="true"
            >
              🔐
            </span>
            <div>
              <h2
                id="password-modal-title"
                className="text-sm sm:text-base font-bold text-[var(--text-primary)]"
              >
                {resolvedPasswordStatus === 'unknown' ? 'Password Settings' : hasPassword ? 'Change Password' : 'Set Account Password'}
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                {resolvedPasswordStatus === 'unknown'
                  ? 'Verify an existing password or set one if this account does not have one'
                  : hasPassword
                  ? 'Update your credentials for email and username sign-in'
                  : 'Add password sign-in to your Google-authenticated account'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isPending}
            aria-label="Close dialog"
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-1 rounded-md cursor-pointer disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {/* Informative Callout for Google OAuth accounts without password */}
        {resolvedPasswordStatus === 'not_configured' && (
          <div className="p-3 text-xs rounded-lg bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] text-[var(--text-secondary)] space-y-1">
            <div className="font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
              <span>Google Account Linked</span>
            </div>
            <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
              Your account currently authenticates using Google OAuth. Setting a password allows you to sign in using your email address or username alongside Google sign-in.
            </p>
          </div>
        )}

        {/* Error Alert */}
        {errorMessage && (
          <div
            role="alert"
            className="p-3 rounded-lg bg-[var(--status-error-bg)] border border-[var(--expense-border)] text-[var(--status-error-fg)] text-xs flex items-start justify-between gap-2 animate-in fade-in"
          >
            <div className="flex items-start gap-2">
              <span className="shrink-0 text-sm">⚠</span>
              <p className="leading-snug">{errorMessage}</p>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="opacity-70 hover:opacity-100 font-bold p-0.5 cursor-pointer shrink-0"
              aria-label="Dismiss error"
            >
              ✕
            </button>
          </div>
        )}

        {/* Success Alert */}
        {successMessage && (
          <div
            role="status"
            className="p-3 rounded-lg bg-[var(--income-bg)] border border-[var(--income-border)] text-[var(--income-fg)] text-xs flex items-center gap-2 animate-in fade-in"
          >
            <span className="shrink-0 text-sm">✓</span>
            <p className="leading-snug font-medium">{successMessage}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Target account reminder */}
          {userEmail && (
            <div className="text-[11px] font-mono text-[var(--text-muted)] bg-[var(--bg-surface-subtle)] px-2.5 py-1.5 rounded-md border border-[var(--border-hairline)] truncate">
              Account: {userEmail}
            </div>
          )}

          {resolvedPasswordStatus === 'unknown' && (
            <label className="flex items-start gap-2 text-[11px] text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={settingWithoutExistingPassword}
                onChange={(event) => setSettingWithoutExistingPassword(event.target.checked)}
                className="mt-0.5"
              />
              <span>I do not have an existing Arth password; set one for this account.</span>
            </label>
          )}

          {/* Require verification for configured accounts and let unknown accounts verify if they have a password. */}
          {requiresCurrentPassword && (
            <div className="space-y-1.5">
              <label
                htmlFor="current-password-input"
                className="text-xs font-medium text-[var(--text-primary)] block"
              >
                Current Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="current-password-input"
                  name="currentPassword"
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter your current password"
                  autoComplete="current-password"
                  disabled={isPending}
                  required
                  className="w-full h-10 px-3 pr-10 text-xs bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-lg placeholder:text-[var(--text-muted)] focus:outline-hidden focus:border-[var(--text-primary)] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 cursor-pointer transition-colors"
                  aria-label={showCurrentPassword ? 'Hide current password' : 'Show current password'}
                  tabIndex={-1}
                >
                  {showCurrentPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
          )}

          {/* New Password Field */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="new-password-input"
                className="text-xs font-medium text-[var(--text-primary)] block"
              >
                New Password <span className="text-red-500">*</span>
              </label>
              {newPassword.length > 0 && (
                <span
                  className={`text-[10px] font-mono ${
                    isPasswordLongEnough
                      ? 'text-[var(--income-fg)]'
                      : 'text-[var(--status-error-fg)]'
                  }`}
                >
                  {isPasswordLongEnough
                    ? '✓ ≥ 8 characters'
                    : `${newPassword.length}/8 characters`}
                </span>
              )}
            </div>
            <div className="relative">
              <input
                id="new-password-input"
                name="newPassword"
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter at least 8 characters"
                autoComplete="new-password"
                disabled={isPending}
                required
                className="w-full h-10 px-3 pr-10 text-xs bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-lg placeholder:text-[var(--text-muted)] focus:outline-hidden focus:border-[var(--text-primary)] transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 cursor-pointer transition-colors"
                aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                tabIndex={-1}
              >
                {showNewPassword ? '🙈' : '👁️'}
              </button>
            </div>
            {hasLeadingOrTrailingSpace && (
              <span className="text-[10px] text-[var(--status-error-fg)] block">
                ⚠ Password contains leading or trailing spaces.
              </span>
            )}
          </div>

          {/* Confirm Password Field */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="confirm-password-input"
                className="text-xs font-medium text-[var(--text-primary)] block"
              >
                Confirm New Password <span className="text-red-500">*</span>
              </label>
              {confirmPassword.length > 0 && (
                <span
                  className={`text-[10px] font-mono ${
                    isPasswordMatch
                      ? 'text-[var(--income-fg)]'
                      : 'text-[var(--status-error-fg)]'
                  }`}
                >
                  {isPasswordMatch ? '✓ Passwords match' : 'Passwords do not match'}
                </span>
              )}
            </div>
            <div className="relative">
              <input
                id="confirm-password-input"
                name="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                autoComplete="new-password"
                disabled={isPending}
                required
                className="w-full h-10 px-3 pr-10 text-xs bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-lg placeholder:text-[var(--text-muted)] focus:outline-hidden focus:border-[var(--text-primary)] transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 cursor-pointer transition-colors"
                aria-label={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'}
                tabIndex={-1}
              >
                {showConfirmPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex items-center justify-center min-w-[120px] px-4 py-2 text-xs font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] hover:bg-[var(--action-primary-hover)] rounded-md transition-colors shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {isPending ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
                  <span>{hasPassword ? 'Updating…' : 'Saving…'}</span>
                </span>
              ) : hasPassword ? (
                'Update Password'
              ) : (
                'Set Password'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
