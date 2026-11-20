/**
 * User-facing error sanitization and messaging utilities for SpendSense.
 * Enforces the core invariant that internal database codes, SQL errors,
 * PostgREST schema errors, JWT exceptions, or network stack traces
 * are never exposed to the user interface.
 */

export function sanitizeUserFacingError(
  rawError: unknown,
  defaultFallback = 'An unexpected error occurred. Please try again.'
): string {
  if (!rawError) return defaultFallback;

  let message = '';
  if (typeof rawError === 'string') {
    message = rawError.trim();
  } else if (rawError instanceof Error) {
    message = rawError.message.trim();
  } else if (typeof rawError === 'object' && rawError !== null && 'message' in rawError) {
    message = String((rawError as { message: unknown }).message).trim();
  }

  if (!message) return defaultFallback;

  const lower = message.toLowerCase();

  // 1. Username already registered / taken
  if (
    lower.includes('already taken') ||
    lower.includes('username is already taken') ||
    lower.includes('username already taken') ||
    lower.includes('occupied by existing') ||
    lower.includes('choose another username') ||
    lower.includes('choose another') ||
    ((lower.includes('uq_profiles_lower_username') || lower.includes('username')) &&
     (lower.includes('unique') || lower.includes('duplicate key') || lower.includes('23505')))
  ) {
    return 'This username is already taken. Please choose another username.';
  }

  // 2. Authentication, Sessions & Credentials
  if (
    lower.includes('invalid login credentials') ||
    lower.includes('invalid_grant') ||
    lower.includes('invalid email or password') ||
    lower.includes('invalid credentials')
  ) {
    return 'The email, username, or password you entered is incorrect. Please verify your credentials and try again.';
  }

  if (
    lower.includes('user already registered') ||
    lower.includes('already registered') ||
    lower.includes('user_already_exists')
  ) {
    return 'An account with this email address already exists. Please sign in or reset your password.';
  }

  if (lower.includes('email not confirmed') || lower.includes('unconfirmed')) {
    return 'Your email address has not been confirmed yet. Please check your inbox for the confirmation link.';
  }

  if (
    lower.includes('token has expired') ||
    lower.includes('otp_expired') ||
    lower.includes('flow_state_not_found') ||
    lower.includes('code verifier') ||
    lower.includes('pkce')
  ) {
    return 'Your authentication session expired or cookies were blocked. Please retry signing in.';
  }

  if (
    lower.includes('expired_session') ||
    lower.includes('session has expired') ||
    lower.includes('session expired') ||
    lower.includes('session has ended') ||
    lower.includes('jwt expired')
  ) {
    return 'Your session has expired. Please sign in again.';
  }

  if (
    lower.includes('user cancelled') ||
    lower.includes('cancelled') ||
    lower.includes('access_denied')
  ) {
    return 'Sign in was cancelled. Please try again.';
  }

  if (lower.includes('password must be at least') || lower.includes('password should be at least')) {
    return 'Password must be at least 8 characters in length.';
  }

  if (lower.includes('passwords do not match')) {
    return 'Passwords do not match. Please verify both fields.';
  }

  // 3. RLS / Row-Level Security & Permission Rejections
  if (
    lower.includes('row-level security') ||
    lower.includes('violates row-level security policy') ||
    lower.includes('permission denied') ||
    lower.includes('42501')
  ) {
    return 'Access denied. You do not have permission to perform this action.';
  }

  // 4. Rate Limits
  if (
    lower.includes('too many requests') ||
    lower.includes('rate limit') ||
    lower.includes('rate_limit') ||
    lower.includes('over_email_send_rate_limit')
  ) {
    return 'Too many attempts in a short period. Please wait a few moments before trying again.';
  }

  // 4. Username Lookup & Authentication Service Availability
  if (
    lower.includes('username lookup unavailable') ||
    lower.includes('username sign-in is temporarily unavailable') ||
    lower.includes('username sign-in requires') ||
    lower.includes('username login requires')
  ) {
    return 'Username sign-in is temporarily unavailable. Please sign in with your registered email address or try again shortly.';
  }

  if (
    lower.includes('auth service unavailable') ||
    lower.includes('authapierror') ||
    lower.includes('authentication service is temporarily unavailable')
  ) {
    return 'Authentication service is temporarily unavailable. Please try again shortly.';
  }

  // 5. Temporary backend unavailability / Gateway failures
  if (
    lower.includes('backend service is currently unavailable') ||
    lower.includes('bad gateway') ||
    lower.includes('service unavailable') ||
    lower.includes('temporarily unavailable')
  ) {
    return 'SpendSense is temporarily unavailable. Your existing financial records have not been confirmed as loaded.';
  }

  // 6. Network & Connection Failures (Node undici, browser fetch, timeout, unreachable)
  if (
    lower.includes('fetch failed') ||
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('econnrefused') ||
    lower.includes('enotfound') ||
    lower.includes('etimedout') ||
    lower.includes('network request failed') ||
    lower.includes('unable to connect') ||
    lower.includes('could not connect') ||
    lower.includes('abort') ||
    lower.includes('undici') ||
    lower.includes('typeerror: fetch failed')
  ) {
    return 'Unable to connect to the server. Please check your internet connection and try again.';
  }

  // 7. Database, SQL, Postgres, PostgREST internals leakage prevention
  if (
    lower.includes('pgrst') ||
    lower.includes('postgres') ||
    lower.includes('duplicate key') ||
    lower.includes('violates unique constraint') ||
    lower.includes('violates foreign key') ||
    lower.includes('schema cache') ||
    lower.includes('relation') ||
    lower.includes('column') ||
    lower.includes('syntax error') ||
    lower.includes('authapierror') ||
    lower.includes('supabase') ||
    lower.includes('internal server error') ||
    lower.includes('fn_account_balances') ||
    lower.includes('function public.') ||
    lower.includes('500') ||
    lower.includes('502') ||
    lower.includes('503')
  ) {
    return defaultFallback;
  }

  return message;
}
