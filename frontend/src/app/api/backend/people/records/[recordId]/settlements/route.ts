import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getBackendBaseUrl, safeBackendErrorResponse } from '@/lib/server-config';

/**
 * BFF proxy POST /api/backend/people/records/[recordId]/settlements -> Fastify POST /api/v1/people/records/:recordId/settlements
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ recordId: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session?.access_token) {
      return NextResponse.json(
        {
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Active session required',
        },
        { status: 401 }
      );
    }

    const backendBaseUrl = getBackendBaseUrl();
    const { recordId } = await params;
    const body = await req.json();

    const backendRes = await fetch(
      `${backendBaseUrl}/api/v1/people/records/${encodeURIComponent(recordId)}/settlements`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
        cache: 'no-store',
      }
    );

    const data = await backendRes.json();
    return NextResponse.json(data, { status: backendRes.status });
  } catch (err: unknown) {
    return safeBackendErrorResponse(
      err,
      'POST /api/backend/people/records/[recordId]/settlements'
    );
  }
}
