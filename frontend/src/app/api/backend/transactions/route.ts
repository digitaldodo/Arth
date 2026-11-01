import { NextResponse, type NextRequest } from 'next/server';
import {
  getBackendBaseUrl,
  safeBackendErrorResponse,
  getAuthenticatedSession,
} from '@/lib/server-config';
import { drainUserOutbox } from '@/lib/server/sheets-worker';

/**
 * BFF proxy POST /api/backend/transactions -> Fastify POST /api/v1/transactions
 */
export async function POST(req: NextRequest) {
  try {
    const { accessToken, userId, errorResponse } = await getAuthenticatedSession();
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

    const backendBaseUrl = getBackendBaseUrl();
    const body = await req.json();

    const backendRes = await fetch(`${backendBaseUrl}/api/v1/transactions`, {
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

    // Event-driven near-real-time synchronization:
    // If transaction write was committed to PostgreSQL, asynchronously trigger outbox drain
    if (backendRes.ok && userId) {
      drainUserOutbox(userId).catch((syncErr) => {
        console.warn('[TransactionsRoute] Asynchronous outbox drain non-fatal error:', syncErr);
      });
    }

    return NextResponse.json(data, { status: backendRes.status });
  } catch (err: unknown) {
    return safeBackendErrorResponse(err, 'POST /api/backend/transactions');
  }
}

/**
 * BFF proxy GET /api/backend/transactions -> Fastify GET /api/v1/transactions
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

    // Safely forward only permitted query parameters
    const searchParams = req.nextUrl.searchParams;
    const permittedParams = new URLSearchParams();
    const allowedKeys = ['page', 'page_size', 'type', 'category_id', 'necessity', 'start_date', 'end_date', 'sort_by'];

    for (const key of allowedKeys) {
      const val = searchParams.get(key);
      if (val) permittedParams.set(key, val);
    }

    const backendBaseUrl = getBackendBaseUrl();
    const queryString = permittedParams.toString();
    const targetUrl = queryString
      ? `${backendBaseUrl}/api/v1/transactions?${queryString}`
      : `${backendBaseUrl}/api/v1/transactions`;

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
    return safeBackendErrorResponse(err, 'GET /api/backend/transactions');
  }
}
