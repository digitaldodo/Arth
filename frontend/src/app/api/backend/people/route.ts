import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const BACKEND_BASE_URL =
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:3001';

/**
 * BFF proxy GET /api/backend/people -> Fastify GET /api/v1/people
 */
export async function GET(req: NextRequest) {
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

    const searchParams = req.nextUrl.searchParams;
    const permittedParams = new URLSearchParams();

    const search = searchParams.get('search');
    if (search) permittedParams.set('search', search);

    const includeArchived =
      searchParams.get('include_archived') || searchParams.get('includeArchived');
    if (includeArchived) permittedParams.set('include_archived', includeArchived);

    const direction = searchParams.get('direction');
    if (direction) permittedParams.set('direction', direction);

    const queryString = permittedParams.toString();
    const targetUrl = queryString
      ? `${BACKEND_BASE_URL}/api/v1/people?${queryString}`
      : `${BACKEND_BASE_URL}/api/v1/people`;

    const backendRes = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    const data = await backendRes.json();
    return NextResponse.json(data, { status: backendRes.status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Backend proxy error';
    return NextResponse.json(
      {
        statusCode: 502,
        error: 'Bad Gateway',
        message,
      },
      { status: 502 }
    );
  }
}

/**
 * BFF proxy POST /api/backend/people -> Fastify POST /api/v1/people
 */
export async function POST(req: NextRequest) {
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

    const body = await req.json();

    const backendRes = await fetch(`${BACKEND_BASE_URL}/api/v1/people`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    const data = await backendRes.json();
    return NextResponse.json(data, { status: backendRes.status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Backend proxy error';
    return NextResponse.json(
      {
        statusCode: 502,
        error: 'Bad Gateway',
        message,
      },
      { status: 502 }
    );
  }
}
