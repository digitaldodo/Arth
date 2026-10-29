import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/** Validate a native companion's explicit Supabase access token; never trust a body user id. */
export async function getNativeUser(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match) return { accessToken: null, userId: null, error: unauthorized() };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser(match[1]);
    if (error || !data.user) return { accessToken: null, userId: null, error: unauthorized() };
    return { accessToken: match[1], userId: data.user.id, error: null };
  } catch {
    return { accessToken: null, userId: null, error: unauthorized() };
  }
}

function unauthorized() {
  return NextResponse.json({ statusCode: 401, error: 'Unauthorized', message: 'Valid Arth sign-in required' }, {
    status: 401,
    headers: { 'Cache-Control': 'no-store' },
  });
}
