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

export interface GcpAudienceConfig {
  /**
   * Google STS provider resource name for external account routing.
   * Format: //iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}
   * Used as the `audience` attribute in ExternalAccountClient / token exchange request.
   */
  stsAudience: string | null;

  /**
   * Expected audience claim (aud) inside the Vercel OIDC subject token (JWT).
   * In 'allowed' mode (official Vercel GCP guide): https://vercel.com/[TEAM_SLUG] or custom URL.
   * In 'default' mode: https://iam.googleapis.com/projects/...
   */
  oidcAudience: string | null;

  /**
   * Provider audience mode:
   * - 'allowed': Provider configured with Allowed Audiences (standard Vercel setup).
   * - 'default': Provider configured with Google's auto-generated Default Audience URL.
   */
  mode: 'allowed' | 'default';
}

/**
 * Returns the Vercel team slug for OIDC audience resolution.
 * Prioritizes VERCEL_TEAM_SLUG, then VERCEL_PROJECT_OWNER, and defaults to 'anshkmrn-8908s-projects'.
 */
export function getVercelTeamSlug(): string {
  return (
    process.env.VERCEL_TEAM_SLUG?.trim() ||
    process.env.VERCEL_PROJECT_OWNER?.trim() ||
    'anshkmrn-8908s-projects'
  );
}

/**
 * Returns the GCP Workload Identity Pool Provider resource URI.
 * Form: //iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}
 * Always starts with //iam.googleapis.com/projects/. Never returns a non-GCP resource URI.
 */
export function getGcpProviderResourceName(): string | null {
  const projectNumber = process.env.GCP_PROJECT_NUMBER?.trim();
  const poolId = process.env.GCP_WORKLOAD_IDENTITY_POOL_ID?.trim();
  const providerId = process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID?.trim();

  if (projectNumber && poolId && providerId) {
    return `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`;
  }

  const customResource = process.env.GCP_PROVIDER_RESOURCE_NAME?.trim();
  if (customResource) {
    if (customResource.startsWith('//iam.googleapis.com/projects/')) {
      return customResource;
    }
    if (customResource.startsWith('https://iam.googleapis.com/projects/')) {
      return customResource.replace(/^https:/, '');
    }
  }

  const rawAudience = process.env.GCP_AUDIENCE?.trim();
  if (rawAudience) {
    if (rawAudience.startsWith('//iam.googleapis.com/projects/')) {
      return rawAudience;
    }
    if (rawAudience.startsWith('https://iam.googleapis.com/projects/')) {
      return rawAudience.replace(/^https:/, '');
    }
  }

  return null;
}

/**
 * Returns Google Cloud's auto-generated default audience URL for the provider.
 * Form: https://iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}
 * Used when the GCP Workload Identity Provider is configured in "Default audience" mode.
 */
export function getGcpDefaultAudience(): string | null {
  const resourceName = getGcpProviderResourceName();
  if (!resourceName) return null;
  return `https:${resourceName}`;
}

/**
 * Resolves the separate audiences needed for Google Cloud Workload Identity Federation:
 * 1. stsAudience: The provider resource identifier passed to Google ExternalAccountClient (always //iam.googleapis.com/...)
 * 2. oidcAudience: The audience claim requested in the Vercel OIDC subject token (aud claim in JWT)
 *
 * Supports both Google Cloud provider modes:
 * - 'allowed' (Recommended by official Vercel guide https://vercel.com/docs/oidc/gcp):
 *    Provider is configured with Allowed Audiences (e.g. https://vercel.com/anshkmrn-8908s-projects).
 * - 'default':
 *    Provider is configured with Google's auto-generated Default Audience (https://iam.googleapis.com/projects/...).
 */
export function resolveGcpAudienceConfig(): GcpAudienceConfig {
  const stsAudience = getGcpProviderResourceName();
  const rawMode = process.env.GCP_AUDIENCE_MODE?.trim().toLowerCase();
  const rawAudience = process.env.GCP_AUDIENCE?.trim();
  const teamSlug = getVercelTeamSlug();
  const standardAllowedAudience = `https://vercel.com/${teamSlug}`;

  // If GCP WIF is not configured (no provider resource name and no explicit audience)
  if (!stsAudience && !rawAudience) {
    return {
      stsAudience: null,
      oidcAudience: null,
      mode: 'allowed',
    };
  }

  // 1. Explicit mode flag takes precedence
  if (rawMode === 'default') {
    return {
      stsAudience,
      oidcAudience:
        getGcpDefaultAudience() ||
        (rawAudience?.startsWith('https://') ? rawAudience : null),
      mode: 'default',
    };
  }

  if (rawMode === 'allowed') {
    const oidcAudience =
      rawAudience &&
      !rawAudience.startsWith('https://iam.googleapis.com/') &&
      !rawAudience.startsWith('//iam.googleapis.com/') &&
      rawAudience.toLowerCase() !== 'default'
        ? rawAudience
        : standardAllowedAudience;

    return {
      stsAudience,
      oidcAudience,
      mode: 'allowed',
    };
  }

  // 2. Infer mode from GCP_AUDIENCE value
  if (
    rawAudience?.toLowerCase() === 'default' ||
    rawAudience?.toLowerCase() === 'default-audience'
  ) {
    return {
      stsAudience,
      oidcAudience: getGcpDefaultAudience(),
      mode: 'default',
    };
  }

  if (
    rawAudience?.startsWith('https://iam.googleapis.com/') ||
    rawAudience?.startsWith('//iam.googleapis.com/')
  ) {
    return {
      stsAudience,
      oidcAudience: rawAudience.startsWith('//')
        ? `https:${rawAudience}`
        : rawAudience,
      mode: 'default',
    };
  }

  if (rawAudience) {
    return {
      stsAudience,
      oidcAudience: rawAudience,
      mode: 'allowed',
    };
  }

  // 3. Default when GCP_AUDIENCE is not set:
  // Follows the official Vercel GCP guide (Allowed audiences: https://vercel.com/[TEAM_SLUG])
  return {
    stsAudience,
    oidcAudience: standardAllowedAudience,
    mode: 'allowed',
  };
}

/**
 * Returns the expected OIDC audience claim for Vercel OIDC token requests.
 * In 'allowed' mode (default), returns https://vercel.com/[TEAM_SLUG] or custom allowed audience.
 * In 'default' mode, returns the GCP provider default audience URL (https://iam.googleapis.com/...).
 */
export function getGcpAudience(): string | null {
  const config = resolveGcpAudienceConfig();
  return config.oidcAudience || config.stsAudience;
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

  if (
    saEmail &&
    (getGcpProviderResourceName() || (poolId && providerId && (projectNumber || audience)))
  ) {
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
  const { stsAudience, oidcAudience } = resolveGcpAudienceConfig();

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
