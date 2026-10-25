'use server';

import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import {
  getAppOrigin,
  getAuthCallbackUrl,
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

/**
 * 1. Email and Password Sign In Action
 */
export async function signInWithEmailAction(
  formData: FormData
): Promise<AuthActionResult> {
  const email = (formData.get('email') as string)?.trim().toLowerCase();
  const password = formData.get('password') as string;

  if (!email || !isValidEmail(email)) {
    return { error: 'Please enter a valid email address.' };
  }

  if (!password) {
    return { error: 'Please enter your password.' };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        return {
          error:
            'Invalid email address or password. Please verify your credentials and try again.',
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
 * 2. Account Registration Action (Sign Up)
 */
export async function signUpWithEmailAction(
  formData: FormData
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

  try {
    const headersList = await headers();
    const origin = getAppOrigin(headersList);
    const callbackUrl = getAuthCallbackUrl(origin);
    const supabase = await createClient();

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
          full_name: username,
        },
        emailRedirectTo: `${callbackUrl}?next=/`,
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

    // If email confirmation is required
    return {
      success: true,
      needsConfirmation: true,
      message:
        'Account created! A confirmation link has been sent to your email address. Please confirm your email to complete registration.',
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Registration failed';
    return { error: message };
  }
}

/**
 * 3. Password Reset Request Action
 */
export async function requestPasswordResetAction(
  formData: FormData
): Promise<AuthActionResult> {
  const email = (formData.get('email') as string)?.trim().toLowerCase();

  if (!email || !isValidEmail(email)) {
    return { error: 'Please enter a valid email address.' };
  }

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
