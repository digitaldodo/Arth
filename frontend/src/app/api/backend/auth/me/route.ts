import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Narrowly scoped, authenticated BFF proxy endpoint for the identity route (GET /api/v1/auth/me).
 * Obtains the session access token on the server and forwards it to the Fastify backend as a Bearer token.
 * Never forwards browser cookies or refresh tokens to Fastify.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session?.access_token) {
      return NextResponse.json(
        {
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Active session required',
        },
        { status: 401 }
      );
    }

    const backendBaseUrl =
      process.env.INTERNAL_API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      'http://localhost:3001';

    const backendResponse = await fetch(`${backendBaseUrl}/api/v1/auth/me`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    const data = await backendResponse.json();

    return NextResponse.json(data, {
      status: backendResponse.status,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Backend proxy error';
    return NextResponse.json(
      {
        statusCode: 502,
        error: 'Bad Gateway',
        message,
      },
      { status: 502 }
    );
  }
}
