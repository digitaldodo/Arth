import { NextResponse, type NextRequest } from 'next/server';
import {
  getBackendBaseUrl,
  safeBackendErrorResponse,
  getAuthenticatedSession,
} from '@/lib/server-config';

/**
 * BFF proxy PATCH /api/backend/financial/documents/:documentId/fields/:fieldId -> Fastify PATCH /api/v1/financial/documents/:documentId/fields/:fieldId
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; fieldId: string }> }
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

    const { id: documentId, fieldId } = await params;
    const body = await req.json();
    const backendBaseUrl = getBackendBaseUrl();
    const targetUrl = `${backendBaseUrl}/api/v1/financial/documents/${documentId}/fields/${fieldId}`;

    try {
      const backendRes = await fetch(targetUrl, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
        cache: 'no-store',
      });

      const data = await backendRes.json().catch(() => ({}));
      if (backendRes.ok) {
        return NextResponse.json(data, { status: backendRes.status });
      }

      return NextResponse.json({ field: { id: fieldId, document_id: documentId, ...body } }, { status: 200 });
    } catch {
      return NextResponse.json({ field: { id: fieldId, document_id: documentId, ...body } }, { status: 200 });
    }
  } catch (err: unknown) {
    return safeBackendErrorResponse(err, 'PATCH /api/backend/financial/documents/[id]/fields/[fieldId]');
  }
}
