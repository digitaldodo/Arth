import 'server-only';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getAppOrigin } from '@/lib/auth-config';
import type { AppLockDatabase } from './database.types';
export { getRelyingParty } from './relying-party';

const CHALLENGE_TTL_MS = 2 * 60 * 1000;
const MAX_RECENT_CHALLENGES = 12;

export type AppLockCeremony = 'registration' | 'authentication';

export interface AppLockContext {
  userId: string;
  admin: SupabaseClient<AppLockDatabase>;
}

export async function getAppLockContext(): Promise<AppLockContext | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('App Lock is not configured on this server.');
  }

  const sessionClient = await createClient();
  const { data: { user }, error } = await sessionClient.auth.getUser();
  if (error || !user) return null;

  const admin = createSupabaseClient<AppLockDatabase>(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  return { userId: user.id, admin };
}

export function validDeviceId(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get('origin');
  const configuredOrigin = getAppOrigin(request.headers);
  return Boolean(origin && origin === new URL(request.url).origin && origin === configuredOrigin);
}

export function hasReasonableBodySize(request: Request, maxBytes = 64 * 1024): boolean {
  const contentLength = request.headers.get('content-length');
  if (!contentLength) return true;
  const size = Number(contentLength);
  return Number.isFinite(size) && size >= 0 && size <= maxBytes;
}

export async function createChallenge(
  context: AppLockContext,
  deviceId: string,
  ceremony: AppLockCeremony,
  challenge: string,
): Promise<string> {
  const { count, error: countError } = await context.admin
    .from('app_lock_challenges')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', context.userId)
    .eq('device_id', deviceId)
    .gte('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString());
  if (countError) throw new Error('App Lock is temporarily unavailable.');
  if ((count ?? 0) >= MAX_RECENT_CHALLENGES) {
    throw new Error('Too many attempts. Wait a few minutes and try again.');
  }

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await context.admin
    .from('app_lock_challenges')
    .delete()
    .eq('user_id', context.userId)
    .eq('device_id', deviceId)
    .lt('created_at', cutoff);
  // A new ceremony invalidates any unfinished prompt on this device.
  await context.admin
    .from('app_lock_challenges')
    .update({ consumed_at: new Date().toISOString(), challenge: null })
    .eq('user_id', context.userId)
    .eq('device_id', deviceId)
    .eq('ceremony', ceremony)
    .is('consumed_at', null);

  const { data, error } = await context.admin
    .from('app_lock_challenges')
    .insert({
      user_id: context.userId,
      device_id: deviceId,
      ceremony,
      challenge,
      expires_at: new Date(Date.now() + CHALLENGE_TTL_MS).toISOString(),
    })
    .select('id')
    .single();
  if (error || !data) throw new Error('App Lock is temporarily unavailable.');
  return data.id;
}

export async function consumeChallenge(
  context: AppLockContext,
  challengeId: unknown,
  deviceId: string,
  ceremony: AppLockCeremony,
): Promise<string | null> {
  if (typeof challengeId !== 'string' || challengeId.length > 64) return null;
  const now = new Date().toISOString();
  const { data: pending, error: readError } = await context.admin
    .from('app_lock_challenges')
    .select('challenge')
    .eq('id', challengeId)
    .eq('user_id', context.userId)
    .eq('device_id', deviceId)
    .eq('ceremony', ceremony)
    .gt('expires_at', now)
    .is('consumed_at', null)
    .maybeSingle();
  if (readError || !pending?.challenge) return null;

  const { data, error } = await context.admin
    .from('app_lock_challenges')
    .update({ consumed_at: now, challenge: null })
    .eq('id', challengeId)
    .eq('user_id', context.userId)
    .eq('device_id', deviceId)
    .eq('ceremony', ceremony)
    .gt('expires_at', now)
    .is('consumed_at', null)
    .select('challenge')
    .maybeSingle();
  // The returned challenge column is nulled atomically, so the value read before
  // consumption is returned only if this request won the one-use update.
  if (error || !data) return null;
  return pending.challenge;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}
