import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Handles user sign-out, invalidating the session and clearing HTTP-only cookies.
 */
export async function POST(request: Request) {
  const requestUrl = new URL(request.url);

  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // If sign-out fails on remote, we still redirect to login and clear cookies
  }

  return NextResponse.redirect(new URL('/login', requestUrl.origin), {
    status: 303, // See Other for redirect after POST
  });
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);

  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // Ignore error and proceed with redirect
  }

  return NextResponse.redirect(new URL('/login', requestUrl.origin));
}
