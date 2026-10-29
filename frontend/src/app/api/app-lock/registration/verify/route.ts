import { verifyRegistrationResponse, type RegistrationResponseJSON } from '@simplewebauthn/server';
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
    const challenge = await consumeChallenge(context, body.challengeId, body.deviceId, 'registration');
    if (!challenge) return jsonResponse({ error: 'The setup request expired. Start setup again.' }, 400);
    const { origin, rpID } = getRelyingParty(new URL(request.url).origin);
    const verification = await verifyRegistrationResponse({
      response: body.credential as RegistrationResponseJSON,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
    if (!verification.verified || !verification.registrationInfo.userVerified) {
      return jsonResponse({ error: 'Device verification did not complete. Try again.' }, 400);
    }

    const credential = verification.registrationInfo.credential;
    const { error } = await context.admin.from('app_lock_credentials').insert({
      credential_id: credential.id,
      user_id: context.userId,
      device_id: body.deviceId,
      public_key: isoBase64URL.fromBuffer(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? [],
    });
    if (error) return jsonResponse({ error: 'Could not save this device. Try setup again.' }, 409);
    return jsonResponse({ configured: true });
  } catch {
    return jsonResponse({ error: 'Device setup could not be verified. Try again.' }, 400);
  }
}
