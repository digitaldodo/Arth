import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAppOrigin } from '@/lib/auth-config';

export const dynamic = 'force-dynamic';

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
