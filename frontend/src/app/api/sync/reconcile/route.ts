import { NextResponse, type NextRequest } from 'next/server';
import { reconcileAllConnectedSheets } from '@/lib/server/sheets-worker';

function isAuthorizedCron(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return process.env.NODE_ENV !== 'production';
  }

  const authHeader = req.headers.get('authorization')?.trim();
  const customHeader = req.headers.get('x-cron-secret')?.trim();

  if (authHeader === `Bearer ${cronSecret}`) return true;
  if (customHeader === cronSecret) return true;

  return false;
}

/**
 * GET/POST /api/sync/reconcile
 * Daily reconciliation cron endpoint triggered by Supabase Cron (pg_cron) or Edge Functions.
 */
export async function GET(req: NextRequest) {
  return handleReconcile(req);
}

export async function POST(req: NextRequest) {
  return handleReconcile(req);
}

async function handleReconcile(req: NextRequest) {
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
    // Timeout guard: 55 seconds for daily full reconciliation
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Reconciliation exceeded 55-second limit')), 55000)
    );

    const result = await Promise.race([reconcileAllConnectedSheets(), timeoutPromise]);
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
    const message =
      err instanceof Error ? err.message : 'Unknown reconciliation failure';
    console.error(`[CronSheetsReconcile][source=${cronSource}] Error:`, err);
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
