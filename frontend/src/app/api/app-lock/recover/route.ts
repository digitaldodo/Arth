import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { hasReasonableBodySize, isSameOriginRequest } from '@/lib/app-lock/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Request could not be verified.' }, {
      status: 403,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  }
  if (!hasReasonableBodySize(request)) {
    return NextResponse.json({ error: 'Request is too large.' }, {
      status: 413,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  }

  const response = NextResponse.json({ signedOut: true }, {
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
  try {
    const supabase = await createClient(response);
    const { error } = await supabase.auth.signOut();
    if (error) {
      return NextResponse.json({ error: 'Sign out could not be completed. Arth remains locked.' }, {
        status: 503,
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      });
    }
    return response;
  } catch {
    return NextResponse.json({ error: 'Sign out could not be completed. Arth remains locked.' }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  }
}
