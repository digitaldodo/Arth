import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { getAppLockContext, createChallenge, getRelyingParty, hasReasonableBodySize, isSameOriginRequest, jsonResponse, validDeviceId } from '@/lib/app-lock/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: 'Request could not be verified.' }, 403);
  if (!hasReasonableBodySize(request)) return jsonResponse({ error: 'Request is too large.' }, 413);
  let body: { deviceId?: unknown };
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid request.' }, 400); }
  if (!validDeviceId(body.deviceId)) return jsonResponse({ error: 'Device setup was not found.' }, 400);

  try {
    const context = await getAppLockContext();
    if (!context) return jsonResponse({ error: 'Your session could not be verified. Sign in again and retry.' }, 401);
    const { data: credentials, error } = await context.admin.from('app_lock_credentials')
      .select('credential_id, transports').eq('user_id', context.userId).eq('device_id', body.deviceId);
    if (error) return jsonResponse({ error: 'App Lock is temporarily unavailable.' }, 503);
    if (!credentials?.length) return jsonResponse({ error: 'No authenticator is configured for this device.' }, 404);

    const { origin, rpID } = getRelyingParty(new URL(request.url).origin);
    const options = await generateAuthenticationOptions({
      rpID,
      timeout: 120_000,
      userVerification: 'required',
      allowCredentials: credentials.map((credential) => ({
        id: credential.credential_id,
        transports: credential.transports ?? undefined,
      })),
    });
    const challengeId = await createChallenge(context, body.deviceId, 'authentication', options.challenge);
    return jsonResponse({ options, challengeId, origin, rpID });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Could not start device verification.' }, 503);
  }
}
