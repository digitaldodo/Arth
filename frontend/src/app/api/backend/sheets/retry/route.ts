import { NextResponse } from 'next/server';
import { getAuthenticatedSession } from '@/lib/server-config';
import { retryFailedUserOutbox } from '@/lib/server/sheets-worker';

/**
 * POST /api/backend/sheets/retry
 * Resets failed outbox events for the authenticated user and initiates an immediate sync attempt.
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

    const result = await retryFailedUserOutbox(userId);
    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Retry failed unexpectedly';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
