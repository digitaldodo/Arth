import { NextResponse } from 'next/server';

/**
 * Server-only configuration and safe proxy utilities for Next.js Route Handlers.
 */

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
