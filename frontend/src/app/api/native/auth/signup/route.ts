import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAppOrigin, getAuthConfirmUrl } from '@/lib/auth-config';
import {
  isValidUsername,
  isReservedUsername,
  generateRandomCandidateUsername,
} from '@/lib/username';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const rawUsername = typeof body.username === 'string' ? body.username.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { error: 'Valid email address is required' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (!password || password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters in length' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    let normalizedUsername: string;
    if (rawUsername) {
      if (!isValidUsername(rawUsername)) {
        return NextResponse.json(
          { error: 'Username must be 3-20 characters and contain only lowercase letters, numbers, and underscores' },
          { status: 400, headers: { 'Cache-Control': 'no-store' } }
        );
      }
      normalizedUsername = rawUsername.toLowerCase();
      if (isReservedUsername(normalizedUsername)) {
        return NextResponse.json(
          { error: 'This username is reserved. Please choose another username.' },
          { status: 400, headers: { 'Cache-Control': 'no-store' } }
        );
      }
    } else {
      normalizedUsername = generateRandomCandidateUsername();
    }

    const origin = getAppOrigin(request.headers);
    const confirmUrl = getAuthConfirmUrl(origin);
    const supabase = await createClient();

    // Check availability
    if (rawUsername) {
      const { data: isAvailable } = await supabase.rpc('fn_check_username_available', {
        p_username: normalizedUsername,
      });
      if (isAvailable === false) {
        return NextResponse.json(
          { error: 'This username is already taken. Please choose another username.' },
          { status: 400, headers: { 'Cache-Control': 'no-store' } }
        );
      }
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: normalizedUsername,
        },
        emailRedirectTo: confirmUrl,
      },
    });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (data.session) {
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
    }

    return NextResponse.json(
      {
        needsConfirmation: true,
        message: 'Account created. Please check your email to activate your account.',
      },
      { status: 201, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Registration error';
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
