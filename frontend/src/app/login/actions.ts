'use server';

import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import {
  getAppOrigin,
  getAuthCallbackUrl,
  getAuthConfirmUrl,
} from '@/lib/auth-config';

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
 * Username validation: 3-30 characters, alphanumeric, underscores, hyphens.
 */
function isValidUsername(username: string): boolean {
  return /^[a-zA-Z0-9_-]{3,30}$/.test(username);
}

/**
 * Password strength validation: minimum 8 characters.
 */
function isValidPassword(password: string): boolean {
  return typeof password === 'string' && password.length >= 8;
}

function hasServiceRoleKey(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
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
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!serviceRoleKey || !supabaseUrl) {
    return null;
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

    if (error || !email || typeof email !== 'string') {
      return null;
    }

    return email.trim().toLowerCase();
  } catch {
    return null;
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

    targetEmail = await resolveEmailFromUsername(normalizedUsername);

    if (!targetEmail) {
      if (!hasServiceRoleKey()) {
        return {
          error:
            'Username login requires server configuration (SUPABASE_SERVICE_ROLE_KEY). Please sign in using your registered email address.',
        };
      }
      // Generic authentication failure to prevent username enumeration
      return {
        error:
          'Invalid email, username, or password. Please verify your credentials and try again.',
      };
    }
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
      return {
        error: error.message || 'Unable to sign in. Please try again.',
      };
    }

    if (data.session) {
      return { success: true, redirectUrl: '/' };
    }

    return { success: true, redirectUrl: '/' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Sign-in failed';
    return { error: message };
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
  const username = (formData.get('username') as string)?.trim();
  const email = (formData.get('email') as string)?.trim().toLowerCase();
  const password = formData.get('password') as string;
  const confirmPassword = formData.get('confirmPassword') as string;

  if (!username || !isValidUsername(username)) {
    return {
      error:
        'Username must be between 3 and 30 characters and contain only letters, numbers, underscores, or hyphens.',
    };
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

  const normalizedUsername = username.toLowerCase();

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

    // Verify username availability prior to creation
    const { data: isAvailable, error: checkError } = await supabase.rpc(
      'fn_check_username_available',
      { p_username: normalizedUsername }
    );

    if (!checkError && isAvailable === false) {
      return {
        error: 'This username is already taken. Please choose another username.',
      };
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: normalizedUsername,
          full_name: username,
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
      return {
        error: error.message || 'Registration failed. Please try again.',
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
        'Account created! A confirmation link has been sent to your email address. Please check your email to confirm your account.',
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Registration failed';
    return { error: message };
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
    }

    // Uniform response to prevent account enumeration
    return {
      success: true,
      message:
        'If an unconfirmed account exists with this email address, a new confirmation link has been sent to your inbox.',
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Unable to resend confirmation email';
    return { error: message };
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

    return {
      success: true,
      redirectUrl: '/',
      message: 'Your password has been successfully updated.',
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Password update failed';
    return { error: message };
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
      return { error: error.message };
    }

    if (data.url) {
      return { url: data.url };
    }

    return { error: 'Unable to initiate Google sign-in. Please try again.' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'OAuth error';
    return { error: message };
  }
}

/**
 * 6. Set / Claim Username Action (for authenticated users e.g. Google OAuth or legacy accounts)
 */
export async function setUsernameAction(
  formData: FormData
): Promise<AuthActionResult> {
  const rawUsername = (formData.get('username') as string)?.trim();

  if (!rawUsername || !isValidUsername(rawUsername)) {
    return {
      error:
        'Username must be between 3 and 30 characters and contain only letters, numbers, underscores, or hyphens.',
    };
  }

  const normalizedUsername = rawUsername.toLowerCase();

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
        return {
          error: 'This username is already taken. Please choose another username.',
        };
      }
      return {
        error: rpcError.message || 'Failed to update username. Please try again.',
      };
    }

    return {
      success: true,
      message: 'Your username has been set successfully.',
      redirectUrl: '/',
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Failed to update username';
    return { error: message };
  }
}

/**
 * 7. Check Username Availability Action
 */
export async function checkUsernameAvailabilityAction(
  username: string
): Promise<{ available: boolean; error?: string }> {
  const cleanUsername = username?.trim().toLowerCase();
  if (!cleanUsername || !isValidUsername(cleanUsername)) {
    return {
      available: false,
      error:
        'Username must be between 3 and 30 characters and contain only letters, numbers, underscores, or hyphens.',
    };
  }

  try {
    const supabase = await createClient();
    const { data: isAvailable, error } = await supabase.rpc(
      'fn_check_username_available',
      { p_username: cleanUsername }
    );

    if (error) {
      return { available: false, error: error.message };
    }

    return { available: Boolean(isAvailable) };
  } catch {
    return { available: false, error: 'Failed to verify availability' };
  }
}
