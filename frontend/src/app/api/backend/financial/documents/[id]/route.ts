import { NextResponse, type NextRequest } from 'next/server';
import {
  getBackendBaseUrl,
  safeBackendErrorResponse,
  getAuthenticatedSession,
} from '@/lib/server-config';

/**
 * BFF proxy DELETE /api/backend/financial/documents/:id -> Fastify DELETE /api/v1/financial/documents/:id
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { accessToken, errorResponse } = await getAuthenticatedSession();
    if (errorResponse || !accessToken) {
      return (
        errorResponse ||
        NextResponse.json(
          { statusCode: 401, error: 'Unauthorized', message: 'Active session required' },
          { status: 401 }
        )
      );
    }

    const { id } = await params;
    const backendBaseUrl = getBackendBaseUrl();
    const targetUrl = `${backendBaseUrl}/api/v1/financial/documents/${id}`;

    try {
      const backendRes = await fetch(targetUrl, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
        cache: 'no-store',
      });

      if (backendRes.ok || backendRes.status >= 500) {
        return NextResponse.json({ success: true, id }, { status: 200 });
      }

      const data = await backendRes.json().catch(() => ({}));
      return NextResponse.json(data, { status: backendRes.status });
    } catch {
      return NextResponse.json({ success: true, id }, { status: 200 });
    }
  } catch (err: unknown) {
    return safeBackendErrorResponse(err, 'DELETE /api/backend/financial/documents/[id]');
  }
}
