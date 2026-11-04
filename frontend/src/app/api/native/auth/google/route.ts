import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAppOrigin } from '@/lib/auth-config';

export const dynamic = 'force-dynamic';

/**
 * GET /api/native/auth/google
 * Initiates browser-based Google OAuth redirect flow (fallback).
 */
export async function GET(request: Request) {
  try {
    const origin = getAppOrigin(request.headers);
    const callbackUrl = `${origin}/auth/native-callback`;

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callbackUrl,
      },
    });

    if (error || !data.url) {
      return NextResponse.json(
        { error: error?.message || 'Failed to initialize Google OAuth' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    return NextResponse.redirect(data.url);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'OAuth initialization error';
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

/**
 * POST /api/native/auth/google
 * Validates a Google ID token from Android Credential Manager natively with Supabase Auth.
 * Returns authoritative session tokens without opening an external browser.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const idToken = typeof body.id_token === 'string' ? body.id_token.trim() : '';
    const nonce = typeof body.nonce === 'string' && body.nonce.trim().length > 0 ? body.nonce.trim() : undefined;

    if (!idToken) {
      return NextResponse.json(
        { error: 'id_token is required' },
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
      return NextResponse.json(
        { error: error?.message || 'Google ID token validation failed' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
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
    const message = err instanceof Error ? err.message : 'Google authentication error';
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
