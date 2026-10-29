import { verifyAuthenticationResponse, type AuthenticationResponseJSON } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { consumeChallenge, getAppLockContext, getRelyingParty, hasReasonableBodySize, isSameOriginRequest, jsonResponse, validDeviceId } from '@/lib/app-lock/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: 'Request could not be verified.' }, 403);
  if (!hasReasonableBodySize(request)) return jsonResponse({ error: 'Request is too large.' }, 413);
  let body: { deviceId?: unknown; challengeId?: unknown; credential?: unknown };
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid response.' }, 400); }
  if (!validDeviceId(body.deviceId) || !body.credential || typeof body.credential !== 'object') {
    return jsonResponse({ error: 'Invalid response.' }, 400);
  }

  try {
    const context = await getAppLockContext();
    if (!context) return jsonResponse({ error: 'Your session could not be verified.' }, 401);
    const challenge = await consumeChallenge(context, body.challengeId, body.deviceId, 'authentication');
    if (!challenge) return jsonResponse({ error: 'The verification request expired. Try again.' }, 400);

    const response = body.credential as AuthenticationResponseJSON;
    if (typeof response.id !== 'string') return jsonResponse({ error: 'Device verification failed.' }, 400);
    const { data: stored, error: lookupError } = await context.admin.from('app_lock_credentials')
      .select('credential_id, public_key, counter, transports')
      .eq('user_id', context.userId).eq('device_id', body.deviceId).eq('credential_id', response.id).maybeSingle();
    if (lookupError || !stored) return jsonResponse({ error: 'This authenticator is not registered for this device.' }, 401);

    const { origin, rpID } = getRelyingParty(new URL(request.url).origin);
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: stored.credential_id,
        publicKey: isoBase64URL.toBuffer(stored.public_key),
        counter: Number(stored.counter),
        transports: stored.transports ?? undefined,
      },
    });
    if (!verification.verified || !verification.authenticationInfo.userVerified) {
      return jsonResponse({ error: 'Device verification failed. Arth remains locked.' }, 401);
    }

    const { data: updatedCredential, error: updateError } = await context.admin.from('app_lock_credentials')
      .update({ counter: verification.authenticationInfo.newCounter, updated_at: new Date().toISOString() })
      .eq('credential_id', stored.credential_id).eq('user_id', context.userId)
      .eq('device_id', body.deviceId).eq('counter', stored.counter)
      .select('credential_id').maybeSingle();
    if (updateError || !updatedCredential) return jsonResponse({ error: 'Verification could not be completed. Try again.' }, 503);
    return jsonResponse({ verified: true });
  } catch {
    return jsonResponse({ error: 'Device verification failed. Arth remains locked.' }, 401);
  }
}
