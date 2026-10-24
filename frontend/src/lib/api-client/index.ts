import type { AuthIdentityResponse, HealthCheckResponse } from '@arth/contracts';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Checks the operational status of the Arth backend service directly.
 */
export async function fetchHealthStatus(): Promise<HealthCheckResponse> {
  const response = await fetch(`${API_BASE_URL}/health`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Health check failed with HTTP status ${response.status}`);
  }

  return response.json();
}

/**
 * Fetches the currently authenticated user identity through the secure BFF proxy.
 * The browser calls the local Next.js proxy (/api/backend/auth/me), which reads
 * the HTTP-only session cookie and communicates securely with Fastify.
 */
export async function fetchCurrentUser(): Promise<AuthIdentityResponse | null> {
  try {
    const response = await fetch('/api/backend/auth/me', {
      cache: 'no-store',
    });

    if (response.status === 401) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch user identity: ${response.status}`);
    }

    return response.json();
  } catch {
    return null;
  }
}
