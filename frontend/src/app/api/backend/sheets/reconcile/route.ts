import { NextResponse } from 'next/server';
import { getAuthenticatedSession } from '@/lib/server-config';
import { reconcileUserSheet } from '@/lib/server/sheets-worker';

/**
 * POST /api/backend/sheets/reconcile
 * Performs on-demand full reconciliation between PostgreSQL and the user's Google Sheet.
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

    const result = await reconcileUserSheet(userId);
    return NextResponse.json({
      success: true,
      message: `Reconciliation complete: checked ${result.total} transactions (${result.inserted} added, ${result.updated} updated).`,
      ...result,
    });
  } catch (err: unknown) {
    const rawMessage =
      err instanceof Error ? err.message : 'Reconciliation failed';
    console.error('[SheetsReconcile] Reconcile error:', rawMessage);

    let message = rawMessage;
    if (
      rawMessage.includes('DECODER') ||
      rawMessage.includes('unsupported') ||
      rawMessage.includes('1E08010C') ||
      rawMessage.includes('routines')
    ) {
      message =
        'Google Sheets authentication failed. Please verify the server configuration and try again.';
    }

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
