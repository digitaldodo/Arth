import { NextResponse, type NextRequest } from 'next/server';
import {
  getBackendBaseUrl,
  safeBackendErrorResponse,
  getAuthenticatedSession,
} from '@/lib/server-config';

/**
 * BFF proxy POST /api/backend/people/[id]/records -> Fastify POST /api/v1/people/:id/records
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const backendBaseUrl = getBackendBaseUrl();
    const { id } = await params;
    const body = await req.json();

    const backendRes = await fetch(`${backendBaseUrl}/api/v1/people/${encodeURIComponent(id)}/records`, {
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
    return safeBackendErrorResponse(err, 'POST /api/backend/people/[id]/records');
  }
}
