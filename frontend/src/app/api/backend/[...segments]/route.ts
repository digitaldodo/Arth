import { NextResponse, type NextRequest } from 'next/server';
import { getBackendBaseUrl, getAuthenticatedSession, safeBackendErrorResponse } from '@/lib/server-config';
import { createClient } from '@/lib/supabase/server';

const ALLOWED = [
  /^financial\/accounts$/,
  /^financial\/transaction-links$/,
  /^financial\/transaction-links\/[0-9a-f-]{36}\/reject$/i,
  /^financial\/import-batches$/,
  /^financial\/import-batches\/[0-9a-f-]{36}\/undo$/i,
  /^financial\/documents$/,
  /^financial\/documents\/[0-9a-f-]{36}$/i,
  /^financial\/documents\/[0-9a-f-]{36}\/fields$/i,
  /^financial\/documents\/[0-9a-f-]{36}\/fields\/[0-9a-f-]{36}$/i,
  /^tax\/profiles$/,
  /^tax\/estimate$/,
];

async function proxy(req: NextRequest, context: { params: Promise<{ segments: string[] }> }) {
  try {
    const { accessToken, userId, errorResponse } = await getAuthenticatedSession();
    if (errorResponse || !accessToken) return errorResponse || NextResponse.json({ error: 'Active session required' }, { status: 401 });
    const { segments } = await context.params;
    const path = segments.join('/');
    if (!ALLOWED.some((pattern) => pattern.test(path))) return NextResponse.json({ error: 'Route not found.' }, { status: 404 });
    const method = req.method;
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return NextResponse.json({ error: 'Method not allowed.' }, { status: 405 });
    const hasBody = !['GET', 'DELETE'].includes(method);
    const body = hasBody ? await req.text() : undefined;

    let response: Response | null = null;
    let payload: unknown = null;

    try {
      response = await fetch(`${getBackendBaseUrl()}/api/v1/${path}`, {
        method,
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', ...(hasBody ? { 'Content-Type': 'application/json' } : {}) },
        body,
        cache: 'no-store',
      });
      payload = await response.json().catch(() => null);
    } catch {
      // Backend unreachable; proceed to Supabase direct fallback below
    }

    if (response && response.status < 500) {
      return NextResponse.json(payload, { status: response.status, headers: { 'Cache-Control': 'no-store' } });
    }

    // Direct Supabase Fallback when Fastify backend is unreachable or returns 5xx
    if (userId) {
      try {
        const supabase = await createClient();

        // 1. GET financial/import-batches
        if (method === 'GET' && path === 'financial/import-batches') {
          const { data, error } = await supabase
            .from('statement_import_batches')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(50);

          if (!error && data) {
            return NextResponse.json({ batches: data }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
          }
        }

        // 2. POST financial/import-batches
        if (method === 'POST' && path === 'financial/import-batches' && body) {
          const parsedBody = JSON.parse(body) as Record<string, unknown>;
          const { error } = await supabase
            .from('statement_import_batches')
            .upsert({
              id: parsedBody.id,
              user_id: userId,
              account_id: parsedBody.account_id || null,
              source_name: parsedBody.source_name,
              source_format: parsedBody.source_format,
              parser_id: parsedBody.parser_id || 'generic',
              parser_version: parsedBody.parser_version || '1',
              statement_start: parsedBody.statement_start || null,
              statement_end: parsedBody.statement_end || null,
              opening_balance_paise: parsedBody.opening_balance_paise || null,
              closing_balance_paise: parsedBody.closing_balance_paise || null,
              source_sha256: parsedBody.source_sha256 || null,
              status: parsedBody.status || 'processing',
              detected_count: parsedBody.detected_count || 0,
              imported_count: parsedBody.imported_count || 0,
              skipped_count: parsedBody.skipped_count || 0,
              duplicate_count: parsedBody.duplicate_count || 0,
              discrepancy_count: parsedBody.discrepancy_count || 0,
              skipped_rows: parsedBody.skipped_rows || [],
            }, { onConflict: 'id' });

          if (!error) {
            return NextResponse.json({ success: true, id: parsedBody.id }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
          }
        }

        // 3. POST financial/import-batches/:id/undo
        const undoMatch = /^financial\/import-batches\/([0-9a-f-]{36})\/undo$/i.exec(path);
        if (method === 'POST' && undoMatch) {
          const batchId = undoMatch[1];
          const { data: removedCount, error } = await supabase.rpc('undo_statement_import_batch', {
            p_batch_id: batchId,
          });

          if (!error) {
            return NextResponse.json({ success: true, removed_count: removedCount ?? 0 }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
          } else {
            return NextResponse.json({ success: false, error: error.message }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
          }
        }
      } catch (fallbackErr) {
        console.error('[API Backend Proxy] Supabase fallback error:', fallbackErr);
      }
    }

    if (response) {
      return NextResponse.json(payload, { status: response.status, headers: { 'Cache-Control': 'no-store' } });
    }
    return safeBackendErrorResponse(new Error('Backend service unreachable and database fallback failed'), `${req.method} /api/backend/${path}`);
  } catch (error) {
    return safeBackendErrorResponse(error, `${req.method} /api/backend/financial-or-tax`);
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
