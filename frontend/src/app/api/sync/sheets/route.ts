import { NextResponse, type NextRequest } from 'next/server';
import { processOutboxBatch } from '@/lib/server/sheets-worker';

/**
 * Validates CRON_SECRET from Authorization header or x-cron-secret header.
 */
function isAuthorizedCron(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    // In development / test environment where CRON_SECRET is not configured, permit invocation if not in production
    return process.env.NODE_ENV !== 'production';
  }

  const authHeader = req.headers.get('authorization')?.trim();
  const customHeader = req.headers.get('x-cron-secret')?.trim();

  if (authHeader === `Bearer ${cronSecret}`) return true;
  if (customHeader === cronSecret) return true;

  return false;
}

/**
 * GET/POST /api/sync/sheets
 * Scheduled outbox worker endpoint triggered by Vercel Cron or external schedulers.
 */
export async function GET(req: NextRequest) {
  return handleSync(req);
}

export async function POST(req: NextRequest) {
  return handleSync(req);
}

async function handleSync(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json(
      {
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid or missing CRON_SECRET',
      },
      { status: 401 }
    );
  }

  try {
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get('limit')) || 50;

    const result = await processOutboxBatch(limit);
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown sync failure';
    console.error('[CronSheetsSync] Error processing outbox batch:', err);
    return NextResponse.json(
      {
        statusCode: 500,
        error: 'InternalServerError',
        message,
      },
      { status: 500 }
    );
  }
}
