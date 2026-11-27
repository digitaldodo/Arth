import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getBackendBaseUrl } from '@/lib/server-config';

export const dynamic = 'force-dynamic';

export type AuthHealthCategory =
  | 'healthy'
  | 'supabase_unconfigured'
  | 'supabase_unreachable'
  | 'backend_unreachable'
  | 'degraded';

export interface SanitizedAuthHealthResponse {
  ok: boolean;
  category: AuthHealthCategory;
  message: string;
  checks: {
    supabaseConfigured: boolean;
    supabaseReachable: boolean;
    usernameLookupReady: boolean;
    googleOAuthReady: boolean;
    backendReachable: boolean;
  };
  timestamp: string;
}

function getServiceRoleKey(): string | undefined {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim()
  );
}

/**
 * Public, strictly sanitized authentication & backend connectivity health check.
 * Never exposes keys, tokens, hostnames, internal URLs, or database internals.
 */
export async function GET() {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
  const serviceRoleKey = getServiceRoleKey();

  const supabaseConfigured = Boolean(supabaseUrl && anonKey);
  let supabaseReachable = false;
  let googleOAuthReady = false;
  let usernameLookupReady = false;
  let backendReachable = false;

  if (supabaseConfigured) {
    try {
      const settingsRes = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/settings`, {
        headers: { apikey: anonKey, Accept: 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(4000),
      });
      if (settingsRes.ok) {
        supabaseReachable = true;
        const settingsJson = (await settingsRes.json().catch(() => ({}))) as {
          external?: { google?: boolean };
        };
        googleOAuthReady = settingsJson?.external?.google === true;
      }
    } catch {
      supabaseReachable = false;
    }
  }

  if (supabaseConfigured && serviceRoleKey) {
    try {
      const serviceClient = createServiceClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const { error } = await serviceClient.rpc('fn_get_email_by_username', {
        p_username: '__spendsense_health_probe__',
      });
      usernameLookupReady = !error;
    } catch {
      usernameLookupReady = false;
    }
  }

  try {
    const backendBase = getBackendBaseUrl();
    const backendRes = await fetch(`${backendBase}/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    backendReachable = backendRes.ok;
  } catch {
    backendReachable = false;
  }

  let category: AuthHealthCategory = 'healthy';
  let message = 'Authentication and ledger services are ready.';

  if (!supabaseConfigured) {
    category = 'supabase_unconfigured';
    message = 'Authentication service is not configured in this environment.';
  } else if (!supabaseReachable) {
    category = 'supabase_unreachable';
    message = 'Unable to reach SpendSense authentication service right now.';
  } else if (!backendReachable && !usernameLookupReady) {
    category = 'degraded';
    message = 'Sign-in is available, while background synchronization is currently waking up.';
  } else if (!backendReachable) {
    category = 'backend_unreachable';
    message = 'Authentication is ready; ledger sync service is reconnecting.';
  }

  const payload: SanitizedAuthHealthResponse = {
    ok: supabaseConfigured && supabaseReachable,
    category,
    message,
    checks: {
      supabaseConfigured,
      supabaseReachable,
      usernameLookupReady,
      googleOAuthReady,
      backendReachable,
    },
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(payload, {
    status: payload.ok ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
