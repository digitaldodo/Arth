'use server';

import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import {
  getAppOrigin,
  getAuthCallbackUrl,
  getAuthConfirmUrl,
} from '@/lib/auth-config';
import { sanitizeUserFacingError } from '@/lib/error-utils';

import {
  isValidUsername,
  isReservedUsername,
  generateRandomCandidateUsername,
  generateUsernameSuggestions,
} from '@/lib/username';
import { getPasswordStatus } from '@/lib/auth/password-status';

export interface AuthActionResult {
  success?: boolean;
  error?: string;
  message?: string;
  redirectUrl?: string;
  needsConfirmation?: boolean;
}

/**
 * Standard email format validation regex.
 */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Password strength validation: minimum 8 characters.
 */
function isValidPassword(password: string): boolean {
  return typeof password === 'string' && password.length >= 8;
}

type AuthClient = Awaited<ReturnType<typeof createClient>>;

async function getAvailableUsernameSuggestions(
  supabase: AuthClient,
  base: string
): Promise<string[]> {
  return generateUsernameSuggestions(base, async (candidate) => {
    const { data, error } = await supabase.rpc('fn_check_username_available', {
      p_username: candidate,
    });
    return !error && data === true;
  });
}

/** Persist the status marker only after Supabase has confirmed password authentication or update. */
async function markPasswordConfigured(supabase: AuthClient, recordSetAt = false): Promise<boolean> {
  const data = recordSetAt
    ? { has_password: true, password_set_at: new Date().toISOString() }
    : { has_password: true };
  try {
    const { error } = await supabase.auth.updateUser({ data });
    return !error;
  } catch {
    return false;
  }
}

function getServiceRoleKey(): string | undefined {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim()
  );
}

function hasServiceRoleKey(): boolean {
  return Boolean(getServiceRoleKey());
}

/**
 * Checks whether SUPABASE_SERVICE_ROLE_KEY is configured on the server.
 */
export async function isServiceRoleConfigured(): Promise<boolean> {
  return hasServiceRoleKey();
}

/**
 * Server-only helper to resolve a normalized username to its associated account email.
 * Uses SUPABASE_SERVICE_ROLE_KEY on the server to execute privileged RPC fn_get_email_by_username.
 * Never exposed to client bundles or browser endpoints.
 * Never logs credentials, tokens, or email addresses.
 */
export async function resolveEmailFromUsername(
  normalizedUsername: string
): Promise<string | null> {
  const result = await lookupEmailByUsername(normalizedUsername);
  return result.status === 'resolved' ? result.email : null;
}

export type UsernameLookupResult =
  | { status: 'resolved'; email: string }
  | { status: 'not_found' }
  | { status: 'unavailable' };

/** Distinguishes a missing username from a lookup service/configuration failure. */
export async function lookupEmailByUsername(
  normalizedUsername: string
): Promise<UsernameLookupResult> {
  const serviceRoleKey = getServiceRoleKey();
  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!serviceRoleKey || !supabaseUrl) {
    return { status: 'unavailable' };
  }

  try {
    const { createClient: createServiceClient } = await import(
      '@supabase/supabase-js'
    );
    const serviceClient = createServiceClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const { data: email, error } = await serviceClient.rpc(
      'fn_get_email_by_username',
      { p_username: normalizedUsername }
    );

    if (error) {
      const correlationId = `lookup_err_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      console.error(`[Username Lookup Error ${correlationId}]:`, error.message);
      return { status: 'unavailable' };
    }

    if (!email || typeof email !== 'string') {
      return { status: 'not_found' };
    }

    return { status: 'resolved', email: email.trim().toLowerCase() };
  } catch (err: unknown) {
    const correlationId = `lookup_catch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    console.error(`[Username Lookup Exception ${correlationId}]:`, err instanceof Error ? err.message : String(err));
    return { status: 'unavailable' };
  }
}

/**
 * 1. Email or Username and Password Sign In Action
 * Accepts either an email address or a registered username.
 * For usernames, performs secure server-side resolution to email before invoking
 * standard Supabase password authentication.
 */
export async function signInWithEmailAction(
  formData: FormData
): Promise<AuthActionResult> {
  const rawIdentifier = (
    (formData.get('identifier') || formData.get('email') || '') as string
  ).trim();
  const password = formData.get('password') as string;

  if (!rawIdentifier) {
    return { error: 'Please enter your email or username.' };
  }

  if (!password) {
    return { error: 'Please enter your password.' };
  }

  const isEmail = isValidEmail(rawIdentifier);
  let targetEmail: string | null = null;

  if (isEmail) {
    targetEmail = rawIdentifier.toLowerCase();
  } else {
    // Input is a username
    const normalizedUsername = rawIdentifier.toLowerCase();
    if (!isValidUsername(normalizedUsername)) {
      // Return the generic message to avoid disclosing username constraints to probing attackers
      return {
        error:
          'Invalid email, username, or password. Please verify your credentials and try again.',
      };
    }

    const lookup = await lookupEmailByUsername(normalizedUsername);
    if (lookup.status === 'unavailable') {
      if (!hasServiceRoleKey()) {
        return {
          error:
            'Username login requires server configuration (SUPABASE_SERVICE_ROLE_KEY). Please sign in using your registered email address.',
        };
      }
      return {
        error:
          'Username sign-in is temporarily unavailable. Please sign in with your registered email address or try again shortly.',
      };
    }
    if (lookup.status === 'not_found') {
      // Generic authentication failure to prevent username enumeration
      return {
        error:
          'Invalid email, username, or password. Please verify your credentials and try again.',
      };
    }
    targetEmail = lookup.email;
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: targetEmail,
      password,
    });

    if (error) {
      if (
        error.message.includes('Invalid login credentials') ||
        error.message.includes('invalid_grant')
      ) {
        return {
          error:
            'Invalid email, username, or password. Please verify your credentials and try again.',
        };
      }
      if (error.message.includes('Email not confirmed')) {
        return {
          error:
            'Your email address has not been confirmed yet. Please check your inbox for the confirmation link.',
        };
      }
      if (error.status === 429 || error.message.includes('rate')) {
        return {
          error:
            'Too many sign-in attempts. Please wait a few moments before trying again.',
        };
      }
      const correlationId = `auth_err_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      console.error(`[Auth Sign-In Error ${correlationId}]:`, error.message);
      return {
        error: sanitizeUserFacingError(error.message, 'Unable to sign in. Please check your credentials and try again.'),
      };
    }

    if (data.user && getPasswordStatus(data.user.user_metadata) !== 'configured') {
      // Successful credential authentication is authoritative; repair legacy markers.
      await markPasswordConfigured(supabase).catch(() => false);
    }

    if (data.session) {
      return { success: true, redirectUrl: '/' };
    }

    return { success: true, redirectUrl: '/' };
  } catch (err: unknown) {
    const correlationId = `auth_catch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    console.error(`[Auth Sign-In Exception ${correlationId}]:`, err instanceof Error ? err.message : String(err));
    return { error: sanitizeUserFacingError(err, 'Unable to sign in. Please try again.') };
  }
}

/**
 * Semantic alias for signInWithEmailAction supporting both identifier types.
 */
export const signInAction = signInWithEmailAction;

/**
 * 2. Account Registration Action (Sign Up)
 */
export async function signUpWithEmailAction(
  formData: FormData,
  clientOrigin?: string
): Promise<AuthActionResult> {
  const rawUsername = (formData.get('username') as string)?.trim();
  const email = (formData.get('email') as string)?.trim().toLowerCase();
  const password = formData.get('password') as string;
  const confirmPassword = formData.get('confirmPassword') as string;

  let normalizedUsername: string;

  if (rawUsername) {
    if (!isValidUsername(rawUsername)) {
      return {
        error:
          'Username must be between 3 and 20 characters and contain only letters, numbers, and underscores.',
      };
    }
    normalizedUsername = rawUsername.toLowerCase();
    if (isReservedUsername(normalizedUsername)) {
      return {
        error: 'This username is reserved. Please choose another username.',
      };
    }
  } else {
    // If not provided, automatically generate a random, unique, human-readable username
    normalizedUsername = generateRandomCandidateUsername();
  }

  if (!email || !isValidEmail(email)) {
    return { error: 'Please enter a valid email address.' };
  }

  if (!password || !isValidPassword(password)) {
    return {
      error: 'Password must be at least 8 characters in length.',
    };
  }

  if (password !== confirmPassword) {
    return { error: 'Passwords do not match. Please verify both fields.' };
  }

  try {
    let headersList;
    try {
      headersList = await headers();
    } catch {
      headersList = undefined;
    }

    const origin = getAppOrigin(headersList, clientOrigin);
    const confirmUrl = getAuthConfirmUrl(origin);
    const supabase = await createClient();

    // Verify username availability prior to creation: fail closed on RPC error
    if (rawUsername) {
      const { data: isAvailable, error: checkError } = await supabase.rpc(
        'fn_check_username_available',
        { p_username: normalizedUsername }
      );

      if (checkError) {
        return {
          error: sanitizeUserFacingError(
            checkError,
            "We couldn't connect to SpendSense. Check your connection and try again."
          ),
        };
      }

      if (isAvailable !== true) {
        return {
          error: 'This username is already taken. Please choose another username.',
        };
      }
    } else {
      // Auto-generated username collision retry
      let attempts = 0;
      while (attempts < 10) {
        attempts++;
        const { data: isAvailable, error: checkErr } = await supabase.rpc(
          'fn_check_username_available',
          { p_username: normalizedUsername }
        );
        if (!checkErr && isAvailable === true) {
          break;
        }
        normalizedUsername = generateRandomCandidateUsername();
      }
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: normalizedUsername,
          full_name: rawUsername || normalizedUsername,
        },
        emailRedirectTo: confirmUrl,
      },
    });

    if (error) {
      if (
        error.message.includes('already registered') ||
        error.message.includes('User already registered')
      ) {
        return {
          error:
            'An account with this email address already exists. Please sign in or reset your password.',
        };
      }
      if (
        error.message.includes('already taken') ||
        error.message.includes('23505') ||
        error.message.includes('unique constraint') ||
        error.message.includes('uq_profiles_lower_username')
      ) {
        return {
          error: 'This username is already taken. Please choose another username.',
        };
      }
      return {
        error: sanitizeUserFacingError(error.message, 'Registration failed. Please try again.'),
      };
    }

    // Check if Supabase returned an empty identities array (means user already exists with confirmation required)
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return {
        error:
          'An account with this email address already exists. Please sign in or reset your password.',
      };
    }

    // If session is immediately available (email confirmation disabled on Supabase project)
    if (data.session) {
      return { success: true, redirectUrl: '/' };
    }

    // If email confirmation is required (default and recommended)
    return {
      success: true,
      needsConfirmation: true,
      message:
        'Confirmation request accepted. A confirmation link has been dispatched to your email address. Please check your inbox (including spam/junk folders) to activate your account.',
    };
  } catch (err: unknown) {
    return { error: sanitizeUserFacingError(err, 'Registration failed. Please try again.') };
  }
}

/**
 * 2b. Resend Confirmation Email Action
 */
export async function resendConfirmationEmailAction(
  formData: FormData,
  clientOrigin?: string
): Promise<AuthActionResult> {
  const email = (formData.get('email') as string)?.trim().toLowerCase();

  if (!email || !isValidEmail(email)) {
    return { error: 'Please enter a valid email address.' };
  }

  try {
    let headersList;
    try {
      headersList = await headers();
    } catch {
      headersList = undefined;
    }

    const origin = getAppOrigin(headersList, clientOrigin);
    const confirmUrl = getAuthConfirmUrl(origin);
    const supabase = await createClient();

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: confirmUrl,
      },
    });

    if (error) {
      if (
        error.status === 429 ||
        error.message.includes('rate') ||
        error.message.includes('security purposes')
      ) {
        return {
          error:
            'Too many confirmation requests. For security purposes, please wait a minute before requesting another confirmation email.',
        };
      }
      if (error.message.includes('already confirmed')) {
        return {
          success: true,
          message:
            'This email address has already been confirmed. You can sign in immediately.',
        };
      }
      return {
        error: `Unable to dispatch confirmation email: ${error.message}. If you configured custom Gmail SMTP in Supabase, ensure a 16-character Google App Password is used with port 587.`,
      };
    }

    // Uniform response to prevent account enumeration
    return {
      success: true,
      message:
        'If an unconfirmed account exists with this email address, a confirmation email has been dispatched. Please check your inbox and spam folder.',
    };
  } catch (err: unknown) {
    return { error: sanitizeUserFacingError(err, 'Unable to resend confirmation email. Please try again.') };
  }
}

/**
 * 3. Password Reset Request Action
 */
export async function requestPasswordResetAction(
  formData: FormData
): Promise<AuthActionResult> {
  const rawInput = (
    (formData.get('email') || formData.get('identifier') || '') as string
  ).trim();

  if (!rawInput) {
    return { error: 'Please enter your registered email address.' };
  }

  // If user entered a username instead of an email address
  if (!isValidEmail(rawInput)) {
    return {
      error:
        'Password recovery requires your registered email address. Please enter the email address associated with your account.',
    };
  }

  const email = rawInput.toLowerCase();

  try {
    const headersList = await headers();
    const origin = getAppOrigin(headersList);
    const callbackUrl = getAuthCallbackUrl(origin);
    const supabase = await createClient();

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${callbackUrl}?next=/auth/update-password`,
    });

    if (error) {
      // Avoid user enumeration: do not disclose whether user exists
      if (error.status === 429) {
        return {
          error:
            'Too many recovery requests. Please wait a few moments before trying again.',
        };
      }
    }

    // Always report uniform success to prevent account enumeration
    return {
      success: true,
      message:
        'If an account exists with this email address, a password recovery link has been dispatched to your inbox.',
    };
  } catch {
    return {
      success: true,
      message:
        'If an account exists with this email address, a password recovery link has been dispatched to your inbox.',
    };
  }
}

/**
 * 4. Password Update Action (Recovery flow)
 */
export async function updatePasswordAction(
  formData: FormData
): Promise<AuthActionResult> {
  const password = formData.get('password') as string;
  const confirmPassword = formData.get('confirmPassword') as string;

  if (!password || !isValidPassword(password)) {
    return {
      error: 'New password must be at least 8 characters in length.',
    };
  }

  if (password !== confirmPassword) {
    return { error: 'Passwords do not match. Please verify both fields.' };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        error:
          'Your password recovery session has expired or is invalid. Please request a new password reset link.',
      };
    }

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      return {
        error: error.message || 'Failed to update password. Please try again.',
      };
    }

    await markPasswordConfigured(supabase, true);

    return {
      success: true,
      redirectUrl: '/',
      message: 'Your password has been successfully updated.',
    };
  } catch (err: unknown) {
    return { error: sanitizeUserFacingError(err, 'Password update failed. Please try again.') };
  }
}

/**
 * Secure Account Password Management Action (Settings)
 * Handles both:
 * 1. Changing an existing account password (requiring verification of current password).
 * 2. Setting a password for Google OAuth accounts that do not currently have a password.
 *
 * Rules:
 * - Active authenticated session required.
 * - Does not accept passwords with accidental leading or trailing spaces.
 * - Minimum 8 characters.
 * - Matching confirmation.
 * - If user has email identity, verifies current password via re-authentication.
 * - Prohibits reuse of the exact same password as current password.
 * - Uses Supabase Auth updateUser mechanism.
 * - Sanitizes all internal errors.
 */
export async function changePasswordAction(
  formData: FormData
): Promise<AuthActionResult> {
  const rawCurrentPassword = formData.get('currentPassword');
  const rawNewPassword = formData.get('newPassword') || formData.get('password');
  const rawConfirmPassword = formData.get('confirmPassword');

  const currentPassword = typeof rawCurrentPassword === 'string' ? rawCurrentPassword : '';
  const newPasswordRaw = typeof rawNewPassword === 'string' ? rawNewPassword : '';
  const confirmPasswordRaw = typeof rawConfirmPassword === 'string' ? rawConfirmPassword : '';

  // Check for leading or trailing whitespace
  if (
    newPasswordRaw.startsWith(' ') ||
    newPasswordRaw.endsWith(' ') ||
    confirmPasswordRaw.startsWith(' ') ||
    confirmPasswordRaw.endsWith(' ')
  ) {
    return {
      error: 'Password cannot begin or end with a space.',
    };
  }

  const newPassword = newPasswordRaw.trim();
  const confirmPassword = confirmPasswordRaw.trim();

  if (!newPassword) {
    return {
      error: 'Please enter a new password.',
    };
  }

  if (!isValidPassword(newPassword)) {
    return {
      error: 'New password must be at least 8 characters in length.',
    };
  }

  if (newPassword !== confirmPassword) {
    return {
      error: 'Passwords do not match. Please verify both fields.',
    };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        error:
          'Your session has expired. Please sign in again before updating your password.',
      };
    }

    // Use only the explicit password marker; an email identity is not proof of a working password.
    const passwordStatus = getPasswordStatus(user.user_metadata);
    const hasPassword = passwordStatus === 'configured';
    const mustVerifyExisting = hasPassword ||
      (passwordStatus === 'unknown' && currentPassword.length > 0);

    if (mustVerifyExisting) {
      if (!currentPassword) {
        return {
          error: 'Current password is required to change your password.',
        };
      }

      if (newPassword === currentPassword.trim()) {
        return {
          error: 'New password must be different from your current password.',
        };
      }

      // Verify current credentials
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email!,
        password: currentPassword,
      });

      if (verifyError) {
        return {
          error: 'Incorrect current password. Please try again.',
        };
      }
    }

    // Update password in Supabase Auth and persist has_password metadata
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });

    if (updateError) {
      const errMsg = updateError.message?.toLowerCase() || '';
      if (
        errMsg.includes('reauthenticate') ||
        errMsg.includes('recent login') ||
        updateError.status === 422 ||
        (updateError as { code?: string }).code === 'reauthentication_needed'
      ) {
        return {
          error:
            'Security policy requires recent authentication before updating your password. Please sign out and sign back in, then try again.',
        };
      }
      if (
        updateError.status === 429 ||
        errMsg.includes('rate') ||
        errMsg.includes('too many')
      ) {
        return {
          error:
            'Too many password update attempts. Please wait a few moments before trying again.',
        };
      }

      return {
        error: updateError.message || 'Failed to update password. Please try again.',
      };
    }

    await markPasswordConfigured(supabase, true);

    return {
      success: true,
      message: mustVerifyExisting
        ? 'Your password has been successfully updated.'
        : 'Password successfully set! You can now sign in using your email or username and password, or continue using Google sign-in.',
    };
  } catch (err: unknown) {
    return { error: sanitizeUserFacingError(err, 'Password update failed. Please try again.') };
  }
}

/**
 * Set or Update Account Password Action (Authenticated User)
 * Allows authenticated users (including those originally registered via Google OAuth)
 * to choose and confirm a new password on their existing account.
 *
 * Rules:
 * 1. Requires active, valid authenticated user session (auth.getUser()).
 * 2. Enforces password length >= 8 characters.
 * 3. Enforces confirmPassword matching.
 * 4. Calls supabase.auth.updateUser({ password }) to set the password on the existing auth user.
 * 5. Respects reauthentication requirements if enforced by Supabase security policies.
 * 6. Never logs, prints, or exposes the password.
 * 7. Does not alter the user's email, profile, username, or financial records.
 */
export async function setAccountPasswordAction(
  formData: FormData
): Promise<AuthActionResult> {
  const password = ((formData.get('password') as string) || '').trim();
  const confirmPassword = (
    (formData.get('confirmPassword') as string) || ''
  ).trim();

  if (!isValidPassword(password)) {
    return {
      error: 'New password must be at least 8 characters in length.',
    };
  }

  if (password !== confirmPassword) {
    return {
      error: 'Passwords do not match. Please verify both fields.',
    };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        error:
          'Your session has expired. Please sign in again before setting a password.',
      };
    }

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      const errMsg = error.message?.toLowerCase() || '';
      if (
        errMsg.includes('reauthenticate') ||
        errMsg.includes('recent login') ||
        error.status === 422 ||
        (error as { code?: string }).code === 'reauthentication_needed'
      ) {
        return {
          error:
            'Security policy requires recent authentication before setting a password. Please sign out and sign back in, then try again.',
        };
      }

      return {
        error: error.message || 'Failed to set password. Please try again.',
      };
    }

    await markPasswordConfigured(supabase, true);

    return {
      success: true,
      message:
        'Password successfully set! You can now sign in using your email and password, or continue using Google sign-in.',
    };
  } catch (err: unknown) {
    return { error: sanitizeUserFacingError(err, 'Password update failed. Please try again.') };
  }
}

/**
 * 5. Google OAuth Initiation Action
 * Uses server-side createClient to establish PKCE code verifier and returns
 * the authoritative redirect URL to the caller.
 * Targets the exact /auth/callback URL without trailing query strings to ensure
 * strict compatibility with Supabase Authentication URL Configuration allowlists.
 */
export async function signInWithGoogleAction(clientOrigin?: string): Promise<{
  url?: string;
  error?: string;
}> {
  try {
    let headersList;
    try {
      headersList = await headers();
    } catch {
      // Standalone test context or outside Next.js request scope
      headersList = undefined;
    }

    const origin = getAppOrigin(headersList, clientOrigin);
    const callbackUrl = getAuthCallbackUrl(origin);
    const supabase = await createClient();

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callbackUrl,
      },
    });

    if (error) {
      return { error: sanitizeUserFacingError(error.message, 'Unable to initiate Google sign-in. Please try again.') };
    }

    if (data.url) {
      return { url: data.url };
    }

    return { error: 'Unable to initiate Google sign-in. Please try again.' };
  } catch (err: unknown) {
    return { error: sanitizeUserFacingError(err, 'Unable to initiate Google sign-in. Please try again.') };
  }
}

/**
 * 6. Set / Claim Username Action (for authenticated users e.g. Google OAuth or legacy accounts)
 */
export async function setUsernameAction(
  formData: FormData
): Promise<AuthActionResult & { suggestions?: string[] }> {
  const rawUsername = (formData.get('username') as string)?.trim();

  if (!rawUsername || !isValidUsername(rawUsername)) {
    return {
      error:
        'Username must be between 3 and 20 characters and contain only letters, numbers, and underscores.',
    };
  }

  const normalizedUsername = rawUsername.toLowerCase();
  if (isReservedUsername(normalizedUsername)) {
    try {
      const supabase = await createClient();
      const verified = await getAvailableUsernameSuggestions(supabase, normalizedUsername);
      const suggestions = verified && verified.length >= 2 ? verified : await generateUsernameSuggestions(normalizedUsername);
      return {
        error: 'This username is reserved. Please choose another username.',
        suggestions,
      };
    } catch {
      return {
        error: 'This username is reserved. Please choose another username.',
        suggestions: await generateUsernameSuggestions(normalizedUsername),
      };
    }
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        error: 'Active session required to set a username. Please sign in.',
      };
    }

    // Call authoritative RPC fn_set_own_username
    const { error: rpcError } = await supabase.rpc('fn_set_own_username', {
      p_username: normalizedUsername,
    });

    if (rpcError) {
      if (
        rpcError.code === '23505' ||
        rpcError.message.includes('already taken')
      ) {
        const suggestions = await getAvailableUsernameSuggestions(supabase, normalizedUsername);
        return {
          error: 'This username is already taken. Please choose another username.',
          suggestions,
        };
      }

      // If function is missing from schema cache (e.g. migration 0014 not run yet or cache stale),
      // gracefully attempt direct profile update if table column exists
      if (
        rpcError.message.includes('schema cache') ||
        rpcError.code === 'PGRST202'
      ) {
        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            username: normalizedUsername,
            updated_at: new Date().toISOString(),
          })
          .eq('id', user.id);

        if (updateError) {
          if (
            updateError.code === '23505' ||
            updateError.message.includes('unique') ||
            updateError.message.includes('already taken')
          ) {
            const suggestions = await getAvailableUsernameSuggestions(supabase, normalizedUsername);
            return {
              error: 'This username is already taken. Please choose another username.',
              suggestions,
            };
          }
          if (
            updateError.message.includes('column "username" of relation "profiles" does not exist') ||
            updateError.code === '42703'
          ) {
            return {
              error:
                'Database migration required: Migration 0014/0019 has not been applied to your Supabase project. Please run migration 0019 in the Supabase SQL Editor.',
            };
          }
          return {
            error: updateError.message || 'Failed to update username. Please try again.',
          };
        }

        // Also update auth user metadata
        await supabase.auth.updateUser({
          data: { username: normalizedUsername },
        });

        return {
          success: true,
          message: `Your username @${normalizedUsername} has been set successfully.`,
          redirectUrl: '/',
        };
      }

      return {
        error: sanitizeUserFacingError(rpcError.message, 'Failed to update username. Please try again.'),
      };
    }

    return {
      success: true,
      message: 'Your username has been set successfully.',
      redirectUrl: '/',
    };
  } catch (err: unknown) {
    return { error: sanitizeUserFacingError(err, 'Failed to update username.') };
  }
}

/**
 * 7. Check Username Availability Action
 */
export async function checkUsernameAvailabilityAction(
  username: string
): Promise<{ available: boolean; error?: string; suggestions?: string[] }> {
  const cleanUsername = username?.trim().toLowerCase();
  if (!cleanUsername || !isValidUsername(cleanUsername)) {
    return {
      available: false,
      error:
        'Username must be between 3 and 20 characters and contain only letters, numbers, and underscores.',
    };
  }

  if (isReservedUsername(cleanUsername)) {
    try {
      const supabase = await createClient();
      const verified = await getAvailableUsernameSuggestions(supabase, cleanUsername);
      const suggestions = verified && verified.length >= 2 ? verified : await generateUsernameSuggestions(cleanUsername);
      return {
        available: false,
        error: 'This username is reserved. Please choose another username.',
        suggestions,
      };
    } catch {
      return {
        available: false,
        error: 'This username is reserved. Please choose another username.',
        suggestions: await generateUsernameSuggestions(cleanUsername),
      };
    }
  }

  try {
    const supabase = await createClient();
    const { data: isAvailable, error } = await supabase.rpc(
      'fn_check_username_available',
      { p_username: cleanUsername }
    );

    if (error) {
      return {
        available: false,
        error: sanitizeUserFacingError(error, "We couldn't connect to SpendSense. Check your connection and try again."),
      };
    }

    if (!isAvailable) {
      const suggestions = await getAvailableUsernameSuggestions(supabase, cleanUsername);
      return {
        available: false,
        error: 'This username is already taken. Please choose another username.',
        suggestions,
      };
    }

    return { available: true };
  } catch (err: unknown) {
    return {
      available: false,
      error: sanitizeUserFacingError(err, "We couldn't connect to SpendSense. Check your connection and try again."),
    };
  }
}

/**
 * 8. Delete Account Action
 * Secure hard purge:
 * 1. Validates that confirmation equals 'DELETE'.
 * 2. Authenticates caller and verifies password if caller has an email identity.
 * 3. Calls atomic reverse-dependency database procedure fn_delete_own_account.
 * 4. Permanently deletes user from Supabase Auth via service-role admin if configured.
 * 5. Invalidates caller session and signs out.
 */
export async function deleteAccountAction(
  formData: FormData
): Promise<AuthActionResult> {
  const confirmation = (formData.get('confirmation') as string)?.trim();
  const password = (formData.get('password') as string) || '';

  if (confirmation !== 'DELETE') {
    return {
      error: 'You must type DELETE in capital letters to confirm account deletion.',
    };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        error: 'Active session required to delete account. Please sign in.',
      };
    }

    // Determine if account is an email/password account requiring password verification
    const isEmailUser =
      user.app_metadata?.provider === 'email' ||
      user.identities?.some((id) => id.provider === 'email');

    if (isEmailUser) {
      if (!password) {
        return {
          error: 'Current password is required to verify your identity and delete your account.',
        };
      }

      // Verify credentials using signInWithPassword
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email!,
        password,
      });

      if (verifyError) {
        return {
          error: 'Incorrect password. Account deletion aborted.',
        };
      }
    }

    // 1. Atomically delete all user financial records and profile data in reverse-dependency order
    const { error: rpcError } = await supabase.rpc('fn_delete_own_account');
    if (rpcError) {
      return {
        error: `Failed to purge account records: ${rpcError.message}`,
      };
    }

    // 2. If service role key is configured, permanently delete user from auth.users
    const serviceRoleKey = getServiceRoleKey();
    const supabaseUrl =
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (serviceRoleKey && supabaseUrl) {
      try {
        const { createClient: createServiceClient } = await import(
          '@supabase/supabase-js'
        );
        const adminClient = createServiceClient(supabaseUrl, serviceRoleKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        });
        await adminClient.auth.admin.deleteUser(user.id);
      } catch {
        // Continue; public schema data is already permanently purged
      }
    }

    // 3. Sign out caller session and invalidate cookies
    await supabase.auth.signOut();

    return {
      success: true,
      message: 'Your account and all associated financial records have been permanently deleted.',
      redirectUrl: '/login?message=account_deleted',
    };
  } catch (err: unknown) {
    return { error: sanitizeUserFacingError(err, 'An unexpected error occurred during account deletion.') };
  }
}


/**
 * Verify Current Account Password Action (Server Action)
 * Used for secure reauthentication before performing sensitive operations
 * such as exporting password-protected statements with account credentials.
 * 
 * - Authenticates against Supabase Auth without disclosing details.
 * - Never logs or stores the submitted password.
 * - Returns { valid: true } on success or { valid: false, error } on failure.
 */
export async function verifyCurrentPasswordAction(
  password: string
): Promise<{ valid: boolean; error?: string }> {
  const trimmed = typeof password === 'string' ? password.trim() : '';
  if (!trimmed) {
    return { valid: false, error: 'Please enter your account password.' };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user || !user.email) {
      return {
        valid: false,
        error: 'Your session has expired. Please sign in again.',
      };
    }

    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: trimmed,
    });

    if (verifyError) {
      return {
        valid: false,
        error: 'Incorrect account password. Please try again.',
      };
    }

    await markPasswordConfigured(supabase);

    return { valid: true };
  } catch (err: unknown) {
    return {
      valid: false,
      error: sanitizeUserFacingError(err, 'Password verification failed. Please try again.'),
    };
  }
}
