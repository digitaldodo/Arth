import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Server-only configuration and safe proxy utilities for Next.js Route Handlers.
 */

export interface AuthenticatedSessionResult {
  accessToken: string | null;
  userId: string | null;
  errorResponse?: NextResponse;
}

/**
 * Authoritatively retrieves the caller's verified Supabase access token for BFF proxying.
 * Uses supabase.auth.getUser() to validate the token against the Supabase Auth server,
 * refreshing expired session tokens automatically in cookies if needed.
 */
export async function getAuthenticatedSession(): Promise<AuthenticatedSessionResult> {
  try {
    const supabase = await createClient();

    // Authoritatively validate user and refresh tokens if expired
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        accessToken: null,
        userId: null,
        errorResponse: NextResponse.json(
          {
            statusCode: 401,
            error: 'Unauthorized',
            message: 'Active session required',
          },
          { status: 401 }
        ),
      };
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const accessToken = session?.access_token || null;
    if (!accessToken) {
      return {
        accessToken: null,
        userId: user.id,
        errorResponse: NextResponse.json(
          {
            statusCode: 401,
            error: 'Unauthorized',
            message: 'Active session required',
          },
          { status: 401 }
        ),
      };
    }

    return { accessToken, userId: user.id };
  } catch {
    return {
      accessToken: null,
      userId: null,
      errorResponse: NextResponse.json(
        {
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Active session required',
        },
        { status: 401 }
      ),
    };
  }
}

/**
 * Returns the configured base URL for internal Fastify backend API requests.
 * In production, strictly requires INTERNAL_API_URL or NEXT_PUBLIC_API_URL.
 * In development / test, falls back to http://localhost:3001.
 */
export function getBackendBaseUrl(): string {
  const configured =
    process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL;

  if (configured && configured.trim().length > 0) {
    return configured.trim().replace(/\/+$/, '');
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'INTERNAL_API_URL environment variable is required in production but is not set'
    );
  }

  return 'http://localhost:3001';
}

/**
 * Generates a safe, sanitized gateway error response.
 * Prevents leaking internal URLs, credentials, network addresses, or stack traces to client browsers.
 */
export function safeBackendErrorResponse(
  err: unknown,
  context: string,
  statusCode = 502
): NextResponse {
  // Safe server-side diagnostic logging (no tokens or sensitive payloads logged)
  const errorMessage = err instanceof Error ? err.message : 'Unknown gateway error';
  console.error(`[BFF Proxy Error: ${context}]`, errorMessage);

  return NextResponse.json(
    {
      statusCode,
      error: statusCode === 503 ? 'Service Unavailable' : 'Bad Gateway',
      message: 'Backend service is currently unavailable. Please try again shortly.',
    },
    { status: statusCode }
  );
}
