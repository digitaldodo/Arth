import { cookies } from 'next/headers';
import type { AdminIdentityDTO } from '@arth/contracts';

export const ADMIN_SESSION_COOKIE = 'spendsense_admin_session';

export function getBackendBaseUrl(): string {
  const raw = process.env.ADMIN_BACKEND_URL || 'http://127.0.0.1:3001';
  return raw.replace(/\/+$/, '');
}

export async function getSessionCookieToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(ADMIN_SESSION_COOKIE)?.value || null;
}

export interface ServerSessionResolution {
  status: 'authenticated' | 'unauthenticated' | 'backend_unavailable';
  identity: AdminIdentityDTO | null;
}

/**
 * Resolves the active administrator identity strictly on the server via the Fastify backend.
 * Returns no identity if cookie is absent, revoked, disabled, or invalid.
 */
export async function getServerAdminSession(): Promise<ServerSessionResolution> {
  const token = await getSessionCookieToken();
  if (!token) {
    return { status: 'unauthenticated', identity: null };
  }

  try {
    const res = await fetch(`${getBackendBaseUrl()}/api/v1/admin/auth/me`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      return { status: 'unauthenticated', identity: null };
    }

    const identity = (await res.json()) as AdminIdentityDTO;
    return { status: 'authenticated', identity };
  } catch {
    return { status: 'backend_unavailable', identity: null };
  }
}

export async function fetchBackendWithAdminSession<T>(path: string): Promise<{
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
}> {
  const token = await getSessionCookieToken();
  if (!token) {
    return { ok: false, status: 401, data: null, error: 'Missing admin session' };
  }

  try {
    const res = await fetch(`${getBackendBaseUrl()}/api/v1/admin${path}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      let errMsg = `Request failed (${res.status})`;
      try {
        const body = (await res.json()) as { message?: string };
        if (body?.message) errMsg = body.message;
      } catch {
        // Ignore parse failure
      }
      return { ok: false, status: res.status, data: null, error: errMsg };
    }

    const data = (await res.json()) as T;
    return { ok: true, status: res.status, data };
  } catch {
    return { ok: false, status: 503, data: null, error: 'Shared Fastify backend is unreachable.' };
  }
}
