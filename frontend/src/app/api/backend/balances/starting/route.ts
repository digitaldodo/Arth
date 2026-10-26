import { NextResponse, type NextRequest } from 'next/server';
import {
  getBackendBaseUrl,
  safeBackendErrorResponse,
  getAuthenticatedSession,
} from '@/lib/server-config';

/**
 * BFF proxy POST /api/backend/balances/starting -> Fastify POST /api/v1/balances/starting
 */
export async function POST(req: NextRequest) {
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

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        {
          statusCode: 400,
          error: 'Bad Request',
          message: 'Malformed JSON payload',
        },
        { status: 400 }
      );
    }

    const backendBaseUrl = getBackendBaseUrl();
    const targetUrl = `${backendBaseUrl}/api/v1/balances/starting`;

    const backendRes = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    const data = await backendRes.json();
    return NextResponse.json(data, { status: backendRes.status });
  } catch (err: unknown) {
    return safeBackendErrorResponse(err, 'POST /api/backend/balances/starting');
  }
}
