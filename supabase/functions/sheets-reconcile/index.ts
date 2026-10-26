// Supabase Edge Function: sheets-reconcile
// Invoked by Supabase Cron (pg_cron) or external triggers for scheduled daily reconciliation.

import { isAuthorizedCronRequest, corsHeaders } from '../_shared/auth.ts';

Deno.serve(async (req: Request) => {
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

    const targetUrl = `${appUrl}/api/sync/reconcile`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-cron-source': 'supabase-edge-function',
    };

    if (cronSecret) {
      headers['Authorization'] = `Bearer ${cronSecret}`;
      headers['x-cron-secret'] = cronSecret;
    }

    // Bounded execution: 55-second timeout for daily reconciliation
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 55000);

    const backendRes = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        source: 'supabase_edge_function',
        type: 'daily_reconciliation',
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
      ? 'Daily reconciliation timed out after 55 seconds'
      : err instanceof Error
      ? err.message
      : 'Unknown reconciliation failure';

    console.error('[EdgeFunction:sheets-reconcile] Error:', err);

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
