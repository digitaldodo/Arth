import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAppOrigin, getAuthCallbackUrl } from '@/lib/auth-config';
import { resolveEmailFromUsername } from '@/app/login/actions';
import { sanitizeUserFacingError } from '@/lib/error-utils';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const rawIdentifier = (
      typeof body.identifier === 'string'
        ? body.identifier
        : typeof body.email === 'string'
        ? body.email
        : typeof body.username === 'string'
        ? body.username
        : ''
    ).trim();

    if (!rawIdentifier) {
      return NextResponse.json(
        { error: 'Email or username is required' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    let targetEmail = '';
    if (rawIdentifier.includes('@')) {
      targetEmail = rawIdentifier.toLowerCase();
    } else {
      const resolved = await resolveEmailFromUsername(rawIdentifier.toLowerCase());
      if (resolved) {
        targetEmail = resolved;
      }
    }

    if (targetEmail) {
      const origin = getAppOrigin(request.headers);
      const callbackUrl = getAuthCallbackUrl(origin);
      const supabase = await createClient();

      await supabase.auth.resetPasswordForEmail(targetEmail, {
        redirectTo: `${callbackUrl}?next=/auth/update-password`,
      });
    }

    // Always report uniform success to prevent account enumeration
    return NextResponse.json(
      {
        message: 'If an account exists with this credential, a password reset link has been dispatched to its registered email.',
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { error: sanitizeUserFacingError(err, 'Unable to process password reset. Please try again.') },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
