/**
 * Shared authorization and security helper for Supabase Edge Functions.
 */

export function isAuthorizedCronRequest(req: Request): boolean {
  const expectedSecret = Deno.env.get('CRON_SECRET')?.trim();
  if (!expectedSecret) {
    // If CRON_SECRET is not configured in environment, reject in production
    const env = Deno.env.get('ENVIRONMENT') || Deno.env.get('DENO_ENV') || 'production';
    return env === 'development';
  }

  const authHeader = req.headers.get('authorization')?.trim();
  const customHeader = req.headers.get('x-cron-secret')?.trim();

  if (authHeader === `Bearer ${expectedSecret}`) return true;
  if (customHeader === expectedSecret) return true;

  return false;
}

export function corsHeaders(origin = '*') {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret, x-cron-source',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
}
