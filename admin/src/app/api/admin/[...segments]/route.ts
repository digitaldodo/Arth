import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ADMIN_SESSION_COOKIE, getBackendBaseUrl } from '@/lib/admin-session';

const ALLOWED_EXACT_PATHS = new Set([
  'auth/login',
  'auth/logout',
  'auth/me',
  'auth/activation/submit-email',
  'auth/activation/verify-email',
  'auth/activation/complete',
  'auth/forgot-password',
  'auth/reset-password',
  'auth/change-password',
  'auth/change-email',
  'access',
  'overview',
  'users',
  'capture',
  'system',
  'releases',
  'audit',
]);

function isAllowedAdminProxyPath(joined: string): boolean {
  if (ALLOWED_EXACT_PATHS.has(joined)) return true;
  return /^access\/[a-zA-Z0-9_-]+\/(disable|enable|role|email-approval|reset-password|activity)$/.test(
    joined,
  );
}

/**
 * Pure helper exported for security & cookie-stripping unit tests as well as route execution.
 */
export function sanitizeAdminBackendPayload(payload: unknown): {
  safePayload: unknown;
  sessionToken: string | null;
} {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { safePayload: payload, sessionToken: null };
  }
  const clone = { ...(payload as Record<string, unknown>) };
  const sessionToken = typeof clone.sessionToken === 'string' && clone.sessionToken.length > 0
    ? clone.sessionToken
    : null;
  if ('sessionToken' in clone) {
    delete clone.sessionToken;
  }
  return { safePayload: clone, sessionToken };
}

async function handleProxy(
  req: NextRequest,
  context: { params: Promise<{ segments: string[] }> },
): Promise<NextResponse> {
  const { segments } = await context.params;
  const joined = (segments || []).join('/');

  if (!isAllowedAdminProxyPath(joined)) {
    return NextResponse.json({ error: 'NOT_FOUND', message: 'Unknown admin endpoint.' }, { status: 404 });
  }

  const cookieStore = await cookies();
  const existingToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value || '';
  const query = req.nextUrl.search || '';
  const targetUrl = `${getBackendBaseUrl()}/api/v1/admin/${joined}${query}`;

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (existingToken) {
    headers.Authorization = `Bearer ${existingToken}`;
  }
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    headers['x-forwarded-for'] = forwardedFor;
  }

  let bodyText: string | undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const contentType = req.headers.get('content-type') || 'application/json';
    headers['Content-Type'] = contentType;
    bodyText = await req.text();
  }

  try {
    const backendRes = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: bodyText,
      cache: 'no-store',
    });

    const rawText = await backendRes.text();
    let parsed: unknown = {};
    if (rawText) {
      try {
        parsed = JSON.parse(rawText);
      } catch {
        parsed = { message: rawText };
      }
    }

    const { safePayload, sessionToken } = sanitizeAdminBackendPayload(parsed);
    const nextRes = NextResponse.json(safePayload, { status: backendRes.status });

    if (joined === 'auth/logout' || backendRes.status === 401) {
      nextRes.cookies.set(ADMIN_SESSION_COOKIE, '', {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 0,
      });
    } else if (sessionToken && backendRes.ok) {
      nextRes.cookies.set(ADMIN_SESSION_COOKIE, sessionToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60 * 8,
      });
    }

    return nextRes;
  } catch {
    return NextResponse.json(
      { error: 'BACKEND_UNAVAILABLE', message: 'Shared SpendSense backend is currently offline.' },
      { status: 503 },
    );
  }
}

export const GET = handleProxy;
export const POST = handleProxy;
