import crypto from 'node:crypto';

/**
 * In-memory token cache to prevent excessive token requests to Google OAuth.
 */
let cachedToken: {
  accessToken: string;
  expiresAt: number;
} | null = null;

/**
 * Returns whether Google service account credentials are fully configured.
 */
export function isGoogleServiceAccountConfigured(): boolean {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim();
  return Boolean(email && key);
}

/**
 * Returns the public service account email address for UI display.
 */
export function getServiceAccountEmail(): string | null {
  return process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() || null;
}

/**
 * Generates an OAuth2 access token for Google Sheets API using the service account credentials.
 * Uses Node.js native crypto to sign RS256 JWT assertion per RFC 7523.
 */
export async function getGoogleSheetsAccessToken(): Promise<string> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  let privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim();

  if (!email || !privateKey) {
    throw new Error(
      'Google Service Account credentials not configured. Please set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.'
    );
  }

  // Handle environment variables where newlines were escaped as literal `\n`
  if (privateKey.includes('\\n')) {
    privateKey = privateKey.replace(/\\n/g, '\n');
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

  // Sign using RSA-SHA256
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signInput);
  signer.end();
  const signature = signer
    .sign(privateKey)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

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
    throw new Error(
      `Failed to obtain Google OAuth access token (${res.status}): ${errorBody}`
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
