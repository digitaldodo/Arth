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
 * Scheduled outbox worker endpoint triggered by Supabase Cron (pg_cron), Edge Functions, or external schedulers.
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

  const cronSource = req.headers.get('x-cron-source') || 'manual_trigger';
  const startTime = Date.now();

  try {
    const url = new URL(req.url);
    const rawLimit = Number(url.searchParams.get('limit')) || 50;
    // Bounded execution: enforce safe limit range between 1 and 100
    const limit = Math.min(Math.max(rawLimit, 1), 100);

    // Timeout guard: 25-second limit for serverless execution
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Outbox batch processing exceeded 25-second limit')), 25000)
    );

    const result = await Promise.race([processOutboxBatch(limit), timeoutPromise]);
    const durationMs = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      source: cronSource,
      timestamp: new Date().toISOString(),
      duration_ms: durationMs,
      ...result,
    });
  } catch (err: unknown) {
    const durationMs = Date.now() - startTime;
    const message = err instanceof Error ? err.message : 'Unknown sync failure';
    console.error(`[CronSheetsSync][source=${cronSource}] Error:`, err);
    return NextResponse.json(
      {
        statusCode: 500,
        error: 'InternalServerError',
        message,
        duration_ms: durationMs,
      },
      { status: 500 }
    );
  }
}
