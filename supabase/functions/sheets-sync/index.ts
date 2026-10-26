// Supabase Edge Function: sheets-sync
// Invoked by Supabase Cron (pg_cron) or external triggers for scheduled outbox recovery.

import { isAuthorizedCronRequest, corsHeaders } from '../_shared/auth.ts';

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }

  const startTime = Date.now();

  // Validate CRON_SECRET authorization
  if (!isAuthorizedCronRequest(req)) {
    return new Response(
      JSON.stringify({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid or missing CRON_SECRET',
      }),
      {
        status: 401,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      }
    );
  }

  try {
    const appUrl = (Deno.env.get('APP_URL') || 'https://arth-9h3f.vercel.app').replace(/\/+$/, '');
    const cronSecret = Deno.env.get('CRON_SECRET')?.trim() || '';

    const targetUrl = new URL(`${appUrl}/api/sync/sheets`);

    // Forward URL query parameters if present (e.g. limit=50)
    const incomingUrl = new URL(req.url);
    if (incomingUrl.searchParams.has('limit')) {
      targetUrl.searchParams.set('limit', incomingUrl.searchParams.get('limit')!);
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-cron-source': 'supabase-edge-function',
    };

    if (cronSecret) {
      headers['Authorization'] = `Bearer ${cronSecret}`;
      headers['x-cron-secret'] = cronSecret;
    }

    // Bounded execution: 25-second timeout to prevent hanging workers
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    const backendRes = await fetch(targetUrl.toString(), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        source: 'supabase_edge_function',
        triggered_at: new Date().toISOString(),
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    const responseBody = await backendRes.json().catch(() => ({}));
    const durationMs = Date.now() - startTime;

    return new Response(
      JSON.stringify({
        success: backendRes.ok,
        statusCode: backendRes.status,
        duration_ms: durationMs,
        data: responseBody,
      }),
      {
        status: backendRes.status,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      }
    );
  } catch (err: unknown) {
    const durationMs = Date.now() - startTime;
    const isTimeout = err instanceof DOMException && err.name === 'AbortError';
    const message = isTimeout
      ? 'Sync worker execution timed out after 25 seconds'
      : err instanceof Error
      ? err.message
      : 'Unknown sync failure';

    console.error('[EdgeFunction:sheets-sync] Error:', err);

    return new Response(
      JSON.stringify({
        statusCode: isTimeout ? 504 : 500,
        error: isTimeout ? 'GatewayTimeout' : 'InternalServerError',
        message,
        duration_ms: durationMs,
      }),
      {
        status: isTimeout ? 504 : 500,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      }
    );
  }
});
