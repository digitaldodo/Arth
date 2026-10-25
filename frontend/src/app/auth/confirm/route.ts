import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import {
  getAppOrigin,
  sanitizeRedirectPath,
} from '@/lib/auth-config';

export const dynamic = 'force-dynamic';

function parseIncomingCookies(request: Request): { name: string; value: string }[] {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return [];
  return cookieHeader.split(';').map((pair) => {
    const [name, ...rest] = pair.trim().split('=');
    return { name, value: rest.join('=') };
  });
}

/**
 * Handles the email confirmation verification callback from Supabase Auth.
 * Supports the SSR PKCE token-hash flow (token_hash + type) via supabase.auth.verifyOtp.
 * Also supports legacy code exchange if a code parameter is supplied.
 * Establishes an authoritative user session in HTTP-only cookies and redirects to a safe internal path.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const token_hash = requestUrl.searchParams.get('token_hash');
  const typeParam = requestUrl.searchParams.get('type');
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next');
  const errorParam = requestUrl.searchParams.get('error');
  const errorDescription = requestUrl.searchParams.get('error_description');

  const origin = getAppOrigin(request.headers);
  const safeNext = sanitizeRedirectPath(next, '/');

  // Handle provider error response
  if (errorParam) {
    const redirectUrl = new URL('/login', origin);
    redirectUrl.searchParams.set('error', errorParam);
    if (errorDescription) {
      redirectUrl.searchParams.set('error_description', errorDescription);
    }
    return NextResponse.redirect(redirectUrl);
  }

  // Handle missing token_hash and code
  if (!token_hash && !code) {
    return NextResponse.redirect(
      new URL('/login?error=missing_confirmation_token', origin)
    );
  }

  try {
    const redirectTarget = new URL(safeNext, origin);
    const response = NextResponse.redirect(redirectTarget);
    const incomingCookies = parseIncomingCookies(request);
    const supabase = await createClient(response, incomingCookies);

    let verifyError: { message: string } | null = null;

    if (token_hash) {
      const otpType = (typeParam as EmailOtpType) || 'email';
      const { error } = await supabase.auth.verifyOtp({
        type: otpType,
        token_hash,
      });
      verifyError = error;
    } else if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      verifyError = error;
    }

    if (verifyError) {
      const redirectUrl = new URL('/login', origin);
      redirectUrl.searchParams.set('error', 'confirmation_failed');
      redirectUrl.searchParams.set('error_description', verifyError.message);
      return NextResponse.redirect(redirectUrl);
    }

    // Successful confirmation: session cookies are stamped directly on response.
    // Redirect user to internal authenticated destination without exposing token.
    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'confirmation_failed';
    const redirectUrl = new URL('/login', origin);
    redirectUrl.searchParams.set('error', 'confirmation_failed');
    redirectUrl.searchParams.set('error_description', message);
    return NextResponse.redirect(redirectUrl);
  }
}
