import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

/**
 * Handles user sign-out, invalidating the session and authoritatively clearing
 * all HTTP-only session and auth cookies.
 * Supports both AJAX/JSON clients and direct browser form navigations.
 */
async function performSignOut(request: Request) {
  const requestUrl = new URL(request.url);
  const acceptHeader = request.headers.get('accept') || '';
  const isJson = acceptHeader.includes('application/json');

  const redirectUrl = new URL('/login', requestUrl.origin);
  const response = isJson
    ? NextResponse.json({ ok: true, status: 'UNAUTHENTICATED' }, { status: 200 })
    : NextResponse.redirect(redirectUrl, { status: 303 });

  // 1. Invalidate remote session and bind Set-Cookie deletions to the outgoing response
  try {
    const supabase = await createClient(response);
    await supabase.auth.signOut();
  } catch {
    // If remote sign-out fails (e.g. network partition or expired token),
    // proceed to clear local cookies authoritatively.
  }

  // 2. Explicitly clear all Supabase and authentication cookies on response and cookieStore
  try {
    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll();
    for (const cookie of allCookies) {
      const name = cookie.name;
      if (
        name.startsWith('sb-') ||
        name.includes('auth') ||
        name.includes('token') ||
        name.includes('session')
      ) {
        const expiredCookieOptions = {
          path: '/',
          maxAge: 0,
          expires: new Date(0),
          httpOnly: true,
          sameSite: 'lax' as const,
          secure: process.env.NODE_ENV === 'production',
        };
        response.cookies.set(name, '', expiredCookieOptions);
        try {
          cookieStore.set(name, '', expiredCookieOptions);
        } catch {
          // Ignore if cookieStore is read-only in this context
        }
      }
    }
  } catch {
    // Best-effort cookie iteration
  }

  return response;
}

export async function POST(request: Request) {
  return performSignOut(request);
}

export async function GET(request: Request) {
  return performSignOut(request);
}
