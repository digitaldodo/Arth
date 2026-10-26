import { NextResponse } from 'next/server';
import {
  getBackendBaseUrl,
  safeBackendErrorResponse,
  getAuthenticatedSession,
} from '@/lib/server-config';

/**
 * BFF proxy GET /api/backend/balances/movements -> Fastify GET /api/v1/balances/movements
 */
export async function GET() {
  try {
    const { accessToken, errorResponse } = await getAuthenticatedSession();
    if (errorResponse || !accessToken) {
      return (
        errorResponse ||
        NextResponse.json(
          {
            statusCode: 401,
            error: 'Unauthorized',
            message: 'Active session required',
          },
          { status: 401 }
        )
      );
    }

    const backendBaseUrl = getBackendBaseUrl();
    const targetUrl = `${backendBaseUrl}/api/v1/balances/movements`;

    const backendRes = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    const data = await backendRes.json();
    return NextResponse.json(data, { status: backendRes.status });
  } catch (err: unknown) {
    return safeBackendErrorResponse(err, 'GET /api/backend/balances/movements');
  }
}
