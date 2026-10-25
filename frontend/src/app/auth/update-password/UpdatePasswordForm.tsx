'use client';

import React, { useState, useTransition } from 'react';
import { updatePasswordAction, type AuthActionResult } from '@/app/login/actions';

interface UpdatePasswordFormProps {
  userEmail: string;
}

export function UpdatePasswordForm({ userEmail }: UpdatePasswordFormProps) {
  const [isPending, startTransition] = useTransition();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const isPasswordValidLength = password.length >= 8;
  const isPasswordMatch = password.length > 0 && password === confirmPassword;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (password.length < 8) {
      setErrorMessage('New password must be at least 8 characters in length.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please verify both fields.');
      return;
    }

    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const res: AuthActionResult = await updatePasswordAction(formData);
      if (res.error) {
        setErrorMessage(res.error);
      } else {
        setSuccessMessage(
          res.message || 'Your password has been successfully updated.'
        );
        setTimeout(() => {
          window.location.href = res.redirectUrl || '/';
        }, 1500);
      }
    });
  };

  return (
    <div className="space-y-6">
      {userEmail && (
        <div className="text-[11px] font-mono text-[var(--text-muted)] bg-[var(--bg-surface-subtle)] px-2.5 py-1.5 rounded-md border border-[var(--border-hairline)] truncate">
          Active account: <span className="text-[var(--text-primary)] font-medium">{userEmail}</span>
        </div>
      )}
      {errorMessage && (
        <div
          role="alert"
          className="p-3 rounded-md bg-[var(--status-error-bg)] border border-[var(--expense-border)] text-[var(--status-error-fg)] text-[12px] flex items-start justify-between gap-2"
        >
          <div className="space-y-0.5">
            <span className="font-semibold block">Password Update Error</span>
            <p className="opacity-90 leading-snug">{errorMessage}</p>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-[var(--status-error-fg)] opacity-70 hover:opacity-100 font-bold p-0.5"
            aria-label="Dismiss alert"
          >
            ✕
          </button>
        </div>
      )}

      {successMessage ? (
        <div
          role="status"
          className="p-4 rounded-md bg-[var(--income-bg)] border border-[var(--income-border)] text-[var(--income-fg)] text-[13px] space-y-2 text-center"
        >
          <p className="font-semibold">{successMessage}</p>
          <p className="text-[12px] opacity-90">Redirecting to your ledger...</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="new-password"
                className="block text-[12px] font-medium text-[var(--text-primary)]"
              >
                New password
              </label>
              {password.length > 0 && (
                <span
                  className={`text-[10px] font-mono ${
                    isPasswordValidLength
                      ? 'text-[var(--income-fg)]'
                      : 'text-[var(--status-error-fg)]'
                  }`}
                >
                  {isPasswordValidLength ? '✓ 8+ chars' : 'min 8 characters'}
                </span>
              )}
            </div>
            <div className="relative">
              <input
                id="new-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="new-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 pr-10 text-[13px] rounded-md bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:border-transparent transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors text-xs cursor-pointer"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="confirm-new-password"
                className="block text-[12px] font-medium text-[var(--text-primary)]"
              >
                Confirm new password
              </label>
              {confirmPassword.length > 0 && (
                <span
                  className={`text-[10px] font-mono ${
                    isPasswordMatch
                      ? 'text-[var(--income-fg)]'
                      : 'text-[var(--status-error-fg)]'
                  }`}
                >
                  {isPasswordMatch ? '✓ Matches' : 'does not match'}
                </span>
              )}
            </div>
            <div className="relative">
              <input
                id="confirm-new-password"
                name="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                required
                autoComplete="new-password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 pr-10 text-[13px] rounded-md bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:border-transparent transition-all"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors text-xs cursor-pointer"
                aria-label={
                  showConfirmPassword
                    ? 'Hide confirm password'
                    : 'Show confirm password'
                }
              >
                {showConfirmPassword ? (
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isPending || !isPasswordValidLength || !isPasswordMatch}
            className="w-full py-2.5 px-4 rounded-md bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] text-[13px] font-medium hover:bg-[var(--action-primary-hover)] transition-colors flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? (
              <span className="flex items-center gap-2">
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-[var(--action-primary-fg)]"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Updating Password...
              </span>
            ) : (
              'Set New Password'
            )}
          </button>
        </form>
      )}
    </div>
  );
}
