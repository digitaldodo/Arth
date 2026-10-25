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
 * Weekly reconciliation cron endpoint triggered by Vercel Cron.
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

  try {
    const result = await reconcileAllConnectedSheets();
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Unknown reconciliation failure';
    console.error('[CronSheetsReconcile] Error in weekly reconciliation:', err);
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
