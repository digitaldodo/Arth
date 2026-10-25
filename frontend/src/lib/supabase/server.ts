import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';

/**
 * Creates an authoritative server-side Supabase client using Next.js asynchronous cookies().
 * Configures secure, HTTP-only session cookies with Lax same-site policy.
 * Optionally binds cookie mutations directly to an outgoing NextResponse to ensure
 * Set-Cookie headers are delivered on 307/302 redirects in Route Handlers.
 * Gracefully handles standalone test contexts where next/headers is evaluated outside request scope.
 */
export async function createClient(
  response?: NextResponse,
  initialCookies?: { name: string; value: string }[]
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing Supabase credentials: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be defined.'
    );
  }

  const inMemoryCookies: { name: string; value: string }[] = initialCookies
    ? [...initialCookies]
    : [];

  let cookieStore: {
    getAll: () => { name: string; value: string }[];
    set: (name: string, value: string, options: CookieOptions) => void;
  };

  try {
    cookieStore = await cookies();
  } catch {
    // When evaluated outside of Next.js server request scope (e.g., in unit tests)
    cookieStore = {
      getAll: () => inMemoryCookies,
      set: (name, value) => {
        const existingIdx = inMemoryCookies.findIndex((c) => c.name === name);
        if (existingIdx >= 0) {
          inMemoryCookies[existingIdx].value = value;
        } else {
          inMemoryCookies.push({ name, value });
        }
      },
    };
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            const secureCookieOptions: CookieOptions = {
              ...options,
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax',
              path: '/',
            };
            cookieStore.set(name, value, secureCookieOptions);
            if (response) {
              response.cookies.set(name, value, secureCookieOptions);
            }
          });
        } catch {
          // setAll called from Server Component context where cookie mutation is restricted.
          // Ignored safely as session refresh is handled in Route Handlers or middleware.
        }
      },
    },
  });
}
