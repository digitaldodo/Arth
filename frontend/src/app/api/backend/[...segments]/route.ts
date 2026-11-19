import { NextResponse, type NextRequest } from 'next/server';
import { getBackendBaseUrl, getAuthenticatedSession, safeBackendErrorResponse } from '@/lib/server-config';

const ALLOWED = [
  /^financial\/accounts$/,
  /^financial\/transaction-links$/,
  /^financial\/transaction-links\/[0-9a-f-]{36}\/reject$/i,
  /^financial\/import-batches$/,
  /^financial\/import-batches\/[0-9a-f-]{36}\/undo$/i,
  /^financial\/documents$/,
  /^financial\/documents\/[0-9a-f-]{36}$/i,
  /^financial\/documents\/[0-9a-f-]{36}\/fields$/i,
  /^financial\/documents\/[0-9a-f-]{36}\/fields\/[0-9a-f-]{36}$/i,
  /^tax\/profiles$/,
  /^tax\/estimate$/,
];

async function proxy(req: NextRequest, context: { params: Promise<{ segments: string[] }> }) {
  try {
    const { accessToken, errorResponse } = await getAuthenticatedSession();
    if (errorResponse || !accessToken) return errorResponse || NextResponse.json({ error: 'Active session required' }, { status: 401 });
    const { segments } = await context.params;
    const path = segments.join('/');
    if (!ALLOWED.some((pattern) => pattern.test(path))) return NextResponse.json({ error: 'Route not found.' }, { status: 404 });
    const method = req.method;
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return NextResponse.json({ error: 'Method not allowed.' }, { status: 405 });
    const hasBody = !['GET', 'DELETE'].includes(method);
    const body = hasBody ? await req.text() : undefined;
    const response = await fetch(`${getBackendBaseUrl()}/api/v1/${path}`, {
      method,
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', ...(hasBody ? { 'Content-Type': 'application/json' } : {}) },
      body,
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({ error: 'The service returned an invalid response.' }));
    return NextResponse.json(payload, { status: response.status, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return safeBackendErrorResponse(error, `${req.method} /api/backend/financial-or-tax`);
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
