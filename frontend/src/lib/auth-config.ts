/**
 * Canonical authentication configuration, URL resolution, and redirect security.
 * Enforces strict environment origin derivation for local development and production.
 */

export const PRODUCTION_DEFAULT_ORIGIN = 'https://arth-9h3f.vercel.app';
export const LOCAL_DEFAULT_ORIGIN = 'http://localhost:3000';

interface MinimalHeaders {
  get(name: string): string | null;
}

/**
 * Checks whether an origin or URL string points to a local machine address.
 */
function isLocalhost(val: string): boolean {
  return (
    val.includes('localhost') ||
    val.includes('127.0.0.1') ||
    val.includes('[::1]')
  );
}

/**
 * Derives the canonical application origin.
 *
 * Priority order:
 * 1. Client-supplied origin (from browser window.location.origin, validated).
 * 2. NEXT_PUBLIC_APP_URL or APP_URL environment variable (sanitized).
 * 3. Incoming request headers (x-forwarded-host / host, x-forwarded-proto).
 * 4. Vercel deployment variables (VERCEL_PROJECT_PRODUCTION_URL, VERCEL_URL).
 * 5. In production: falls back strictly to PRODUCTION_DEFAULT_ORIGIN (never localhost).
 * 6. In development/test: falls back to LOCAL_DEFAULT_ORIGIN.
 */
export function getAppOrigin(
  headersList?: MinimalHeaders,
  clientOrigin?: string
): string {
  const isProd =
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL === '1' ||
    process.env.VERCEL_ENV === 'production' ||
    process.env.VERCEL_ENV === 'preview';

  // 1. Client-supplied origin (e.g. from window.location.origin during browser actions)
  if (
    clientOrigin &&
    typeof clientOrigin === 'string' &&
    clientOrigin.trim().length > 0
  ) {
    const trimmed = clientOrigin.trim().replace(/\/+$/, '');
    if (isProd) {
      // In production, strictly reject any localhost client origin
      if (!isLocalhost(trimmed) && trimmed.startsWith('https://')) {
        return trimmed;
      }
    } else {
      if (
        isLocalhost(trimmed) ||
        trimmed.startsWith('http://localhost') ||
        trimmed.startsWith('http://127.0.0.1')
      ) {
        return trimmed;
      }
    }
  }

  // 2. Explicit configured environment variable
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (configuredUrl && configuredUrl.trim().length > 0) {
    const trimmed = configuredUrl.trim().replace(/\/+$/, '');
    // In production, ensure we never accidentally redirect to localhost
    if (isProd) {
      if (!isLocalhost(trimmed) && trimmed.startsWith('https://')) {
        return trimmed;
      }
    } else {
      return trimmed;
    }
  }

  // 3. Derive from incoming request headers if available
  if (headersList) {
    const forwardedHost = headersList.get('x-forwarded-host');
    const host = forwardedHost || headersList.get('host');
    const forwardedProto = headersList.get('x-forwarded-proto');

    if (host && host.trim().length > 0) {
      const cleanHost = host.trim();
      const proto = isProd
        ? 'https'
        : forwardedProto || (cleanHost.includes('localhost') ? 'http' : 'https');

      const derived = `${proto}://${cleanHost}`.replace(/\/+$/, '');
      if (isProd) {
        if (!isLocalhost(derived)) {
          return derived;
        }
      } else {
        return derived;
      }
    }
  }

  // 4. Vercel system environment variables
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.trim().replace(/\/+$/, '')}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.trim().replace(/\/+$/, '')}`;
  }

  // 5. Production fallback: canonical production domain (never localhost)
  if (isProd) {
    return PRODUCTION_DEFAULT_ORIGIN;
  }

  // 6. Local development fallback
  return LOCAL_DEFAULT_ORIGIN;
}

/**
 * Returns the explicit OAuth / authentication callback URL.
 */
export function getAuthCallbackUrl(origin?: string): string {
  const base = origin ? origin.replace(/\/+$/, '') : getAppOrigin();
  return `${base}/auth/callback`;
}

/**
 * Returns the explicit email confirmation verification URL.
 */
export function getAuthConfirmUrl(origin?: string): string {
  const base = origin ? origin.replace(/\/+$/, '') : getAppOrigin();
  return `${base}/auth/confirm`;
}

/**
 * Validates and sanitizes a post-authentication redirect destination.
 * Strictly prevents open-redirect vulnerabilities.
 */
export function sanitizeRedirectPath(
  nextPath?: string | null,
  fallback = '/'
): string {
  if (!nextPath || typeof nextPath !== 'string') {
    return fallback;
  }

  const trimmed = nextPath.trim();

  // Must begin with a single slash, not a protocol-relative '//', and not contain backslashes or schemes
  if (
    trimmed.startsWith('/') &&
    !trimmed.startsWith('//') &&
    !trimmed.includes('\\') &&
    !trimmed.includes(':')
  ) {
    return trimmed;
  }

  return fallback;
}

import { sanitizeUserFacingError } from './error-utils';

/**
 * Converts technical OAuth or Supabase Auth error codes into human-readable, actionable guidance.
 */
export function formatAuthError(
  errorParam?: string | null,
  description?: string | null
): string {
  if (description && description.trim().length > 0) {
    const desc = description.trim();
    if (desc.includes('User cancelled') || desc.includes('cancelled') || desc.includes('access_denied')) {
      return 'Sign in was cancelled. Please try again.';
    }
    if (desc.includes('flow_state_not_found') || desc.includes('code verifier') || desc.includes('PKCE')) {
      return 'Your authentication session expired or cookies were blocked. Please retry signing in.';
    }
    if (desc.includes('Invalid login credentials')) {
      return 'Invalid email address or password. Please verify your credentials and try again.';
    }
    if (desc.includes('Email not confirmed')) {
      return 'Your email address has not been confirmed yet. Please check your inbox for the confirmation link.';
    }
    if (desc.includes('Token has expired') || desc.includes('otp_expired')) {
      return 'The confirmation link has expired. Please request a new confirmation email.';
    }
    return sanitizeUserFacingError(desc);
  }

  if (!errorParam) {
    return 'An unexpected authentication error occurred. Please try again.';
  }

  switch (errorParam) {
    case 'missing_authorization_code':
      return 'No authorization code was returned by the identity provider. Please try signing in again.';
    case 'auth_exchange_failed':
      return 'The authorization code exchange failed or the session expired. Please try signing in again.';
    case 'confirmation_failed':
      return 'The confirmation link is invalid or has expired. Please request a new confirmation link.';
    case 'missing_confirmation_token':
      return 'No confirmation token was found in the link. Please check your email or request a new confirmation link.';
    case 'access_denied':
      return 'Sign-in was cancelled or access was denied. Please try again.';
    case 'expired_session':
      return 'Your password recovery or authentication session has expired. Please sign in again.';
    case 'auth_service_unavailable':
      return 'SpendSense authentication service is temporarily unavailable. Check your internet connection and try again.';
    case 'session_persistence_failed':
      return 'Your browser could not save your session cookies. Allow site cookies for SpendSense and try again.';
    default:
      return sanitizeUserFacingError(decodeURIComponent(errorParam));
  }
}
