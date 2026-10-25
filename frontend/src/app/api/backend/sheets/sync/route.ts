import { NextResponse } from 'next/server';
import { getAuthenticatedSession } from '@/lib/server-config';
import { drainUserOutbox } from '@/lib/server/sheets-worker';

/**
 * POST /api/backend/sheets/sync
 * Manually drains pending outbox records for the authenticated user to their Google Sheet.
 */
export async function POST() {
  try {
    const { userId, errorResponse } = await getAuthenticatedSession();
    if (errorResponse || !userId) {
      return (
        errorResponse ||
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      );
    }

    const result = await drainUserOutbox(userId);
    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Sync failed unexpectedly';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
