import { NextResponse, type NextRequest } from 'next/server';
import { getAuthenticatedSession } from '@/lib/server-config';
import { getSupabaseAdmin } from '@/lib/server/sheets-worker';
import {
  extractSpreadsheetId,
  verifyAndInitializeSheet,
} from '@/lib/server/google-sheets-client';
import {
  getServiceAccountEmail,
  isGoogleServiceAccountConfigured,
} from '@/lib/server/google-auth';

/**
 * GET /api/backend/sheets/connection
 * Retrieves the current user's Google Sheet connection and system service account email.
 */
export async function GET() {
  try {
    const { userId, errorResponse } = await getAuthenticatedSession();
    if (errorResponse || !userId) {
      return (
        errorResponse ||
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      );
    }

    const admin = getSupabaseAdmin();
    const { data: connection } = await admin
      .from('user_sheet_connections')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    return NextResponse.json({
      connected: Boolean(connection),
      connection: connection || null,
      serviceAccountEmail: getServiceAccountEmail(),
      isConfigured: isGoogleServiceAccountConfigured(),
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Failed to retrieve connection';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/backend/sheets/connection
 * Validates, initializes, and pairs a Google Sheet to the current user's account.
 */
export async function POST(req: NextRequest) {
  try {
    const { userId, errorResponse } = await getAuthenticatedSession();
    if (errorResponse || !userId) {
      return (
        errorResponse ||
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      );
    }

    if (!isGoogleServiceAccountConfigured()) {
      return NextResponse.json(
        {
          error:
            'Google Sheets integration is not configured on the server. Please check environment variables (GCP_PROJECT_NUMBER, GCP_WORKLOAD_IDENTITY_POOL_ID, GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID, GCP_SERVICE_ACCOUNT_EMAIL for Vercel OIDC, or GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY for local development).',
        },
        { status: 503 }
      );
    }

    const body = await req.json();
    const spreadsheetInput = body.spreadsheetUrl || body.spreadsheetId;
    const sheetName = body.sheetName?.trim() || 'Transactions';

    if (!spreadsheetInput || typeof spreadsheetInput !== 'string') {
      return NextResponse.json(
        { error: 'Spreadsheet URL or ID is required.' },
        { status: 400 }
      );
    }

    const spreadsheetId = extractSpreadsheetId(spreadsheetInput);
    if (!spreadsheetId) {
      return NextResponse.json(
        {
          error:
            'Invalid Google Spreadsheet URL or ID format. Please paste a valid Google Sheets URL (e.g., https://docs.google.com/spreadsheets/d/...) or spreadsheet ID.',
        },
        { status: 400 }
      );
    }

    // Standardize URL
    const canonicalUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

    // Verify access & write headers if newly created
    const initResult = await verifyAndInitializeSheet(spreadsheetId, sheetName);

    // Save or update in database
    const admin = getSupabaseAdmin();
    const { data: savedConnection, error: dbError } = await admin
      .from('user_sheet_connections')
      .upsert(
        {
          user_id: userId,
          spreadsheet_id: spreadsheetId,
          spreadsheet_url: canonicalUrl,
          sheet_name: initResult.sheetName,
          sync_status: 'connected',
          last_synced_at: new Date().toISOString(),
          last_error: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
      .select('*')
      .single();

    if (dbError) {
      return NextResponse.json(
        { error: `Database error: ${dbError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Google Sheet connected successfully!',
      connection: savedConnection,
    });
  } catch (err: unknown) {
    const rawMessage =
      err instanceof Error ? err.message : 'Failed to connect Google Sheet';
    console.error('[SheetsConnection] Error connecting Google Sheet:', rawMessage);

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

/**
 * DELETE /api/backend/sheets/connection
 * Unlinks the Google Sheet from the user's account.
 */
export async function DELETE() {
  try {
    const { userId, errorResponse } = await getAuthenticatedSession();
    if (errorResponse || !userId) {
      return (
        errorResponse ||
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      );
    }

    const admin = getSupabaseAdmin();
    const { error: dbError } = await admin
      .from('user_sheet_connections')
      .delete()
      .eq('user_id', userId);

    if (dbError) {
      return NextResponse.json(
        { error: `Database error: ${dbError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Google Sheet disconnected successfully.',
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Failed to disconnect sheet';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
