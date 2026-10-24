import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Handles the OAuth PKCE callback from Supabase Auth.
 * Exchanges the temporary authorization code for an authoritative session in HTTP-only cookies.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next') ?? '/';
  const errorParam = requestUrl.searchParams.get('error');
  const errorDescription = requestUrl.searchParams.get('error_description');

  // Prevent open redirect vulnerabilities: next destination must be a local relative path
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';

  if (errorParam) {
    const errorMsg = errorDescription || errorParam;
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(errorMsg)}`, requestUrl.origin)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL('/login?error=missing_authorization_code', requestUrl.origin)
    );
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error.message)}`, requestUrl.origin)
      );
    }

    return NextResponse.redirect(new URL(safeNext, requestUrl.origin));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'auth_exchange_failed';
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(message)}`, requestUrl.origin)
    );
  }
}
