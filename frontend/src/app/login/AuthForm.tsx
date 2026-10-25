'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  signInWithEmailAction,
  signUpWithEmailAction,
  requestPasswordResetAction,
  signInWithGoogleAction,
  type AuthActionResult,
} from './actions';

type AuthMode = 'signin' | 'signup' | 'forgot';

interface AuthFormProps {
  initialError?: string;
}

export function AuthForm({ initialError }: AuthFormProps) {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('signin');
  const [isPending, startTransition] = useTransition();
  const [isGooglePending, startGoogleTransition] = useTransition();

  // Field states for live validation
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');

  // Password visibility toggles
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Status feedback
  const [errorMessage, setErrorMessage] = useState<string | null>(
    initialError ? decodeURIComponent(initialError) : null
  );
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Switch modes cleanly
  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  // Sign In handler
  const handleSignIn = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const res: AuthActionResult = await signInWithEmailAction(formData);
      if (res.error) {
        setErrorMessage(res.error);
      } else if (res.redirectUrl) {
        window.location.href = res.redirectUrl;
      } else {
        router.refresh();
      }
    });
  };

  // Sign Up handler
  const handleSignUp = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters in length.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please verify both fields.');
      return;
    }

    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const res: AuthActionResult = await signUpWithEmailAction(formData);
      if (res.error) {
        setErrorMessage(res.error);
      } else if (res.needsConfirmation) {
        setSuccessMessage(
          res.message ||
            'Registration successful! Please check your email to confirm your account.'
        );
      } else if (res.redirectUrl) {
        window.location.href = res.redirectUrl;
      } else {
        router.refresh();
      }
    });
  };

  // Password Reset handler
  const handleResetPassword = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const res: AuthActionResult = await requestPasswordResetAction(formData);
      if (res.error) {
        setErrorMessage(res.error);
      } else {
        setSuccessMessage(
          res.message ||
            'If an account exists with this email address, a password recovery link has been dispatched to your inbox.'
        );
      }
    });
  };

  const handleGoogleSubmit = () => {
    setErrorMessage(null);
    startGoogleTransition(async () => {
      await signInWithGoogleAction();
    });
  };

  // Live validation helpers
  const isUsernameValid = /^[a-zA-Z0-9_-]{3,30}$/.test(username);
  const isPasswordValidLength = password.length >= 8;
  const isPasswordMatch = password.length > 0 && password === confirmPassword;

  return (
    <div className="w-full space-y-6">
      {/* Top Segmented Mode Switcher (Sign In vs Create Account) */}
      {mode !== 'forgot' && (
        <div
          role="tablist"
          aria-label="Authentication Options"
          className="grid grid-cols-2 p-1 rounded-md bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] text-xs font-medium"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signin'}
            onClick={() => switchMode('signin')}
            className={`py-1.5 px-3 rounded-[3px] text-center transition-all cursor-pointer ${
              mode === 'signin'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] font-semibold shadow-2xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signup'}
            onClick={() => switchMode('signup')}
            className={`py-1.5 px-3 rounded-[3px] text-center transition-all cursor-pointer ${
              mode === 'signup'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] font-semibold shadow-2xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Create Account
          </button>
        </div>
      )}

      {/* Error Banner */}
      {errorMessage && (
        <div
          role="alert"
          className="p-3 rounded-md bg-[var(--status-error-bg)] border border-[var(--expense-border)] text-[var(--status-error-fg)] text-[12px] flex items-start justify-between gap-2"
        >
          <div className="space-y-0.5">
            <span className="font-semibold block">Authentication Notice</span>
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

      {/* Success Banner */}
      {successMessage && (
        <div
          role="status"
          className="p-3 rounded-md bg-[var(--income-bg)] border border-[var(--income-border)] text-[var(--income-fg)] text-[12px] flex items-start justify-between gap-2"
        >
          <div className="space-y-0.5">
            <span className="font-semibold block">Notice Dispatched</span>
            <p className="leading-snug">{successMessage}</p>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-[var(--income-fg)] opacity-70 hover:opacity-100 font-bold p-0.5"
            aria-label="Dismiss notification"
          >
            ✕
          </button>
        </div>
      )}

      {/* 1. SIGN IN MODE */}
      {mode === 'signin' && (
        <form onSubmit={handleSignIn} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="signin-email"
              className="block text-[12px] font-medium text-[var(--text-primary)]"
            >
              Email address
            </label>
            <input
              id="signin-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@domain.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 text-[13px] rounded-md bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:border-transparent transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="signin-password"
                className="block text-[12px] font-medium text-[var(--text-primary)]"
              >
                Password
              </label>
              <button
                type="button"
                onClick={() => switchMode('forgot')}
                className="text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors underline cursor-pointer"
              >
                Forgot password?
              </button>
            </div>
            <div className="relative">
              <input
                id="signin-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
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

          <button
            type="submit"
            disabled={isPending || isGooglePending}
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
                Authenticating...
              </span>
            ) : (
              'Sign In'
            )}
          </button>
        </form>
      )}

      {/* 2. SIGN UP MODE */}
      {mode === 'signup' && (
        <form onSubmit={handleSignUp} className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="signup-username"
                className="block text-[12px] font-medium text-[var(--text-primary)]"
              >
                Username
              </label>
              {username.length > 0 && (
                <span
                  className={`text-[10px] font-mono ${
                    isUsernameValid
                      ? 'text-[var(--income-fg)]'
                      : 'text-[var(--status-error-fg)]'
                  }`}
                >
                  {isUsernameValid ? '✓ Valid' : '3-30 chars, alphanumeric, _ -'}
                </span>
              )}
            </div>
            <input
              id="signup-username"
              name="username"
              type="text"
              required
              autoComplete="username"
              placeholder="e.g. rahul_sharma"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 text-[13px] rounded-md bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:border-transparent transition-all"
            />
            <p className="text-[11px] text-[var(--text-muted)]">
              This display name will be associated with your financial ledger.
            </p>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="signup-email"
              className="block text-[12px] font-medium text-[var(--text-primary)]"
            >
              Email address
            </label>
            <input
              id="signup-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@domain.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 text-[13px] rounded-md bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:border-transparent transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="signup-password"
                className="block text-[12px] font-medium text-[var(--text-primary)]"
              >
                Password
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
                id="signup-password"
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
                htmlFor="signup-confirm-password"
                className="block text-[12px] font-medium text-[var(--text-primary)]"
              >
                Confirm password
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
                id="signup-confirm-password"
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
            disabled={
              isPending ||
              isGooglePending ||
              !isUsernameValid ||
              !isPasswordValidLength ||
              !isPasswordMatch
            }
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
                Creating Account...
              </span>
            ) : (
              'Create Account'
            )}
          </button>
        </form>
      )}

      {/* 3. FORGOT PASSWORD MODE */}
      {mode === 'forgot' && (
        <form onSubmit={handleResetPassword} className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
              Reset Password
            </h2>
            <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
              Enter the email address associated with your account. We will send
              you a secure recovery link to reset your password.
            </p>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="reset-email"
              className="block text-[12px] font-medium text-[var(--text-primary)]"
            >
              Email address
            </label>
            <input
              id="reset-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@domain.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 text-[13px] rounded-md bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:border-transparent transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={isPending}
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
                Sending Recovery Link...
              </span>
            ) : (
              'Send Reset Link'
            )}
          </button>

          <div className="pt-2 text-center">
            <button
              type="button"
              onClick={() => switchMode('signin')}
              className="text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors inline-flex items-center gap-1 cursor-pointer"
            >
              <span>&larr;</span> Back to Sign In
            </button>
          </div>
        </form>
      )}

      {/* OR Divider and Google OAuth (visible on signin & signup modes) */}
      {mode !== 'forgot' && (
        <div className="space-y-4 pt-1">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[var(--border-hairline)]" />
            </div>
            <div className="relative flex justify-center text-[10px] uppercase font-mono tracking-widest text-[var(--text-muted)]">
              <span className="bg-[var(--bg-surface)] px-2">OR</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGoogleSubmit}
            disabled={isPending || isGooglePending}
            className="w-full py-2.5 px-4 rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-subtle)] text-[var(--text-primary)] text-[13px] font-medium transition-all flex items-center justify-center gap-2.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGooglePending ? (
              <span className="flex items-center gap-2">
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-[var(--text-primary)]"
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
                Connecting Google...
              </span>
            ) : (
              <>
                <svg
                  className="w-4 h-4 shrink-0"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    fill="#EA4335"
                  />
                </svg>
                <span>Continue with Google</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
