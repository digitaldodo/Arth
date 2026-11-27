'use client';

import React, { useState, useEffect, useTransition, useRef, useCallback } from 'react';
import { getCachedPwaUser, clearCachedPwaUserContext } from '@/lib/offline-db';
import { useRouter } from 'next/navigation';
import { ArthLogo } from '@/components/brand/ArthLogo';
import { sanitizeUserFacingError } from '@/lib/error-utils';
import {
  signInWithEmailAction,
  signUpWithEmailAction,
  resendConfirmationEmailAction,
  requestPasswordResetAction,
  signInWithGoogleAction,
  type AuthActionResult,
} from './actions';

type AuthMode = 'signin' | 'signup' | 'forgot' | 'resend_confirm';

interface AuthHealthSnapshot {
  ok: boolean;
  category:
    | 'healthy'
    | 'supabase_unconfigured'
    | 'supabase_unreachable'
    | 'backend_unreachable'
    | 'degraded'
    | 'unavailable';
  message?: string;
  checks?: {
    supabaseConfigured?: boolean;
    supabaseReachable?: boolean;
    usernameLookupReady?: boolean;
    googleOAuthReady?: boolean;
    backendReachable?: boolean;
  };
}

interface AuthFormProps {
  initialError?: string;
  initialMessage?: string;
  initialMode?: AuthMode;
}

export function AuthForm({
  initialError,
  initialMessage,
  initialMode = 'signin',
}: AuthFormProps) {
  const router = useRouter();
  const alertRef = useRef<HTMLDivElement | null>(null);
  const identifierInputRef = useRef<HTMLInputElement | null>(null);
  const [mode, setMode] = useState<AuthMode>(() => {
    if (typeof window !== 'undefined') {
      const searchMode = new URLSearchParams(window.location.search).get('mode');
      if (searchMode === 'signup') return 'signup';
      if (searchMode === 'forgot') return 'forgot';
    }
    return initialMode;
  });
  const [isPending, startTransition] = useTransition();
  const [isGooglePending, startGoogleTransition] = useTransition();
  const isSubmitting = isPending || isGooglePending;

  const [isOfflineBrowser, setIsOfflineBrowser] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  const [authHealth, setAuthHealth] = useState<AuthHealthSnapshot | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);

  // Field states
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [unconfirmedEmail, setUnconfirmedEmail] = useState('');

  // Password visibility
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Status feedback
  const [errorMessage, setErrorMessage] = useState<string | null>(
    initialError
      ? initialError === 'expired_session'
        ? 'Your authentication session expired. Please sign in again.'
        : sanitizeUserFacingError(decodeURIComponent(initialError))
      : null
  );
  const [successMessage, setSuccessMessage] = useState<string | null>(
    initialMessage ? decodeURIComponent(initialMessage) : null
  );

  const fetchAuthHealth = useCallback(async (): Promise<AuthHealthSnapshot | null> => {
    try {
      const res = await fetch('/api/auth/health', { cache: 'no-store' });
      const data = (await res.json().catch(() => null)) as AuthHealthSnapshot | null;
      if (data && typeof data.ok === 'boolean') {
        return data;
      }
    } catch {
      // fallback below
    }
    return {
      ok: false,
      category: 'unavailable',
      message: 'Unable to check authentication service reachability right now.',
    };
  }, []);

  const checkAuthHealth = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setIsOfflineBrowser(true);
      return;
    }
    setIsCheckingHealth(true);
    const snapshot = await fetchAuthHealth();
    setAuthHealth(snapshot);
    setIsCheckingHealth(false);
  }, [fetchAuthHealth]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    const handleOnline = () => {
      setIsOfflineBrowser(false);
      void fetchAuthHealth().then((snapshot) => {
        if (!cancelled) setAuthHealth(snapshot);
      });
    };
    const handleOffline = () => {
      setIsOfflineBrowser(true);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    if (typeof navigator === 'undefined' || navigator.onLine) {
      void fetchAuthHealth().then((snapshot) => {
        if (!cancelled) setAuthHealth(snapshot);
      });
    }
    return () => {
      cancelled = true;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [fetchAuthHealth]);

  useEffect(() => {
    if (errorMessage && alertRef.current) {
      alertRef.current.focus();
    }
  }, [errorMessage]);

  useEffect(() => {
    // If navigating to login with an error or explicit logout, clear stale cached user to prevent loops
    const hasError =
      Boolean(initialError) ||
      (typeof window !== 'undefined' && window.location.search.includes('error='));
    const isExplicitLogout =
      typeof window !== 'undefined' && window.location.search.includes('logout=');

    if (hasError || isExplicitLogout) {
      void clearCachedPwaUserContext();
      return;
    }

    void (async () => {
      try {
        const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
        const cached = await getCachedPwaUser();
        // Only redirect to root if offline PWA session is cached
        if (cached && isOffline) {
          window.location.replace('/');
        }
      } catch {
        // stay on login form
      }
    })();
  }, [initialError]);

  const switchMode = (newMode: AuthMode) => {
    if (isSubmitting) return;
    setMode(newMode);
    setErrorMessage(null);
    setSuccessMessage(null);
    setPassword('');
    setConfirmPassword('');

    if (newMode === 'signin' && (email || username)) {
      setIdentifier(email || username);
    } else if (newMode === 'signup' && identifier) {
      if (identifier.includes('@')) {
        setEmail(identifier);
      } else {
        setUsername(identifier);
      }
    } else if (newMode === 'forgot' && identifier) {
      if (identifier.includes('@')) {
        setEmail(identifier);
      }
    }
  };

  const handleSignIn = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;
    setErrorMessage(null);
    setSuccessMessage(null);

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setIsOfflineBrowser(true);
      setErrorMessage('You appear to be offline. Reconnect to the internet to sign in.');
      return;
    }

    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const res: AuthActionResult = await signInWithEmailAction(formData);
      if (res.error) {
        setErrorMessage(res.error);
        if (res.error.includes('not been confirmed')) {
          setUnconfirmedEmail(identifier.includes('@') ? identifier : '');
        }
      } else if (res.redirectUrl) {
        window.location.replace(res.redirectUrl || '/');
      } else {
        router.refresh();
      }
    });
  };

  const handleSignUp = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;
    setErrorMessage(null);
    setSuccessMessage(null);

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setIsOfflineBrowser(true);
      setErrorMessage('You appear to be offline. Reconnect to the internet to create an account.');
      return;
    }

    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters in length.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please verify both fields.');
      return;
    }

    const formData = new FormData(e.currentTarget);
    const submittedEmail = (formData.get('email') as string)?.trim().toLowerCase();

    startTransition(async () => {
      const clientOrigin =
        typeof window !== 'undefined' && window.location.origin
          ? window.location.origin
          : undefined;
      const res: AuthActionResult = await signUpWithEmailAction(formData, clientOrigin);
      if (res.error) {
        setErrorMessage(res.error);
      } else if (res.needsConfirmation) {
        setUnconfirmedEmail(submittedEmail);
        setMode('resend_confirm');
        setSuccessMessage(
          res.message ||
            'Account created! A confirmation link has been sent to your email address. Please check your email to confirm your account.'
        );
      } else if (res.redirectUrl) {
        window.location.replace(res.redirectUrl || '/');
      } else {
        router.refresh();
      }
    });
  };

  const handleResendConfirmation = (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const targetEmail = unconfirmedEmail || email;
    if (!targetEmail) {
      setErrorMessage('Please enter your email address to receive a confirmation link.');
      return;
    }

    const formData = new FormData();
    formData.set('email', targetEmail);

    startTransition(async () => {
      const clientOrigin =
        typeof window !== 'undefined' && window.location.origin
          ? window.location.origin
          : undefined;
      const res: AuthActionResult = await resendConfirmationEmailAction(formData, clientOrigin);
      if (res.error) {
        setErrorMessage(res.error);
      } else {
        setSuccessMessage(
          res.message ||
            'If an unconfirmed account exists with this email address, a new confirmation link has been sent to your inbox.'
        );
      }
    });
  };

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
    if (isSubmitting) return;
    setErrorMessage(null);
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setIsOfflineBrowser(true);
      setErrorMessage('You appear to be offline. Reconnect to the internet before continuing with Google.');
      return;
    }
    startGoogleTransition(async () => {
      const clientOrigin =
        typeof window !== 'undefined' && window.location.origin
          ? window.location.origin
          : undefined;
      const res = await signInWithGoogleAction(clientOrigin);
      if (res.error) {
        setErrorMessage(res.error);
      } else if (res.url) {
        window.location.href = res.url;
      }
    });
  };

  // Live validation helpers
  const isUsernameProvided = username.trim().length > 0;
  const isUsernameValidFormat =
    !isUsernameProvided ||
    (/^[a-z0-9_]{3,20}$/.test(username.trim().toLowerCase()) &&
      ![
        'admin',
        'administrator',
        'support',
        'system',
        'arth',
        'root',
        'superuser',
        'help',
        'api',
        'auth',
        'null',
        'undefined',
        'moderator',
        'staff',
      ].includes(username.trim().toLowerCase()));
  const isUsernameValid = isUsernameValidFormat;
  const isPasswordValidLength = password.length >= 8;
  const isPasswordMatch = password.length > 0 && password === confirmPassword;

  const isConnectivityError = Boolean(
    errorMessage &&
      /(connect|offline|unavailable|configured|network|reach|timeout)/i.test(errorMessage)
  );

  return (
    <div className="w-full space-y-5" aria-busy={isSubmitting}>
      {/* 1. SpendSense Wordmark & Brand Identifier */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ArthLogo
              variant="full"
              className="h-6 sm:h-7 w-auto text-[var(--text-primary)]"
            />
            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-[2px] bg-[var(--brand-evergreen-soft)] text-[var(--brand-evergreen-fg)] border border-[var(--brand-evergreen-border)]">
              Ledger
            </span>
          </div>
          <span className="hidden sm:inline-block h-[2px] w-10 rounded-full bg-gradient-to-r from-[var(--brand-evergreen)] via-[var(--brand-evergreen)] to-[var(--brand-copper)] opacity-80" aria-hidden="true" />
        </div>

        {/* 2. Main Title */}
        <h1 className="text-[19px] font-semibold tracking-[-0.015em] text-[var(--text-primary)]">
          {mode === 'signin' && 'Sign in to SpendSense'}
          {mode === 'signup' && 'Create your ledger account'}
          {mode === 'forgot' && 'Reset password'}
          {mode === 'resend_confirm' && 'Confirm your account'}
        </h1>

        {/* 3. Small, Muted Description */}
        <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
          {mode === 'signin' &&
            'Access your personal financial ledger, cash and online balances, and synced entries.'}
          {mode === 'signup' &&
            'Set up your SpendSense personal ledger credentials.'}
          {mode === 'forgot' &&
            'Enter your email address to receive a secure recovery link.'}
          {mode === 'resend_confirm' &&
            'Check your email inbox to confirm and activate your account.'}
        </p>
      </div>

      {/* 4. Sign In / Create Account Switch */}
      {mode !== 'forgot' && mode !== 'resend_confirm' && (
        <div
          role="tablist"
          aria-label="Authentication Options"
          className="grid grid-cols-2 p-0.5 rounded-[4px] bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] text-xs font-medium"
        >
          <button
            type="button"
            role="tab"
            disabled={isSubmitting}
            aria-selected={mode === 'signin'}
            onClick={() => switchMode('signin')}
            className={`py-2 px-3 rounded-[3px] text-center transition-all cursor-pointer disabled:cursor-not-allowed ${
              mode === 'signin'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] font-semibold border border-[var(--border-hairline)] shadow-2xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            role="tab"
            disabled={isSubmitting}
            aria-selected={mode === 'signup'}
            onClick={() => switchMode('signup')}
            className={`py-2 px-3 rounded-[3px] text-center transition-all cursor-pointer disabled:cursor-not-allowed ${
              mode === 'signup'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] font-semibold border border-[var(--border-hairline)] shadow-2xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Create Account
          </button>
        </div>
      )}

      {/* Calm Connectivity Diagnostic Notice (Separated cleanly from credential errors) */}
      {(isOfflineBrowser || (authHealth && !authHealth.ok)) && (
        <div
          role="status"
          aria-live="polite"
          className="px-3 py-2.5 rounded-[4px] bg-[var(--status-warning-bg)] border border-[var(--status-warning-border)] text-[var(--status-warning-fg)] text-[11px] flex items-center justify-between gap-2.5"
        >
          <p className="leading-snug min-w-0">
            {isOfflineBrowser
              ? 'You are currently offline. Reconnect to sign in or create an account.'
              : authHealth?.message ||
                'Authentication service is currently checking connectivity.'}
          </p>
          <button
            type="button"
            onClick={() => void checkAuthHealth()}
            disabled={isCheckingHealth}
            className="shrink-0 font-semibold underline underline-offset-2 hover:opacity-80 cursor-pointer disabled:opacity-50"
          >
            {isCheckingHealth ? 'Checking...' : 'Retry'}
          </button>
        </div>
      )}

      {/* Error Alert */}
      {errorMessage && (
        <div
          ref={alertRef}
          tabIndex={-1}
          role="alert"
          className="p-3 rounded-[4px] bg-[var(--status-error-bg)] border border-[var(--expense-border)] text-[var(--status-error-fg)] text-[12px] flex items-start justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
        >
          <div className="space-y-1.5 leading-snug min-w-0">
            <p>{errorMessage}</p>
            {mode === 'signin' && errorMessage.includes('not been confirmed') && (
              <button
                type="button"
                onClick={() => {
                  setUnconfirmedEmail(identifier.includes('@') ? identifier : '');
                  switchMode('resend_confirm');
                }}
                className="font-semibold underline underline-offset-2 hover:opacity-80 transition-opacity block cursor-pointer pt-0.5 text-left"
              >
                Resend confirmation link &rarr;
              </button>
            )}
            {isConnectivityError && (
              <button
                type="button"
                onClick={() => void checkAuthHealth()}
                disabled={isCheckingHealth}
                className="font-semibold underline underline-offset-2 hover:opacity-80 transition-opacity block cursor-pointer pt-0.5 text-left"
              >
                {isCheckingHealth ? 'Checking service status...' : 'Check service connection →'}
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setErrorMessage(null);
              identifierInputRef.current?.focus();
            }}
            className="text-[var(--status-error-fg)] opacity-75 hover:opacity-100 font-bold p-0.5 cursor-pointer shrink-0"
            aria-label="Dismiss alert"
          >
            ✕
          </button>
        </div>
      )}

      {/* Success Notice */}
      {successMessage && mode !== 'forgot' && (
        <div
          role="status"
          className="p-3 rounded-[3px] bg-[var(--income-bg)] border border-[var(--income-border)] text-[var(--income-fg)] text-[12px] flex items-start justify-between gap-2"
        >
          <p className="leading-snug">{successMessage}</p>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-[var(--income-fg)] opacity-70 hover:opacity-100 font-bold p-0.5 cursor-pointer"
            aria-label="Dismiss notification"
          >
            ✕
          </button>
        </div>
      )}

      {/* MODE 1: SIGN IN */}
      {mode === 'signin' && (
        <form onSubmit={handleSignIn} className="space-y-3.5">
          {/* Identifier field (Email or username) */}
          <div className="space-y-1">
            <label
              htmlFor="signin-identifier"
              className="block text-[12px] font-medium text-[var(--text-primary)]"
            >
              Email or username
            </label>
            <input
              ref={identifierInputRef}
              id="signin-identifier"
              name="identifier"
              type="text"
              required
              autoComplete="username"
              placeholder="you@domain.com or username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="w-full h-10 px-3 text-[13px] rounded-[4px] bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--brand-evergreen)] focus:ring-2 focus:ring-[var(--focus-ring)]/20 transition-all"
            />
          </div>

          {/* Password field with show/hide control and Forgot password link */}
          <div className="space-y-1">
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
                className="text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors underline underline-offset-2 cursor-pointer"
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
                className="w-full h-10 px-3 pr-10 text-[13px] rounded-[4px] bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--brand-evergreen)] focus:ring-2 focus:ring-[var(--focus-ring)]/20 transition-all"
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

          {/* Primary Sign In Button */}
          <button
            type="submit"
            disabled={isPending || isGooglePending}
            className="w-full h-10 px-4 rounded-[3px] bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] text-[13px] font-medium hover:bg-[var(--action-primary-hover)] transition-colors flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? (
              <span className="flex items-center gap-2">
                <svg
                  className="animate-spin h-3.5 w-3.5 text-current"
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
                Signing in...
              </span>
            ) : (
              'Sign In'
            )}
          </button>

          {/* Subtle divider labelled "or" */}
          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[var(--border-hairline)]" />
            </div>
            <div className="relative flex justify-center text-[11px] font-mono lowercase text-[var(--text-muted)]">
              <span className="bg-[var(--bg-surface)] px-2">or</span>
            </div>
          </div>

          {/* Continue with Google button */}
          <button
            type="button"
            onClick={handleGoogleSubmit}
            disabled={isPending || isGooglePending}
            className="w-full h-10 px-4 rounded-[3px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-subtle)] text-[var(--text-primary)] text-[13px] font-medium transition-all flex items-center justify-center gap-2.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGooglePending ? (
              <span className="flex items-center gap-2">
                <svg
                  className="animate-spin h-3.5 w-3.5 text-current"
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

          {/* Small, unobtrusive link to switch between sign-in and account creation */}
          <div className="pt-2 space-y-2 text-center">
            <div className="text-[12px] text-[var(--text-muted)]">
              Don&apos;t have an account?{' '}
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className="text-[var(--text-primary)] font-medium underline underline-offset-2 hover:opacity-80 transition-opacity cursor-pointer"
              >
                Create an account
              </button>
            </div>
            <p className="text-[11px] font-mono text-[var(--text-muted)]">
              Integer-paise precision &middot; Row-level security
            </p>
          </div>
        </form>
      )}

      {/* MODE 2: SIGN UP */}
      {mode === 'signup' && (
        <form onSubmit={handleSignUp} className="space-y-3.5">
          {/* Username */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label
                htmlFor="signup-username"
                className="block text-[12px] font-medium text-[var(--text-primary)]"
              >
                Username <span className="text-[var(--text-muted)] font-normal">(optional)</span>
              </label>
              {username.length > 0 ? (
                <span
                  className={`text-[10px] font-mono ${
                    isUsernameValid
                      ? 'text-[var(--income-fg)]'
                      : 'text-[var(--status-error-fg)]'
                  }`}
                >
                  {isUsernameValid ? '✓ Valid' : '3-20 chars, a-z, 0-9, _'}
                </span>
              ) : (
                <span className="text-[10px] font-mono text-[var(--text-muted)]">
                  auto-generated if blank
                </span>
              )}
            </div>
            <input
              id="signup-username"
              name="username"
              type="text"
              autoComplete="username"
              placeholder="e.g. rahul_sharma (or leave blank)"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full h-10 px-3 text-[13px] rounded-[4px] bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--brand-evergreen)] focus:ring-2 focus:ring-[var(--focus-ring)]/20 transition-all lowercase"
            />
          </div>

          {/* Email */}
          <div className="space-y-1">
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
              className="w-full h-10 px-3 text-[13px] rounded-[4px] bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--brand-evergreen)] focus:ring-2 focus:ring-[var(--focus-ring)]/20 transition-all"
            />
          </div>

          {/* Password */}
          <div className="space-y-1">
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
                className="w-full h-10 px-3 pr-10 text-[13px] rounded-[4px] bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--brand-evergreen)] focus:ring-2 focus:ring-[var(--focus-ring)]/20 transition-all"
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

          {/* Confirm Password */}
          <div className="space-y-1">
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
                className="w-full h-10 px-3 pr-10 text-[13px] rounded-[4px] bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--brand-evergreen)] focus:ring-2 focus:ring-[var(--focus-ring)]/20 transition-all"
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

          {/* Primary Create Account Button */}
          <button
            type="submit"
            disabled={
              isPending ||
              isGooglePending ||
              !isUsernameValid ||
              !isPasswordValidLength ||
              !isPasswordMatch
            }
            className="w-full h-10 px-4 rounded-[3px] bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] text-[13px] font-medium hover:bg-[var(--action-primary-hover)] transition-colors flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? (
              <span className="flex items-center gap-2">
                <svg
                  className="animate-spin h-3.5 w-3.5 text-current"
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
                Creating account...
              </span>
            ) : (
              'Create Account'
            )}
          </button>

          {/* Subtle divider labelled "or" */}
          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[var(--border-hairline)]" />
            </div>
            <div className="relative flex justify-center text-[11px] font-mono lowercase text-[var(--text-muted)]">
              <span className="bg-[var(--bg-surface)] px-2">or</span>
            </div>
          </div>

          {/* Continue with Google button */}
          <button
            type="button"
            onClick={handleGoogleSubmit}
            disabled={isPending || isGooglePending}
            className="w-full h-10 px-4 rounded-[3px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-subtle)] text-[var(--text-primary)] text-[13px] font-medium transition-all flex items-center justify-center gap-2.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGooglePending ? (
              <span className="flex items-center gap-2">
                <svg
                  className="animate-spin h-3.5 w-3.5 text-current"
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

          {/* Small, unobtrusive link */}
          <div className="pt-2 text-center text-[12px] text-[var(--text-muted)]">
            Already have an account?{' '}
            <button
              type="button"
              onClick={() => switchMode('signin')}
              className="text-[var(--text-primary)] font-medium underline underline-offset-2 hover:opacity-80 transition-opacity cursor-pointer"
            >
              Sign in
            </button>
          </div>
        </form>
      )}

      {/* MODE 3: FORGOT PASSWORD */}
      {mode === 'forgot' && successMessage && (
        <section
          role="status"
          aria-live="polite"
          className="space-y-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] p-4 sm:p-5"
        >
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--bg-surface)] text-base" aria-hidden="true">✉</span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Check your inbox</h2>
              <p className="mt-1 break-all text-xs leading-5 text-[var(--text-secondary)]">
                We processed the recovery request for <strong className="font-medium text-[var(--text-primary)]">{email}</strong>. If this address is linked to a SpendSense account, a password recovery link has been sent.
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3.5">
            <p className="text-xs font-medium text-[var(--text-primary)]">If the email doesn’t arrive</p>
            <ul className="mt-2 space-y-1.5 pl-4 text-xs leading-5 text-[var(--text-secondary)]">
              <li>Check your spam or junk folder and allow a few minutes.</li>
              <li>Confirm the address is the one you used to create the account.</li>
              <li>If you signed up with Google, return to sign in and choose Continue with Google.</li>
            </ul>
          </div>

          <p className="text-[11px] leading-5 text-[var(--text-muted)]">For account privacy, this page can’t confirm whether an email address is registered.</p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => { setEmail(''); setSuccessMessage(null); setErrorMessage(null); }}
              className="rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
            >
              Try another email
            </button>
            <button
              type="button"
              onClick={() => switchMode('signin')}
              className="rounded-lg bg-[var(--action-primary-bg)] px-3 py-2 text-xs font-medium text-[var(--action-primary-fg)] transition hover:opacity-90"
            >
              Back to sign in
            </button>
          </div>
        </section>
      )}

      {mode === 'forgot' && !successMessage && (
        <form onSubmit={handleResetPassword} className="space-y-3.5">
          <div className="space-y-1">
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
              className="w-full h-10 px-3 text-[13px] rounded-[4px] bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--brand-evergreen)] focus:ring-2 focus:ring-[var(--focus-ring)]/20 transition-all"
            />
            <p className="text-[11px] leading-5 text-[var(--text-muted)]">Enter the email used for your account. For privacy, we can’t confirm account registration from this screen.</p>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full h-10 px-4 rounded-[3px] bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] text-[13px] font-medium hover:bg-[var(--action-primary-hover)] transition-colors flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? (
              <span className="flex items-center gap-2">
                <svg
                  className="animate-spin h-3.5 w-3.5 text-current"
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
                Sending recovery link...
              </span>
            ) : (
              'Send recovery link'
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

      {/* MODE 4: RESEND CONFIRMATION */}
      {mode === 'resend_confirm' && (
        <form onSubmit={handleResendConfirmation} className="space-y-4">
          <div className="p-3.5 rounded-[3px] bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] text-[12px] space-y-2">
            <div className="font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
              <span>✉️</span> Check your email
            </div>
            <p className="text-[var(--text-secondary)] leading-relaxed">
              We sent a confirmation link to{' '}
              <strong className="text-[var(--text-primary)] font-medium">
                {unconfirmedEmail || email || 'your email address'}
              </strong>
              . Click the link in the email to activate your account.
            </p>
            <p className="text-[11px] text-[var(--text-muted)]">
              Didn&apos;t receive it? Check your spam folder or request a new confirmation email below.
            </p>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="confirm-email"
              className="block text-[12px] font-medium text-[var(--text-primary)]"
            >
              Email address
            </label>
            <input
              id="confirm-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@domain.com"
              value={unconfirmedEmail || email}
              onChange={(e) => {
                setUnconfirmedEmail(e.target.value);
                setEmail(e.target.value);
              }}
              className="w-full h-10 px-3 text-[13px] rounded-[4px] bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--brand-evergreen)] focus:ring-2 focus:ring-[var(--focus-ring)]/20 transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full h-10 px-4 rounded-[3px] bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] text-[13px] font-medium hover:bg-[var(--action-primary-hover)] transition-colors flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? (
              <span className="flex items-center gap-2">
                <svg
                  className="animate-spin h-3.5 w-3.5 text-current"
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
                Resending confirmation...
              </span>
            ) : (
              'Resend Confirmation Email'
            )}
          </button>

          <div className="pt-2 flex items-center justify-between text-[12px]">
            <button
              type="button"
              onClick={() => switchMode('signin')}
              className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors inline-flex items-center gap-1 cursor-pointer"
            >
              <span>&larr;</span> Back to Sign In
            </button>
            <button
              type="button"
              onClick={() => switchMode('signup')}
              className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              Create different account
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
