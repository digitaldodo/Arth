import { NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { getAppOrigin } from '@/lib/auth-config';
import { createClient } from '@/lib/supabase/server';
import { sanitizeUserFacingError } from '@/lib/error-utils';

export const dynamic = 'force-dynamic';

function buildNativeErrorPage(errorCode: string, message: string): Response {
  const safeTarget = `arth://auth/callback?error=${encodeURIComponent(errorCode)}&error_description=${encodeURIComponent(message)}`;
  const escapedMessage = message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return new Response(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Sign In Notice — SpendSense</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { background:#0C0A09; color:#F5F5F4; font-family:Inter,system-ui,sans-serif; display:grid; place-items:center; min-height:100vh; margin:0; padding:20px; box-sizing:border-box; }
    .card { width:min(100%,420px); background:#171513; border:1px solid #292524; border-radius:8px; padding:28px 24px; text-align:center; }
    h1 { font-size:18px; margin:0 0 8px; color:#FCA5A5; }
    p { font-size:14px; color:#A8A29E; line-height:1.5; margin:0 0 20px; }
    a { display:inline-block; background:#F5F5F4; color:#0C0A09; font-weight:600; font-size:14px; padding:11px 22px; border-radius:6px; text-decoration:none; }
  </style>
</head>
<body>
  <main class="card">
    <h1>Unable to Start Google Sign-In</h1>
    <p>${escapedMessage}</p>
    <a href="${safeTarget.replace(/"/g, '&quot;')}">Return to SpendSense</a>
  </main>
</body>
</html>`,
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
  );
}

/**
 * GET /api/native/auth/google
 * Initiates browser-based Google OAuth PKCE redirect flow for native Android fallback.
 * Explicitly captures PKCE code-verifier cookies onto the 307 redirect response.
 */
export async function GET(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      return buildNativeErrorPage(
        'auth_service_unavailable',
        'Authentication service is not configured in this environment.'
      );
    }

    const origin = getAppOrigin(request.headers);
    const callbackUrl = `${origin}/auth/native-callback`;
    const isHttps = origin.startsWith('https://');
    const pendingCookies: Array<{ name: string; value: string; options: CookieOptions }> = [];

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          const cookieHeader = request.headers.get('cookie') || '';
          if (!cookieHeader) return [];
          return cookieHeader.split(';').map((pair) => {
            const [name, ...rest] = pair.trim().split('=');
            return { name, value: rest.join('=') };
          });
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            pendingCookies.push({
              name,
              value,
              options: {
                ...options,
                httpOnly: true,
                secure: isHttps,
                sameSite: 'lax',
                path: '/',
              },
            });
          });
        },
      },
    });

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callbackUrl,
      },
    });

    if (error || !data.url) {
      const msg = sanitizeUserFacingError(error?.message, 'Unable to initialize Google sign-in.');
      return buildNativeErrorPage('auth_service_unavailable', msg);
    }

    const response = NextResponse.redirect(data.url);
    for (const c of pendingCookies) {
      response.cookies.set(c.name, c.value, c.options);
    }
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (err: unknown) {
    const msg = sanitizeUserFacingError(err, 'Unable to start Google sign-in.');
    return buildNativeErrorPage('auth_service_unavailable', msg);
  }
}

/**
 * POST /api/native/auth/google
 * Validates a Google ID token from Android Credential Manager natively with Supabase Auth.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const idToken = typeof body.id_token === 'string' ? body.id_token.trim() : '';
    const nonce = typeof body.nonce === 'string' && body.nonce.trim().length > 0 ? body.nonce.trim() : undefined;

    if (!idToken) {
      return NextResponse.json(
        { error: 'id_token is required', code: 'MISSING_ID_TOKEN' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
      nonce,
    });

    if (error || !data.session) {
      const lower = (error?.message || '').toLowerCase();
      const isUpstreamDown =
        lower.includes('fetch failed') ||
        lower.includes('enotfound') ||
        lower.includes('econnrefused') ||
        lower.includes('etimedout');
      return NextResponse.json(
        {
          error: sanitizeUserFacingError(error?.message, 'Google ID token validation failed'),
          code: isUpstreamDown ? 'SERVICE_UNAVAILABLE' : 'INVALID_GOOGLE_TOKEN',
        },
        { status: isUpstreamDown ? 503 : 401, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    return NextResponse.json(
      {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        user: {
          id: data.session.user.id,
          email: data.session.user.email,
        },
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err: unknown) {
    const msg = sanitizeUserFacingError(err, 'Google authentication error');
    const isConfig = err instanceof Error && err.message.includes('Missing Supabase credentials');
    return NextResponse.json(
      { error: msg, code: isConfig ? 'CONFIGURATION_ERROR' : 'SERVER_ERROR' },
      { status: isConfig ? 503 : 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
