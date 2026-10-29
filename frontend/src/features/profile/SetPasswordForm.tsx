'use client';

import React, { useState, useTransition } from 'react';
import { setAccountPasswordAction } from '@/app/login/actions';

interface SetPasswordFormProps {
  userEmail?: string;
  providers?: string[];
  passwordStatus?: 'configured' | 'not_configured' | 'unknown';
  onPasswordSet?: () => void;
}

export function SetPasswordForm({
  userEmail,
  providers = [],
  passwordStatus = 'unknown',
  onPasswordSet,
}: SetPasswordFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isGoogleUser = providers.includes('google');
  const isPasswordConfigured = passwordStatus === 'configured';

  const isPasswordLongEnough = password.length >= 8;
  const isPasswordMatch = password.length > 0 && password === confirmPassword;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!isPasswordLongEnough) {
      setErrorMessage('New password must be at least 8 characters in length.');
      return;
    }

    if (!isPasswordMatch) {
      setErrorMessage('Passwords do not match. Please verify both fields.');
      return;
    }

    const formData = new FormData();
    formData.set('password', password);
    formData.set('confirmPassword', confirmPassword);

    startTransition(async () => {
      const res = await setAccountPasswordAction(formData);
      if (res.error) {
        setErrorMessage(res.error);
      } else {
        setSuccessMessage(
          res.message ||
            'Password successfully set! You can now sign in using your email and password, or continue using Google sign-in.'
        );
        setPassword('');
        setConfirmPassword('');
        setIsOpen(false);
        if (onPasswordSet) {
          onPasswordSet();
        }
      }
    });
  };

  const handleCancel = () => {
    setIsOpen(false);
    setPassword('');
    setConfirmPassword('');
    setErrorMessage(null);
  };

  return (
    <div className="space-y-3">
      {/* Top Header / Collapsed Summary */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="text-base mt-0.5" aria-hidden="true">
            🔐
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-semibold text-[var(--text-primary)]">
                {isPasswordConfigured ? 'Account Password' : passwordStatus === 'unknown' ? 'Password Settings' : 'Set Account Password'}
              </h4>
              {isGoogleUser && (
                <span className="text-[10px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-1.5 py-0.2 rounded-xs font-medium">
                  Google Account
                </span>
              )}
              {isPasswordConfigured && (
                <span className="text-[10px] text-[var(--income-fg)] bg-[var(--income-bg)] border border-[var(--income-border)] px-1.5 py-0.2 rounded-xs font-medium">
                  Active
                </span>
              )}
            </div>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5 max-w-md">
              {isGoogleUser && passwordStatus === 'not_configured'
                ? 'Add email and password sign-in to your account so you can log in directly without Google.'
                : 'Set or update your account password for email and username sign-in.'}
            </p>
          </div>
        </div>

        {!isOpen && (
          <button
            type="button"
            onClick={() => {
              setIsOpen(true);
              setSuccessMessage(null);
              setErrorMessage(null);
            }}
            className="px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:text-[var(--text-primary)] bg-[var(--bg-surface-subtle)] hover:bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-md transition-colors cursor-pointer shrink-0"
          >
            {isPasswordConfigured ? 'Change Password' : passwordStatus === 'unknown' ? 'Password Settings' : 'Set Password'}
          </button>
        )}
      </div>

      {/* Success Notification */}
      {successMessage && !isOpen && (
        <div
          role="status"
          className="p-3 rounded-md bg-[var(--income-bg)] border border-[var(--income-border)] text-[var(--income-fg)] text-xs flex items-start justify-between gap-2"
        >
          <div className="space-y-1">
            <p className="font-semibold">✓ Password updated</p>
            <p className="text-[11px] leading-relaxed opacity-90">
              {successMessage}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-[var(--income-fg)] opacity-70 hover:opacity-100 p-0.5 cursor-pointer font-bold"
            aria-label="Dismiss message"
          >
            ✕
          </button>
        </div>
      )}

      {/* Expanded Set Password Form */}
      {isOpen && (
        <form
          onSubmit={handleSubmit}
          className="p-4 rounded-lg bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] space-y-4 pt-3 mt-1"
        >
          <div className="space-y-1">
            <h5 className="text-xs font-semibold text-[var(--text-primary)]">
              {isPasswordConfigured ? 'Update Account Password' : 'Create Account Password'}
            </h5>
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
              {userEmail && (
                <span className="block font-mono text-[10px] text-[var(--text-muted)] mb-1">
                  Target Account: {userEmail}
                </span>
              )}
              Enter a password of at least 8 characters. After saving, you can sign in using your email address (or username) and this password. Google sign-in will continue to work normally.
            </p>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div
              role="alert"
              className="p-2.5 rounded-md bg-[var(--status-error-bg)] border border-[var(--expense-border)] text-[var(--status-error-fg)] text-[11px] flex items-start justify-between gap-2"
            >
              <p className="leading-snug">{errorMessage}</p>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="opacity-70 hover:opacity-100 font-bold p-0.5 cursor-pointer"
                aria-label="Dismiss error"
              >
                ✕
              </button>
            </div>
          )}

          <div className="space-y-3">
            {/* New Password Field */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="set-password-input"
                  className="text-[11px] font-medium text-[var(--text-primary)]"
                >
                  New Password
                </label>
                {password.length > 0 && (
                  <span
                    className={`text-[10px] font-mono ${
                      isPasswordLongEnough
                        ? 'text-[var(--income-fg)]'
                        : 'text-[var(--status-error-fg)]'
                    }`}
                  >
                    {isPasswordLongEnough
                      ? '✓ At least 8 characters'
                      : `${password.length}/8 characters`}
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  id="set-password-input"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter at least 8 characters"
                  autoComplete="new-password"
                  disabled={isPending}
                  required
                  className="w-full h-9 px-3 pr-10 text-xs bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-md placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--text-primary)] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 cursor-pointer"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {/* Confirm Password Field */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="set-password-confirm-input"
                  className="text-[11px] font-medium text-[var(--text-primary)]"
                >
                  Confirm New Password
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
                  id="set-password-confirm-input"
                  name="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  autoComplete="new-password"
                  disabled={isPending}
                  required
                  className="w-full h-9 px-3 pr-10 text-xs bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-md placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--text-primary)] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 cursor-pointer"
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={handleCancel}
              disabled={isPending}
              className="px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || !isPasswordLongEnough || !isPasswordMatch}
              className="px-4 py-1.5 text-xs font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] hover:bg-[var(--action-primary-hover)] rounded-md transition-colors shadow-2xs disabled:opacity-50 cursor-pointer"
            >
              {isPending
                ? 'Setting Password…'
                : isPasswordConfigured
                  ? 'Update Password'
                  : 'Save Password'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
