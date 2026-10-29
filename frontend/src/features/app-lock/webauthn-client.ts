'use client';

import {
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';
import type { AuthenticationResponseJSON, PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON, RegistrationResponseJSON } from '@simplewebauthn/server';

interface CeremonyOptions<TOptions> {
  options: TOptions;
  challengeId: string;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(typeof navigator !== 'undefined' && !navigator.onLine
      ? 'You are offline. Connect to the internet to verify your device. Arth remains locked.'
      : 'Could not contact the verification service. Arth remains locked.');
  }
  const result = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(result.error || 'Device verification could not be completed.');
  return result;
}

function friendlyAuthenticatorError(error: unknown, purpose: 'setup' | 'unlock'): Error {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError') {
    return new Error(purpose === 'setup'
      ? 'Device setup was cancelled or timed out. Try again when ready.'
      : 'Device verification was cancelled or timed out. Arth remains locked.');
  }
  if (name === 'NotSupportedError' || name === 'SecurityError') {
    return new Error('This browser cannot use the configured device authenticator.');
  }
  if (name === 'InvalidStateError') {
    return new Error('This authenticator may already be set up for Arth.');
  }
  return new Error(purpose === 'setup'
    ? 'Device setup could not be completed. Try again.'
    : 'Device verification failed. Arth remains locked.');
}

export async function canUsePlatformAuthenticator(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.isSecureContext || !browserSupportsWebAuthn()) return false;
  try {
    return await platformAuthenticatorIsAvailable();
  } catch {
    return false;
  }
}

export async function registerPlatformCredential(deviceId: string): Promise<void> {
  const options = await postJson<CeremonyOptions<PublicKeyCredentialCreationOptionsJSON>>(
    '/api/app-lock/registration/options', { deviceId },
  );
  let credential: RegistrationResponseJSON;
  try {
    credential = await startRegistration({ optionsJSON: options.options });
  } catch (error) {
    throw friendlyAuthenticatorError(error, 'setup');
  }
  await postJson('/api/app-lock/registration/verify', {
    deviceId,
    challengeId: options.challengeId,
    credential,
  });
}

export async function verifyPlatformCredential(deviceId: string): Promise<void> {
  const options = await postJson<CeremonyOptions<PublicKeyCredentialRequestOptionsJSON>>(
    '/api/app-lock/authentication/options', { deviceId },
  );
  let credential: AuthenticationResponseJSON;
  try {
    credential = await startAuthentication({ optionsJSON: options.options });
  } catch (error) {
    throw friendlyAuthenticatorError(error, 'unlock');
  }
  await postJson('/api/app-lock/authentication/verify', {
    deviceId,
    challengeId: options.challengeId,
    credential,
  });
}
