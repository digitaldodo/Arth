/**
 * Secure Passcode Key Derivation & Verification via Web Crypto API.
 * Uses PBKDF2 with SHA-256, 100,000 iterations, and a 16-byte cryptographically
 * secure random salt. The passcode is NEVER stored in plaintext.
 * Verification runs 100% locally and works completely offline without network.
 */

const PBKDF2_ITERATIONS = 100_000;
const HASH_ALGO = 'SHA-256';
const SALT_BYTES = 16;
const KEY_BITS = 256;

function bufToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBuf(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes.buffer;
}

export function generateSalt(): string {
  if (typeof crypto === 'undefined' || !crypto.getRandomValues) {
    throw new Error('Web Crypto API is not available on this platform.');
  }
  const bytes = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(bytes);
  return bufToHex(bytes.buffer);
}

/**
 * Derives a PBKDF2-SHA-256 verification hash for the given passcode and salt.
 */
export async function derivePasscodeHash(
  passcode: string,
  saltHex?: string
): Promise<{ saltHex: string; hashHex: string }> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('Web Crypto subtle API is not available in this environment.');
  }

  const salt = saltHex ? hexToBuf(saltHex) : hexToBuf(generateSalt());
  const actualSaltHex = saltHex || bufToHex(salt);

  const encoder = new TextEncoder();
  const rawKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passcode),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: HASH_ALGO,
    },
    rawKey,
    KEY_BITS
  );

  return {
    saltHex: actualSaltHex,
    hashHex: bufToHex(derivedBits),
  };
}

/**
 * Constant-time comparison of two hex strings to prevent timing attacks.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Verifies an entered passcode against stored verification salt and hash.
 */
export async function verifyPasscode(
  enteredPasscode: string,
  storedSaltHex: string,
  storedHashHex: string
): Promise<boolean> {
  if (!enteredPasscode || !storedSaltHex || !storedHashHex) return false;
  try {
    const { hashHex } = await derivePasscodeHash(enteredPasscode, storedSaltHex);
    return timingSafeEqual(hashHex, storedHashHex);
  } catch {
    return false;
  }
}
