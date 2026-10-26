import crypto from 'node:crypto';

/**
 * In-memory token cache to prevent excessive token requests to Google OAuth.
 */
let cachedToken: {
  accessToken: string;
  expiresAt: number;
} | null = null;

export interface GoogleServiceAccountCredentials {
  email: string | null;
  privateKey: string | null;
}

/**
 * Normalizes a Google service account PEM private key from various environment variable formats.
 * Handles:
 * - Literal \n and \\n unescaping
 * - Surrounding quotes (double quotes, single quotes, escaped quotes)
 * - Complete JSON credentials parsing if user pasted JSON into private key or key env
 * - Windows CRLF line endings
 * - Preserves existing valid newlines without corrupting
 */
export function normalizeGooglePrivateKey(rawInput?: string | null): string | null {
  if (!rawInput || typeof rawInput !== 'string') return null;

  let key = rawInput.trim();
  if (!key) return null;

  // 1. If the input is wrapped in JSON (e.g. user pasted the whole service account key file)
  if (key.startsWith('{') && key.endsWith('}')) {
    try {
      const parsed = JSON.parse(key);
      if (parsed.private_key && typeof parsed.private_key === 'string') {
        key = parsed.private_key.trim();
      }
    } catch {
      // Continue parsing as raw string
    }
  }

  // 2. Strip surrounding escaped quotes: \"...\"
  if (key.startsWith('\\"') && key.endsWith('\\"') && key.length > 4) {
    key = key.slice(2, -2).trim();
  }

  // 3. Strip surrounding quotes: "..." or '...'
  if (
    (key.startsWith('"') && key.endsWith('"') && key.length > 2) ||
    (key.startsWith("'") && key.endsWith("'") && key.length > 2)
  ) {
    key = key.slice(1, -1).trim();
  }

  // 4. Handle escaped newlines
  if (key.includes('\\\\n')) {
    key = key.replace(/\\\\n/g, '\n');
  }
  if (key.includes('\\n')) {
    key = key.replace(/\\n/g, '\n');
  }

  // 5. Standardize carriage returns
  key = key.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 6. Strip any trailing/leading whitespace or stray quotes after unescaping
  key = key.trim();
  if (
    (key.startsWith('"') && key.endsWith('"') && key.length > 2) ||
    (key.startsWith("'") && key.endsWith("'") && key.length > 2)
  ) {
    key = key.slice(1, -1).trim();
  }

  return key;
}

/**
 * Derives Google service account credentials from supported environment variables.
 * Prioritizes GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
 * with fallbacks for complete JSON credential strings in GOOGLE_SERVICE_ACCOUNT_KEY,
 * GOOGLE_CREDENTIALS, or GOOGLE_APPLICATION_CREDENTIALS.
 */
export function getGoogleCredentials(): GoogleServiceAccountCredentials {
  let email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() || null;
  let rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim() || null;

  // Fallback 1: Check if full JSON credential was placed in GOOGLE_SERVICE_ACCOUNT_KEY or GOOGLE_CREDENTIALS
  if (!email || !rawKey) {
    const jsonEnv =
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.trim() ||
      process.env.GOOGLE_CREDENTIALS?.trim() ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();

    if (jsonEnv && jsonEnv.startsWith('{')) {
      try {
        const parsed = JSON.parse(jsonEnv);
        if (!email && parsed.client_email) {
          email = String(parsed.client_email).trim();
        }
        if (!rawKey && parsed.private_key) {
          rawKey = String(parsed.private_key).trim();
        }
      } catch {
        // Not valid JSON
      }
    }
  }

  // Fallback 2: Check if user pasted full JSON into GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
  if (rawKey && rawKey.startsWith('{')) {
    try {
      const parsed = JSON.parse(rawKey);
      if (!email && parsed.client_email) {
        email = String(parsed.client_email).trim();
      }
      if (parsed.private_key) {
        rawKey = String(parsed.private_key).trim();
      }
    } catch {
      // Not valid JSON
    }
  }

  const privateKey = normalizeGooglePrivateKey(rawKey);

  return {
    email: email || null,
    privateKey: privateKey || null,
  };
}

/**
 * Returns whether Google service account credentials are fully configured.
 */
export function isGoogleServiceAccountConfigured(): boolean {
  const { email, privateKey } = getGoogleCredentials();
  return Boolean(
    email &&
      privateKey &&
      privateKey.includes('BEGIN') &&
      privateKey.includes('PRIVATE KEY')
  );
}

/**
 * Returns the public service account email address for UI display.
 */
export function getServiceAccountEmail(): string | null {
  const { email } = getGoogleCredentials();
  return email;
}

/**
 * Generates an OAuth2 access token for Google Sheets API using the service account credentials.
 * Uses Node.js native crypto to sign RS256 JWT assertion per RFC 7523.
 */
export async function getGoogleSheetsAccessToken(): Promise<string> {
  const { email, privateKey } = getGoogleCredentials();

  if (!email || !privateKey) {
    throw new Error(
      'Google Service Account credentials not configured. Please set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.'
    );
  }

  if (
    !privateKey.includes('BEGIN') ||
    !privateKey.includes('PRIVATE KEY')
  ) {
    console.error(
      '[GoogleAuth] Configured private key is missing PEM BEGIN/END markers.'
    );
    throw new Error(
      'Google Sheets authentication failed. Please verify the server configuration and try again.'
    );
  }

  // Check cached token (with 5-minute safety buffer)
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now + 300) {
    return cachedToken.accessToken;
  }

  // Build JWT Header & Payload
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  const claimSet = {
    iss: email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const base64UrlEncode = (obj: object | string): string => {
    const str = typeof obj === 'string' ? obj : JSON.stringify(obj);
    return Buffer.from(str)
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  };

  const encodedHeader = base64UrlEncode(header);
  const encodedClaimSet = base64UrlEncode(claimSet);
  const signInput = `${encodedHeader}.${encodedClaimSet}`;

  // Sign using RSA-SHA256 with safe error interception
  let signature: string;
  try {
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(signInput);
    signer.end();
    signature = signer
      .sign(privateKey)
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  } catch (err: unknown) {
    const errMessage = err instanceof Error ? err.message : String(err);
    console.error(
      '[GoogleAuth] Failed to sign JWT with private key:',
      errMessage.includes('DECODER') ? 'PEM DECODER error (invalid key format)' : errMessage
    );
    throw new Error(
      'Google Sheets authentication failed. Please verify the server configuration and try again.'
    );
  }

  const assertion = `${signInput}.${signature}`;

  // Exchange assertion for Google OAuth2 access token
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    console.error(
      `[GoogleAuth] Google OAuth2 token exchange rejected (${res.status}):`,
      errorBody
    );
    if (res.status === 400 || res.status === 401) {
      if (errorBody.includes('invalid_grant')) {
        throw new Error(
          'Google Sheets authentication failed (invalid grant). Please verify the service account credentials in server configuration.'
        );
      }
    }
    throw new Error(
      'Google Sheets authentication failed. Please verify the server configuration and try again.'
    );
  }

  const tokenData = (await res.json()) as {
    access_token: string;
    expires_in: number;
    token_type: string;
  };

  cachedToken = {
    accessToken: tokenData.access_token,
    expiresAt: now + tokenData.expires_in,
  };

  return tokenData.access_token;
}

/**
 * Resets token cache (useful in tests).
 */
export function clearGoogleTokenCache(): void {
  cachedToken = null;
}
