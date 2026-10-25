import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getAppOrigin,
  sanitizeRedirectPath,
} from '@/lib/auth-config';

export const dynamic = 'force-dynamic';

/**
 * Handles the OAuth PKCE callback from Supabase Auth.
 * Exchanges the temporary authorization code for an authoritative session in HTTP-only cookies.
 * Redirects the user to the intended destination without leaving authorization codes in the URL.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next');
  const errorParam = requestUrl.searchParams.get('error');
  const errorDescription = requestUrl.searchParams.get('error_description');

  const origin = getAppOrigin(request.headers);
  const safeNext = sanitizeRedirectPath(next, '/');

  // Handle OAuth provider error response (e.g. user cancelled or access denied)
  if (errorParam) {
    const redirectUrl = new URL('/login', origin);
    redirectUrl.searchParams.set('error', errorParam);
    if (errorDescription) {
      redirectUrl.searchParams.set('error_description', errorDescription);
    }
    return NextResponse.redirect(redirectUrl);
  }

  // Handle missing code
  if (!code) {
    return NextResponse.redirect(
      new URL('/login?error=missing_authorization_code', origin)
    );
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      const redirectUrl = new URL('/login', origin);
      redirectUrl.searchParams.set('error', 'auth_exchange_failed');
      redirectUrl.searchParams.set('error_description', error.message);
      return NextResponse.redirect(redirectUrl);
    }

    // Successful exchange: session is saved in HTTP-only cookies.
    // Redirect to safe internal destination without exposing authorization code.
    return NextResponse.redirect(new URL(safeNext, origin));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'auth_exchange_failed';
    const redirectUrl = new URL('/login', origin);
    redirectUrl.searchParams.set('error', 'auth_exchange_failed');
    redirectUrl.searchParams.set('error_description', message);
    return NextResponse.redirect(redirectUrl);
  }
}
