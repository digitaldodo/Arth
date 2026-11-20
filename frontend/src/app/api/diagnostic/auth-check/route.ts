import { NextResponse } from 'next/server';
import dns from 'node:dns/promises';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const authKey = url.searchParams.get('key');
  if (authKey !== 'spendsense-diag-2026') {
    return NextResponse.json({ error: 'Unauthorized diagnostic access' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SECRET_KEY;

  let parsedHost = '';
  let projectRef = '';
  try {
    if (supabaseUrl) {
      const parsed = new URL(supabaseUrl);
      parsedHost = parsed.hostname;
      projectRef = parsed.hostname.split('.')[0] || '';
    }
  } catch {
    parsedHost = 'INVALID_URL';
  }

  // 1. Env Presence (No secrets revealed)
  const envStatus = {
    NEXT_PUBLIC_SUPABASE_URL_PRESENT: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    SUPABASE_URL_PRESENT: Boolean(process.env.SUPABASE_URL),
    parsedHost,
    projectRef,
    NEXT_PUBLIC_SUPABASE_ANON_KEY_PRESENT: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    NEXT_PUBLIC_SUPABASE_ANON_KEY_LENGTH: anonKey ? anonKey.length : 0,
    NEXT_PUBLIC_SUPABASE_ANON_KEY_PREFIX: anonKey ? anonKey.slice(0, 7) : '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY_IS_JWT: Boolean(anonKey && anonKey.startsWith('eyJ') && anonKey.split('.').length === 3),
    SUPABASE_SERVICE_ROLE_KEY_PRESENT: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    SUPABASE_SERVICE_KEY_PRESENT: Boolean(process.env.SUPABASE_SERVICE_KEY),
    SUPABASE_SECRET_KEY_PRESENT: Boolean(process.env.SUPABASE_SECRET_KEY),
    SERVICE_ROLE_KEY_RESOLVED: Boolean(serviceRoleKey),
    SERVICE_ROLE_KEY_LENGTH: serviceRoleKey ? serviceRoleKey.length : 0,
    SERVICE_ROLE_KEY_PREFIX: serviceRoleKey ? serviceRoleKey.slice(0, 7) : '',
    SERVICE_ROLE_KEY_IS_JWT: Boolean(serviceRoleKey && serviceRoleKey.startsWith('eyJ') && serviceRoleKey.split('.').length === 3),
    INTERNAL_API_URL_PRESENT: Boolean(process.env.INTERNAL_API_URL),
    NEXT_PUBLIC_API_URL_PRESENT: Boolean(process.env.NEXT_PUBLIC_API_URL),
    VERCEL_ENV: process.env.VERCEL_ENV || 'unknown',
    NODE_ENV: process.env.NODE_ENV || 'unknown',
  };

  // 2. DNS Resolution
  let dnsResult: { success: boolean; address?: string; error?: string } = { success: false };
  if (parsedHost && parsedHost !== 'INVALID_URL') {
    try {
      const lookup = await dns.lookup(parsedHost);
      dnsResult = { success: true, address: lookup.address };
    } catch (err: unknown) {
      dnsResult = {
        success: false,
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      };
    }
  }

  // 3. Supabase Auth Health Check
  let authHealth: { reachable: boolean; status?: number; error?: string } = { reachable: false };
  if (supabaseUrl) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      authHealth = { reachable: res.ok, status: res.status };
    } catch (err: unknown) {
      authHealth = {
        reachable: false,
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      };
    }
  }

  // 4. Supabase Auth Settings (with anon key)
  let authSettings: { reachable: boolean; status?: number; error?: string } = { reachable: false };
  if (supabaseUrl && anonKey) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/settings`, {
        headers: { apikey: anonKey },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      authSettings = { reachable: res.ok, status: res.status };
    } catch (err: unknown) {
      authSettings = {
        reachable: false,
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      };
    }
  }

  // 4b. Direct synthetic Supabase Auth token request: /auth/v1/token?grant_type=password
  let authTokenTest: { reachable: boolean; status?: number; responseBody?: string; error?: string } = { reachable: false };
  if (supabaseUrl && anonKey) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          apikey: anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'synthetic_probe_nonexistent@example.com',
          password: 'SyntheticTestPassword123!',
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const text = await res.text();
      authTokenTest = {
        reachable: true,
        status: res.status,
        responseBody: text.slice(0, 300),
      };
    } catch (err: unknown) {
      authTokenTest = {
        reachable: false,
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      };
    }
  }

  // 5. PostgREST Availability
  let restStatus: { reachable: boolean; status?: number; error?: string } = { reachable: false };
  if (supabaseUrl && anonKey) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/`, {
        headers: { apikey: anonKey },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      restStatus = { reachable: res.ok, status: res.status };
    } catch (err: unknown) {
      restStatus = {
        reachable: false,
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      };
    }
  }

  // 6. Privileged RPC check: fn_get_email_by_username
  let rpcGetEmailStatus: { executed: boolean; error?: unknown; hasResult?: boolean } = { executed: false };
  if (supabaseUrl && serviceRoleKey) {
    try {
      const serviceClient = createSupabaseClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false },
      });
      const { data, error } = await serviceClient.rpc('fn_get_email_by_username', {
        p_username: 'diagnostic_nonexistent_user',
      });
      rpcGetEmailStatus = {
        executed: !error,
        error: error ? { message: error.message, code: error.code, details: error.details, hint: error.hint } : null,
        hasResult: data !== undefined,
      };
    } catch (err: unknown) {
      rpcGetEmailStatus = {
        executed: false,
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      };
    }
  }

  // 6b. Ledger Query Diagnosis
  let ledgerQueryAudit: Record<string, unknown> = {};
  if (supabaseUrl && serviceRoleKey) {
    try {
      const serviceClient = createSupabaseClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false },
      });

      // Test 1: Exactly what backend transaction.service.ts executes
      const q1 = await serviceClient
        .from('transactions')
        .select(
          'id, user_id, amount_paise, type, category_id, transaction_date, payment_method, necessity, description, notes, account_id, import_batch_id, statement_reference, recorded_at, created_at, updated_at, deleted_at, categories(name)',
          { count: 'exact' }
        )
        .is('deleted_at', null)
        .limit(3);

      // Test 2: Without categories(name) join
      const q2 = await serviceClient
        .from('transactions')
        .select('id, user_id, amount_paise, type, category_id, transaction_date, payment_method, necessity, description, notes, created_at, updated_at, deleted_at')
        .is('deleted_at', null)
        .limit(3);

      // Test 3: With categories explicitly joined via fk
      const q3 = await serviceClient
        .from('transactions')
        .select('id, categories!fk_transactions_category_user_type(name)')
        .limit(3);

      // Test 4: Inspect table columns of transactions
      const q4 = await serviceClient
        .from('transactions')
        .select('*')
        .limit(1);

      ledgerQueryAudit = {
        test1_backend_exact: { error: q1.error, count: q1.count, rowCount: q1.data?.length },
        test2_no_join: { error: q2.error, rowCount: q2.data?.length },
        test3_explicit_fk_join: { error: q3.error, rowCount: q3.data?.length },
        test4_select_star: { error: q4.error, columns: q4.data && q4.data[0] ? Object.keys(q4.data[0]) : [] },
      };
    } catch (err: unknown) {
      ledgerQueryAudit = { exception: err instanceof Error ? err.message : String(err) };
    }
  }
  let rpcCheckAvailableStatus: { executed: boolean; error?: unknown; result?: unknown } = { executed: false };
  if (supabaseUrl && anonKey) {
    try {
      const anonClient = createSupabaseClient(supabaseUrl, anonKey, {
        auth: { persistSession: false },
      });
      const { data, error } = await anonClient.rpc('fn_check_username_available', {
        p_username: 'diagnostic_probe_test_xyz',
      });
      rpcCheckAvailableStatus = {
        executed: !error,
        error: error ? { message: error.message, code: error.code } : null,
        result: data,
      };
    } catch (err: unknown) {
      rpcCheckAvailableStatus = {
        executed: false,
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      };
    }
  }

  // 8. Backend reachability
  let backendStatus: { reachable: boolean; status?: number; error?: string } = { reachable: false };
  const backendUrl = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'https://arth-backend-nchl.onrender.com';
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${backendUrl.replace(/\/+$/, '')}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    backendStatus = { reachable: res.ok, status: res.status };
  } catch (err: unknown) {
    backendStatus = {
      reachable: false,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    };
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    envStatus,
    dnsResult,
    authHealth,
    authSettings,
    authTokenTest,
    restStatus,
    rpcGetEmailStatus,
    ledgerQueryAudit,
    rpcCheckAvailableStatus,
    backendStatus,
  });
}
