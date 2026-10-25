import { NextResponse, type NextRequest } from 'next/server';
import {
  getBackendBaseUrl,
  safeBackendErrorResponse,
  getAuthenticatedSession,
} from '@/lib/server-config';

/**
 * BFF proxy GET /api/backend/dashboard -> Fastify GET /api/v1/dashboard/summary
 */
export async function GET(req: NextRequest) {
  try {
    const { accessToken, errorResponse } = await getAuthenticatedSession();
    if (errorResponse || !accessToken) {
      return errorResponse || NextResponse.json(
        {
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Active session required',
        },
        { status: 401 }
      );
    }

    // Safely forward permitted query parameters
    const searchParams = req.nextUrl.searchParams;
    const permittedParams = new URLSearchParams();
    const allowedKeys = ['start_date', 'end_date'];

    for (const key of allowedKeys) {
      const val = searchParams.get(key);
      if (val) permittedParams.set(key, val);
    }

    const queryString = permittedParams.toString();
    if (!permittedParams.has('start_date') || !permittedParams.has('end_date')) {
      return NextResponse.json(
        {
          statusCode: 400,
          error: 'Bad Request',
          message: 'start_date and end_date query parameters are required',
        },
        { status: 400 }
      );
    }

    const backendBaseUrl = getBackendBaseUrl();
    const targetUrl = `${backendBaseUrl}/api/v1/dashboard/summary?${queryString}`;

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
    return safeBackendErrorResponse(err, 'GET /api/backend/dashboard');
  }
}
