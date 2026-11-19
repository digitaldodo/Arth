import { NextResponse } from 'next/server';
import { getBackendBaseUrl, safeBackendErrorResponse } from '@/lib/server-config';
import { getNativeUser } from '../_auth';

export async function GET(request: Request) {
  try {
    const { accessToken, error } = await getNativeUser(request);
    if (error) return error;
    if (!accessToken) return NextResponse.json({ statusCode: 401, error: 'Unauthorized', message: 'Valid SpendSense sign-in required' }, { status: 401 });
    const backendResponse = await fetch(`${getBackendBaseUrl()}/api/v1/categories`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      cache: 'no-store',
    });
    const data = await backendResponse.json();
    return NextResponse.json(data, { status: backendResponse.status, headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    return safeBackendErrorResponse(err, 'GET /api/native/categories');
  }
}
