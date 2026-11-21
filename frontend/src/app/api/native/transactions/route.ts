import { NextResponse } from 'next/server';
import { getBackendBaseUrl, safeBackendErrorResponse } from '@/lib/server-config';
import { getNativeUser } from '../_auth';

export async function GET(request: Request) {
  try {
    const { accessToken, error } = await getNativeUser(request);
    if (error) return error;
    if (!accessToken) return NextResponse.json({ statusCode: 401, error: 'Unauthorized', message: 'Valid SpendSense sign-in required' }, { status: 401 });
    const source = new URL(request.url).searchParams;
    const query = new URLSearchParams();
    for (const key of ['page', 'page_size', 'type', 'start_date', 'end_date']) {
      const value = source.get(key);
      if (value) query.set(key, value);
    }
    const suffix = query.size ? `?${query}` : '';
    const backendResponse = await fetch(`${getBackendBaseUrl()}/api/v1/transactions${suffix}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      cache: 'no-store',
    });
    const data = await backendResponse.json();
    return NextResponse.json(data, { status: backendResponse.status, headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    return safeBackendErrorResponse(err, 'GET /api/native/transactions');
  }
}

/** Native companion proxy; identity is verified from the Supabase JWT, never from the payload. */
export async function POST(request: Request) {
  try {
    const { accessToken, userId, error } = await getNativeUser(request);
    if (error) return error;
    if (!accessToken || !userId) return NextResponse.json({ statusCode: 401, error: 'Unauthorized', message: 'Valid SpendSense sign-in required' }, { status: 401 });

    const body: unknown = await request.json();
    const transactionPayload = body && typeof body === 'object' && !Array.isArray(body)
      ? { ...(body as Record<string, unknown>) }
      : body;
    if (transactionPayload && typeof transactionPayload === 'object' && !Array.isArray(transactionPayload)) {
      delete (transactionPayload as Record<string, unknown>).user_id;
    }
    const backendResponse = await fetch(`${getBackendBaseUrl()}/api/v1/transactions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(transactionPayload),
      cache: 'no-store',
    });
    const data = await backendResponse.json();

    return NextResponse.json(data, { status: backendResponse.status, headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    return safeBackendErrorResponse(err, 'POST /api/native/transactions');
  }
}
