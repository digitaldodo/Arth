import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const BACKEND_BASE_URL =
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:3001';

/**
 * BFF proxy GET /api/backend/dashboard -> Fastify GET /api/v1/dashboard/summary
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

    const targetUrl = `${BACKEND_BASE_URL}/api/v1/dashboard/summary?${queryString}`;

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
