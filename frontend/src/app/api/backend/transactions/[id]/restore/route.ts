import { NextResponse, type NextRequest } from 'next/server';
import {
  getBackendBaseUrl,
  safeBackendErrorResponse,
  getAuthenticatedSession,
} from '@/lib/server-config';
import { drainUserOutbox } from '@/lib/server/sheets-worker';

/**
 * BFF proxy POST /api/backend/transactions/[id]/restore -> Fastify POST /api/v1/transactions/:id/restore
 */
export async function POST(
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

    const backendRes = await fetch(
      `${backendBaseUrl}/api/v1/transactions/${encodeURIComponent(id)}/restore`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
        cache: 'no-store',
      }
    );

    const data = await backendRes.json();

    if (backendRes.ok && userId) {
      drainUserOutbox(userId).catch((syncErr) => {
        console.warn('[TransactionsRoute] Asynchronous outbox drain non-fatal error:', syncErr);
      });
    }

    return NextResponse.json(data, { status: backendRes.status });
  } catch (err: unknown) {
    return safeBackendErrorResponse(err, 'POST /api/backend/transactions/[id]/restore');
  }
}
