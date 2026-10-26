import { NextResponse, type NextRequest } from 'next/server';
import {
  getBackendBaseUrl,
  safeBackendErrorResponse,
  getAuthenticatedSession,
} from '@/lib/server-config';
import { drainUserOutbox } from '@/lib/server/sheets-worker';

/**
 * BFF proxy PATCH /api/backend/transactions/[id] -> Fastify PATCH /api/v1/transactions/:id
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { accessToken, userId, errorResponse } = await getAuthenticatedSession();
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
    const { id } = await params;
    const body = await req.json();

    const backendRes = await fetch(`${backendBaseUrl}/api/v1/transactions/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    const data = await backendRes.json();

    if (backendRes.ok && userId) {
      drainUserOutbox(userId).catch((syncErr) => {
        console.warn('[TransactionsRoute] Asynchronous outbox drain non-fatal error:', syncErr);
      });
    }

    return NextResponse.json(data, { status: backendRes.status });
  } catch (err: unknown) {
    return safeBackendErrorResponse(err, 'PATCH /api/backend/transactions/[id]');
  }
}

/**
 * BFF proxy DELETE /api/backend/transactions/[id] -> Fastify DELETE /api/v1/transactions/:id
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { accessToken, userId, errorResponse } = await getAuthenticatedSession();
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
    const { id } = await params;

    const backendRes = await fetch(`${backendBaseUrl}/api/v1/transactions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    const data = await backendRes.json();

    if (backendRes.ok && userId) {
      drainUserOutbox(userId).catch((syncErr) => {
        console.warn('[TransactionsRoute] Asynchronous outbox drain non-fatal error:', syncErr);
      });
    }

    return NextResponse.json(data, { status: backendRes.status });
  } catch (err: unknown) {
    return safeBackendErrorResponse(err, 'DELETE /api/backend/transactions/[id]');
  }
}
