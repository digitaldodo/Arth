import { NextResponse, type NextRequest } from 'next/server';
import {
  getBackendBaseUrl,
  safeBackendErrorResponse,
  getAuthenticatedSession,
} from '@/lib/server-config';

/**
 * BFF proxy GET /api/backend/people -> Fastify GET /api/v1/people
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

    const searchParams = req.nextUrl.searchParams;
    const permittedParams = new URLSearchParams();

    const search = searchParams.get('search');
    if (search) permittedParams.set('search', search);

    const includeArchived =
      searchParams.get('include_archived') || searchParams.get('includeArchived');
    if (includeArchived) permittedParams.set('include_archived', includeArchived);

    const direction = searchParams.get('direction');
    if (direction) permittedParams.set('direction', direction);

    const backendBaseUrl = getBackendBaseUrl();
    const queryString = permittedParams.toString();
    const targetUrl = queryString
      ? `${backendBaseUrl}/api/v1/people?${queryString}`
      : `${backendBaseUrl}/api/v1/people`;

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
    return safeBackendErrorResponse(err, 'GET /api/backend/people');
  }
}

/**
 * BFF proxy POST /api/backend/people -> Fastify POST /api/v1/people
 */
export async function POST(req: NextRequest) {
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
    const body = await req.json();

    const backendRes = await fetch(`${backendBaseUrl}/api/v1/people`, {
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
    return safeBackendErrorResponse(err, 'POST /api/backend/people');
  }
}
