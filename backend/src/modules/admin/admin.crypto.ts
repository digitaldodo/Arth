import crypto from 'node:crypto';
import type { AdminRole } from '@arth/contracts';

const SCRYPT_PREFIX = 'scrypt';

export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `${SCRYPT_PREFIX}:${salt}:${derived}`;
}

export function verifyPasswordHash(plain: string, storedHash: string | null | undefined): boolean {
  if (!plain || !storedHash) return false;
  const parts = storedHash.split(':');
  if (parts.length !== 3 || parts[0] !== SCRYPT_PREFIX) return false;
  const [, salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  try {
    const derived = crypto.scryptSync(plain, salt, 64);
    const expected = Buffer.from(expectedHex, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

export function generateOpaqueToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function generateNumericOtp(digits = 6): string {
  const min = 10 ** (digits - 1);
  const max = 10 ** digits;
  return String(crypto.randomInt(min, max));
}

export interface PasswordPolicyResult {
  valid: boolean;
  reason?: string;
}

export function validatePermanentPasswordPolicy(
  password: string,
  username: string,
  tempHashToReject: string | null,
  knownForbiddenHashes: string[]
): PasswordPolicyResult {
  if (typeof password !== 'string' || password.length < 12) {
    return { valid: false, reason: 'Password must be at least 12 characters long.' };
  }
  if (password.length > 128) {
    return { valid: false, reason: 'Password must be at most 128 characters long.' };
  }
  if (/^\d+$/.test(password)) {
    return { valid: false, reason: 'Numeric roll-number style passwords are not permitted.' };
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return {
      valid: false,
      reason: 'Password must include uppercase, lowercase, a number, and a special character.',
    };
  }
  if (password.toLowerCase().includes(username.trim().toLowerCase())) {
    return { valid: false, reason: 'Password must not contain your administrator username.' };
  }
  if (tempHashToReject && verifyPasswordHash(password, tempHashToReject)) {
    return { valid: false, reason: 'Temporary credential cannot be reused as a permanent password.' };
  }
  for (const hash of knownForbiddenHashes) {
    if (verifyPasswordHash(password, hash)) {
      return { valid: false, reason: 'Temporary roll-number credentials cannot be used as permanent passwords.' };
    }
  }
  return { valid: true };
}

export interface AdminTokenPayload {
  iss: 'spendsense-admin';
  sub: string;
  sid: string;
  role: AdminRole;
  sv: number;
  iat: number;
  exp: number;
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

export function signAdminSessionToken(
  payload: Omit<AdminTokenPayload, 'iss' | 'iat' | 'exp'>,
  secret: string,
  ttlSeconds = 60 * 60 * 8
): string {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: AdminTokenPayload = {
    iss: 'spendsense-admin',
    ...payload,
    iat: now,
    exp: now + ttlSeconds,
  };
  const headerB64 = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadB64 = base64UrlEncode(JSON.stringify(fullPayload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = crypto.createHmac('sha256', secret).update(signingInput).digest('base64url');
  return `${signingInput}.${sig}`;
}

export function verifyAdminSessionToken(token: string, secret: string): AdminTokenPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;
  if (!headerB64 || !payloadB64 || !sigB64) return null;

  try {
    const signingInput = `${headerB64}.${payloadB64}`;
    const expectedSig = crypto.createHmac('sha256', secret).update(signingInput).digest();
    const actualSig = Buffer.from(sigB64, 'base64url');
    if (expectedSig.length !== actualSig.length || !crypto.timingSafeEqual(expectedSig, actualSig)) {
      return null;
    }

    const header = JSON.parse(base64UrlDecode(headerB64)) as { alg?: string; typ?: string };
    if (header.alg !== 'HS256') return null;

    const payload = JSON.parse(base64UrlDecode(payloadB64)) as AdminTokenPayload;
    if (
      payload.iss !== 'spendsense-admin' ||
      typeof payload.sub !== 'string' ||
      typeof payload.sid !== 'string' ||
      typeof payload.sv !== 'number' ||
      typeof payload.exp !== 'number'
    ) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
