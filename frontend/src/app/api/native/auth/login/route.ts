import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isValidUsername } from '@/lib/username';
import { lookupEmailByUsername } from '@/app/login/actions';
import { sanitizeUserFacingError } from '@/lib/error-utils';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const rawIdentifier = (
      typeof body.identifier === 'string'
        ? body.identifier
        : typeof body.username === 'string'
        ? body.username
        : typeof body.email === 'string'
        ? body.email
        : ''
    ).trim();

    const password = typeof body.password === 'string' ? body.password : '';

    if (!rawIdentifier || !password) {
      return NextResponse.json(
        { error: 'Email or username and password are required' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    let targetEmail = '';
    if (rawIdentifier.includes('@')) {
      targetEmail = rawIdentifier.toLowerCase();
    } else {
      // Input is a username
      const normalizedUsername = rawIdentifier.toLowerCase();
      if (!isValidUsername(normalizedUsername)) {
        return NextResponse.json(
          { error: 'Invalid email, username, or password. Please verify your credentials and try again.' },
          { status: 401, headers: { 'Cache-Control': 'no-store' } }
        );
      }

      const lookup = await lookupEmailByUsername(normalizedUsername);
      if (lookup.status === 'unavailable') {
        return NextResponse.json(
          { error: 'Username sign-in is temporarily unavailable. Please sign in with your registered email address or try again shortly.' },
          { status: 503, headers: { 'Cache-Control': 'no-store' } }
        );
      }
      if (lookup.status === 'not_found') {
        return NextResponse.json(
          { error: 'Invalid email, username, or password. Please verify your credentials and try again.' },
          { status: 401, headers: { 'Cache-Control': 'no-store' } }
        );
      }
      targetEmail = lookup.email;
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: targetEmail,
      password,
    });

    if (error || !data.session) {
      if (error) {
        const correlationId = `native_auth_err_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        console.error(`[Native Auth Error ${correlationId}]:`, error.message);

        if (
          error.message.includes('Invalid login credentials') ||
          error.message.includes('invalid_grant')
        ) {
          return NextResponse.json(
            { error: 'Invalid email, username, or password. Please verify your credentials and try again.' },
            { status: 401, headers: { 'Cache-Control': 'no-store' } }
          );
        }
        if (error.message.includes('Email not confirmed')) {
          return NextResponse.json(
            { error: 'Your email address has not been confirmed yet. Please check your inbox for the confirmation link.' },
            { status: 403, headers: { 'Cache-Control': 'no-store' } }
          );
        }
        if (error.status === 429 || error.message.includes('rate')) {
          return NextResponse.json(
            { error: 'Too many sign-in attempts. Please wait a few moments before trying again.' },
            { status: 429, headers: { 'Cache-Control': 'no-store' } }
          );
        }
        return NextResponse.json(
          { error: sanitizeUserFacingError(error.message, 'Unable to sign in. Please verify your credentials and try again.') },
          { status: error.status && error.status >= 500 ? 503 : 401, headers: { 'Cache-Control': 'no-store' } }
        );
      }
      return NextResponse.json(
        { error: 'Invalid email, username, or password. Please verify your credentials and try again.' },
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
    const correlationId = `native_auth_catch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    console.error(`[Native Auth Exception ${correlationId}]:`, err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { error: sanitizeUserFacingError(err, 'Unable to sign in. Please try again.') },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
