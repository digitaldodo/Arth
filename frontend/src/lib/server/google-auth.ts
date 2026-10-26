import { getVercelOidcToken } from '@vercel/oidc';
import {
  BaseExternalAccountClient,
  ExternalAccountClient,
  JWT,
} from 'google-auth-library';

export type GoogleAuthMode = 'keyless_oidc' | 'service_account_key' | 'unconfigured';

export interface GoogleServiceAccountCredentials {
  email: string | null;
  privateKey: string | null;
}

export interface CreateGcpExternalAccountClientOptions {
  customSubjectTokenSupplier?: (context: { audience?: string }) => Promise<string>;
}

export const GOOGLE_SHEETS_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
];

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
 * Returns the GCP Workload Identity Pool Provider resource URI.
 * Form: //iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}
 */
export function getGcpProviderResourceName(): string | null {
  const projectNumber = process.env.GCP_PROJECT_NUMBER?.trim();
  const poolId = process.env.GCP_WORKLOAD_IDENTITY_POOL_ID?.trim();
  const providerId = process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID?.trim();

  if (projectNumber && poolId && providerId) {
    return `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`;
  }

  const audience = process.env.GCP_AUDIENCE?.trim();
  if (audience && audience.startsWith('//iam.googleapis.com/projects/')) {
    return audience;
  }

  return null;
}

/**
 * Returns the expected OIDC audience claim for Vercel OIDC token requests.
 * Defaults to the GCP Workload Identity Pool Provider resource URI if GCP_AUDIENCE is not explicitly set.
 */
export function getGcpAudience(): string | null {
  return process.env.GCP_AUDIENCE?.trim() || getGcpProviderResourceName();
}

/**
 * Returns the public service account email address for UI display and impersonation.
 * Prioritizes GCP_SERVICE_ACCOUNT_EMAIL, then GOOGLE_SERVICE_ACCOUNT_EMAIL,
 * then credentials parsed from JSON strings.
 */
export function getServiceAccountEmail(): string | null {
  const gcpEmail = process.env.GCP_SERVICE_ACCOUNT_EMAIL?.trim();
  if (gcpEmail) return gcpEmail;

  const googleEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  if (googleEmail) return googleEmail;

  const { email } = getGoogleCredentials();
  return email;
}

/**
 * Determines the active authentication mode for Google Sheets integration.
 * - 'keyless_oidc': Workload Identity Federation via Vercel OIDC (recommended production setup)
 * - 'service_account_key': Direct RSA private key credentials (local development fallback)
 * - 'unconfigured': Missing required configuration
 */
export function getGoogleAuthMode(): GoogleAuthMode {
  const saEmail = getServiceAccountEmail();
  const poolId = process.env.GCP_WORKLOAD_IDENTITY_POOL_ID?.trim();
  const providerId = process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID?.trim();
  const projectNumber = process.env.GCP_PROJECT_NUMBER?.trim();
  const audience = process.env.GCP_AUDIENCE?.trim();

  if (saEmail && poolId && providerId && (projectNumber || audience)) {
    return 'keyless_oidc';
  }

  const { email, privateKey } = getGoogleCredentials();
  if (
    email &&
    privateKey &&
    privateKey.includes('BEGIN') &&
    privateKey.includes('PRIVATE KEY')
  ) {
    return 'service_account_key';
  }

  return 'unconfigured';
}

/**
 * Returns whether Google service account authentication is configured.
 * True if either keyless WIF (Vercel OIDC) or RSA service-account key credentials are provided.
 */
export function isGoogleServiceAccountConfigured(): boolean {
  return getGoogleAuthMode() !== 'unconfigured';
}

/**
 * Constructs an ExternalAccountClient for Google Cloud Workload Identity Federation using Vercel OIDC.
 */
export function createGcpExternalAccountClient(
  options?: CreateGcpExternalAccountClientOptions
): BaseExternalAccountClient | null {
  const serviceAccountEmail = getServiceAccountEmail();
  const stsAudience = getGcpProviderResourceName() || getGcpAudience();
  const oidcAudience = getGcpAudience();

  if (!serviceAccountEmail || !stsAudience) {
    return null;
  }

  const client = ExternalAccountClient.fromJSON({
    type: 'external_account',
    audience: stsAudience,
    subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    token_url: 'https://sts.googleapis.com/v1/token',
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccountEmail}:generateAccessToken`,
    scopes: GOOGLE_SHEETS_SCOPES,
    subject_token_supplier: {
      getSubjectToken: async () => {
        if (options?.customSubjectTokenSupplier) {
          return await options.customSubjectTokenSupplier({
            audience: oidcAudience || undefined,
          });
        }
        return await getVercelOidcToken(
          oidcAudience ? { audience: oidcAudience } : undefined
        );
      },
    },
  });

  return client;
}

// In-memory client caches (managed by google-auth-library with internal token reuse & expiration checks)
let cachedExternalClient: BaseExternalAccountClient | null = null;
let cachedJwtClient: JWT | null = null;

export function setCachedExternalClient(client: BaseExternalAccountClient | null): void {
  cachedExternalClient = client;
}

export function setCachedJwtClient(client: JWT | null): void {
  cachedJwtClient = client;
}

/**
 * Resets cached clients and access tokens (useful for testing or configuration changes).
 */
export function clearGoogleTokenCache(): void {
  cachedExternalClient = null;
  cachedJwtClient = null;
}

/**
 * Generates an OAuth2 access token for Google Sheets API operations.
 * - In keyless mode (Vercel production): exchanges short-lived Vercel OIDC token through
 *   Google STS and impersonates the target Google Service Account.
 * - In service-account-key mode (local development fallback): signs RS256 JWT using
 *   the configured private key.
 */
export async function getGoogleSheetsAccessToken(): Promise<string> {
  const mode = getGoogleAuthMode();

  if (mode === 'unconfigured') {
    throw new Error(
      'Google Sheets integration is not configured. For keyless production (Vercel OIDC), configure GCP_PROJECT_NUMBER, GCP_WORKLOAD_IDENTITY_POOL_ID, GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID, and GCP_SERVICE_ACCOUNT_EMAIL. For local development, configure GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.'
    );
  }

  if (mode === 'keyless_oidc') {
    try {
      if (!cachedExternalClient) {
        cachedExternalClient = createGcpExternalAccountClient();
      }
      if (!cachedExternalClient) {
        throw new Error(
          'Failed to initialize Google Cloud ExternalAccountClient. Please verify GCP environment variables.'
        );
      }

      const tokenResponse = await cachedExternalClient.getAccessToken();
      const token =
        typeof tokenResponse === 'string'
          ? tokenResponse
          : tokenResponse?.token;

      if (!token) {
        throw new Error(
          'Google Cloud STS / IAM impersonation did not return an access token.'
        );
      }

      return token;
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : String(err);
      console.error(
        '[GoogleAuth:Keyless] Failed to obtain Google Sheets access token via Vercel OIDC:',
        errMessage
      );
      throw new Error(`Google Sheets authentication failed: ${errMessage}`);
    }
  }

  // mode === 'service_account_key'
  try {
    if (!cachedJwtClient) {
      const { email, privateKey } = getGoogleCredentials();
      if (!email || !privateKey) {
        throw new Error(
          'Google Service Account credentials not configured. Please set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.'
        );
      }
      cachedJwtClient = new JWT({
        email,
        key: privateKey,
        scopes: GOOGLE_SHEETS_SCOPES,
      });
    }

    const tokenResponse = await cachedJwtClient.getAccessToken();
    const token =
      typeof tokenResponse === 'string'
        ? tokenResponse
        : tokenResponse?.token;

    if (!token) {
      throw new Error('Google OAuth2 JWT signing did not return an access token.');
    }

    return token;
  } catch (err: unknown) {
    const errMessage = err instanceof Error ? err.message : String(err);
    console.error(
      '[GoogleAuth:ServiceAccountKey] Failed to obtain Google Sheets access token:',
      errMessage.includes('DECODER')
        ? 'PEM DECODER error (invalid key format)'
        : errMessage
    );
    throw new Error(`Google Sheets authentication failed: ${errMessage}`);
  }
}
