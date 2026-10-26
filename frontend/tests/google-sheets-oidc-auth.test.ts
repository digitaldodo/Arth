import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getGcpProviderResourceName,
  getGcpDefaultAudience,
  resolveGcpAudienceConfig,
  getVercelTeamSlug,
  getGcpAudience,
  getServiceAccountEmail,
  getGoogleAuthMode,
  isGoogleServiceAccountConfigured,
  createGcpExternalAccountClient,
  getGoogleSheetsAccessToken,
  clearGoogleTokenCache,
  setCachedExternalClient,
  GOOGLE_SHEETS_SCOPES,
} from '../src/lib/server/google-auth';
import {
  verifyAndInitializeSheet,
  extractSpreadsheetId,
} from '../src/lib/server/google-sheets-client';

describe('Google Cloud Workload Identity Federation with Vercel OIDC', () => {
  const envBackup: Record<string, string | undefined> = {};
  const gcpEnvKeys = [
    'GCP_PROJECT_ID',
    'GCP_PROJECT_NUMBER',
    'GCP_SERVICE_ACCOUNT_EMAIL',
    'GCP_WORKLOAD_IDENTITY_POOL_ID',
    'GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID',
    'GCP_AUDIENCE',
    'GCP_AUDIENCE_MODE',
    'GCP_PROVIDER_RESOURCE_NAME',
    'VERCEL_TEAM_SLUG',
    'VERCEL_PROJECT_OWNER',
    'GOOGLE_SERVICE_ACCOUNT_EMAIL',
    'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY',
    'GOOGLE_SERVICE_ACCOUNT_KEY',
  ];

  beforeEach(() => {
    for (const key of gcpEnvKeys) {
      envBackup[key] = process.env[key];
      delete process.env[key];
    }
    clearGoogleTokenCache();
  });

  afterEach(() => {
    for (const key of gcpEnvKeys) {
      if (envBackup[key] !== undefined) {
        process.env[key] = envBackup[key];
      } else {
        delete process.env[key];
      }
    }
    clearGoogleTokenCache();
  });

  describe('1. Audience Configuration & Provider Resource Derivation', () => {
    test('computes standard GCP STS provider resource name and defaults to Allowed Audiences', () => {
      process.env.GCP_PROJECT_NUMBER = '123456789012';
      process.env.GCP_WORKLOAD_IDENTITY_POOL_ID = 'vercel-pool';
      process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID = 'vercel-provider';

      const providerResource = getGcpProviderResourceName();
      assert.equal(
        providerResource,
        '//iam.googleapis.com/projects/123456789012/locations/global/workloadIdentityPools/vercel-pool/providers/vercel-provider'
      );
      assert.equal(
        getGcpDefaultAudience(),
        'https://iam.googleapis.com/projects/123456789012/locations/global/workloadIdentityPools/vercel-pool/providers/vercel-provider'
      );

      // Default mode is 'allowed' matching the official Vercel GCP guide
      const audienceConfig = resolveGcpAudienceConfig();
      assert.equal(audienceConfig.mode, 'allowed');
      assert.equal(audienceConfig.stsAudience, providerResource);
      assert.equal(
        audienceConfig.oidcAudience,
        'https://vercel.com/anshkmrn-8908s-projects'
      );
      assert.equal(getGcpAudience(), 'https://vercel.com/anshkmrn-8908s-projects');
    });

    test('Allowed Audiences mode: respects VERCEL_TEAM_SLUG when set', () => {
      process.env.GCP_PROJECT_NUMBER = '123456789012';
      process.env.GCP_WORKLOAD_IDENTITY_POOL_ID = 'vercel-pool';
      process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID = 'vercel-provider';
      process.env.VERCEL_TEAM_SLUG = 'custom-team-slug';

      assert.equal(getVercelTeamSlug(), 'custom-team-slug');
      const audienceConfig = resolveGcpAudienceConfig();
      assert.equal(audienceConfig.mode, 'allowed');
      assert.equal(
        audienceConfig.oidcAudience,
        'https://vercel.com/custom-team-slug'
      );
      assert.equal(getGcpAudience(), 'https://vercel.com/custom-team-slug');
      // STS audience remains the GCP provider resource name
      assert.equal(
        audienceConfig.stsAudience,
        '//iam.googleapis.com/projects/123456789012/locations/global/workloadIdentityPools/vercel-pool/providers/vercel-provider'
      );
    });

    test('Allowed Audiences mode: respects explicit GCP_AUDIENCE override without polluting STS resource name', () => {
      process.env.GCP_PROJECT_NUMBER = '123456789012';
      process.env.GCP_WORKLOAD_IDENTITY_POOL_ID = 'vercel-pool';
      process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID = 'vercel-provider';
      process.env.GCP_AUDIENCE = 'https://custom-audience.example.com';

      const audienceConfig = resolveGcpAudienceConfig();
      assert.equal(audienceConfig.mode, 'allowed');
      assert.equal(audienceConfig.oidcAudience, 'https://custom-audience.example.com');
      assert.equal(getGcpAudience(), 'https://custom-audience.example.com');
      // STS audience is strictly preserved as the GCP resource URI
      assert.equal(
        audienceConfig.stsAudience,
        '//iam.googleapis.com/projects/123456789012/locations/global/workloadIdentityPools/vercel-pool/providers/vercel-provider'
      );
      assert.equal(
        getGcpProviderResourceName(),
        '//iam.googleapis.com/projects/123456789012/locations/global/workloadIdentityPools/vercel-pool/providers/vercel-provider'
      );
    });

    test('Default Audience mode: supports GCP_AUDIENCE_MODE=default', () => {
      process.env.GCP_PROJECT_NUMBER = '123456789012';
      process.env.GCP_WORKLOAD_IDENTITY_POOL_ID = 'vercel-pool';
      process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID = 'vercel-provider';
      process.env.GCP_AUDIENCE_MODE = 'default';

      const audienceConfig = resolveGcpAudienceConfig();
      assert.equal(audienceConfig.mode, 'default');
      assert.equal(
        audienceConfig.oidcAudience,
        'https://iam.googleapis.com/projects/123456789012/locations/global/workloadIdentityPools/vercel-pool/providers/vercel-provider'
      );
      assert.equal(
        audienceConfig.stsAudience,
        '//iam.googleapis.com/projects/123456789012/locations/global/workloadIdentityPools/vercel-pool/providers/vercel-provider'
      );
      assert.equal(
        getGcpAudience(),
        'https://iam.googleapis.com/projects/123456789012/locations/global/workloadIdentityPools/vercel-pool/providers/vercel-provider'
      );
    });

    test('Default Audience mode: supports GCP_AUDIENCE=default or full GCP IAM URL', () => {
      process.env.GCP_PROJECT_NUMBER = '973069107406';
      process.env.GCP_WORKLOAD_IDENTITY_POOL_ID = 'vercel';
      process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID = 'vercel';
      process.env.GCP_AUDIENCE = 'default';

      let audienceConfig = resolveGcpAudienceConfig();
      assert.equal(audienceConfig.mode, 'default');
      assert.equal(
        audienceConfig.oidcAudience,
        'https://iam.googleapis.com/projects/973069107406/locations/global/workloadIdentityPools/vercel/providers/vercel'
      );

      process.env.GCP_AUDIENCE =
        'https://iam.googleapis.com/projects/973069107406/locations/global/workloadIdentityPools/vercel/providers/vercel';
      audienceConfig = resolveGcpAudienceConfig();
      assert.equal(audienceConfig.mode, 'default');
      assert.equal(
        audienceConfig.oidcAudience,
        'https://iam.googleapis.com/projects/973069107406/locations/global/workloadIdentityPools/vercel/providers/vercel'
      );
    });

    test('GCP_AUDIENCE_MODE=allowed overrides GCP IAM URL in GCP_AUDIENCE', () => {
      process.env.GCP_PROJECT_NUMBER = '973069107406';
      process.env.GCP_WORKLOAD_IDENTITY_POOL_ID = 'vercel';
      process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID = 'vercel';
      process.env.GCP_AUDIENCE =
        'https://iam.googleapis.com/projects/973069107406/locations/global/workloadIdentityPools/vercel/providers/vercel';
      process.env.GCP_AUDIENCE_MODE = 'allowed';

      const audienceConfig = resolveGcpAudienceConfig();
      assert.equal(audienceConfig.mode, 'allowed');
      assert.equal(
        audienceConfig.oidcAudience,
        'https://vercel.com/anshkmrn-8908s-projects'
      );
      assert.equal(
        audienceConfig.stsAudience,
        '//iam.googleapis.com/projects/973069107406/locations/global/workloadIdentityPools/vercel/providers/vercel'
      );
    });

    test('returns null when required components are missing and unconfigured', () => {
      process.env.GCP_PROJECT_NUMBER = '123456789012';
      // Missing pool and provider IDs
      assert.equal(getGcpProviderResourceName(), null);
      assert.equal(getGcpDefaultAudience(), null);
      const config = resolveGcpAudienceConfig();
      assert.equal(config.stsAudience, null);
      assert.equal(config.oidcAudience, null);
      assert.equal(getGcpAudience(), null);
    });
  });

  describe('2. Authentication Mode Detection & Absence of Private Key in Keyless Mode', () => {
    test('detects keyless_oidc mode without requiring any private key', () => {
      process.env.GCP_PROJECT_NUMBER = '123456789012';
      process.env.GCP_WORKLOAD_IDENTITY_POOL_ID = 'vercel-pool';
      process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID = 'vercel-provider';
      process.env.GCP_SERVICE_ACCOUNT_EMAIL = 'arth-sync@gcp-project.iam.gserviceaccount.com';

      assert.equal(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, undefined);
      assert.equal(getGoogleAuthMode(), 'keyless_oidc');
      assert.equal(isGoogleServiceAccountConfigured(), true);
      assert.equal(
        getServiceAccountEmail(),
        'arth-sync@gcp-project.iam.gserviceaccount.com'
      );
    });

    test('prioritizes GCP_SERVICE_ACCOUNT_EMAIL over GOOGLE_SERVICE_ACCOUNT_EMAIL', () => {
      process.env.GCP_SERVICE_ACCOUNT_EMAIL = 'primary-wif@example.com';
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'secondary-legacy@example.com';

      assert.equal(getServiceAccountEmail(), 'primary-wif@example.com');
    });

    test('falls back to GOOGLE_SERVICE_ACCOUNT_EMAIL if GCP_SERVICE_ACCOUNT_EMAIL is unset', () => {
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'secondary-legacy@example.com';
      assert.equal(getServiceAccountEmail(), 'secondary-legacy@example.com');
    });

    test('detects service_account_key mode for legacy RSA fallback', () => {
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'legacy@example.com';
      process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY =
        '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgk...=\n-----END PRIVATE KEY-----';

      assert.equal(getGoogleAuthMode(), 'service_account_key');
      assert.equal(isGoogleServiceAccountConfigured(), true);
    });

    test('detects unconfigured mode when neither is set', () => {
      assert.equal(getGoogleAuthMode(), 'unconfigured');
      assert.equal(isGoogleServiceAccountConfigured(), false);
      assert.equal(getServiceAccountEmail(), null);
    });
  });

  describe('3. External Account Client Construction', () => {
    test('constructs ExternalAccountClient with exact STS, IAM impersonation URL and scopes', () => {
      process.env.GCP_PROJECT_NUMBER = '123456789012';
      process.env.GCP_WORKLOAD_IDENTITY_POOL_ID = 'vercel-pool';
      process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID = 'vercel-provider';
      process.env.GCP_SERVICE_ACCOUNT_EMAIL = 'arth-sync@gcp-project.iam.gserviceaccount.com';

      const client = createGcpExternalAccountClient();
      assert.ok(client, 'ExternalAccountClient must be instantiated');
      assert.deepEqual(client.scopes, GOOGLE_SHEETS_SCOPES);
      assert.equal(
        (client as unknown as { serviceAccountImpersonationUrl: string })
          .serviceAccountImpersonationUrl,
        'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/arth-sync@gcp-project.iam.gserviceaccount.com:generateAccessToken'
      );
      assert.equal(
        (client as unknown as { audience: string }).audience,
        '//iam.googleapis.com/projects/123456789012/locations/global/workloadIdentityPools/vercel-pool/providers/vercel-provider'
      );
    });

    test('invokes custom subject token supplier with expected audience in Allowed Audiences mode', async () => {
      process.env.GCP_PROJECT_NUMBER = '123456789012';
      process.env.GCP_WORKLOAD_IDENTITY_POOL_ID = 'vercel-pool';
      process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID = 'vercel-provider';
      process.env.GCP_SERVICE_ACCOUNT_EMAIL = 'arth-sync@gcp-project.iam.gserviceaccount.com';

      let supplierCalledWith: { audience?: string } | null = null;
      const client = createGcpExternalAccountClient({
        customSubjectTokenSupplier: async (ctx) => {
          supplierCalledWith = ctx;
          return 'mock-subject-token-from-vercel';
        },
      });

      assert.ok(client);
      const subjectToken = await (
        client as unknown as { retrieveSubjectToken: () => Promise<string> }
      ).retrieveSubjectToken();

      assert.equal(subjectToken, 'mock-subject-token-from-vercel');
      const recorded = supplierCalledWith as { audience?: string } | null;
      assert.ok(recorded);
      assert.equal(
        recorded.audience,
        'https://vercel.com/anshkmrn-8908s-projects'
      );
    });

    test('invokes custom subject token supplier with expected audience in Default Audience mode', async () => {
      process.env.GCP_PROJECT_NUMBER = '123456789012';
      process.env.GCP_WORKLOAD_IDENTITY_POOL_ID = 'vercel-pool';
      process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID = 'vercel-provider';
      process.env.GCP_SERVICE_ACCOUNT_EMAIL = 'arth-sync@gcp-project.iam.gserviceaccount.com';
      process.env.GCP_AUDIENCE_MODE = 'default';

      let supplierCalledWith: { audience?: string } | null = null;
      const client = createGcpExternalAccountClient({
        customSubjectTokenSupplier: async (ctx) => {
          supplierCalledWith = ctx;
          return 'mock-subject-token-default-mode';
        },
      });

      assert.ok(client);
      const subjectToken = await (
        client as unknown as { retrieveSubjectToken: () => Promise<string> }
      ).retrieveSubjectToken();

      assert.equal(subjectToken, 'mock-subject-token-default-mode');
      const recorded = supplierCalledWith as { audience?: string } | null;
      assert.ok(recorded);
      assert.equal(
        recorded.audience,
        'https://iam.googleapis.com/projects/123456789012/locations/global/workloadIdentityPools/vercel-pool/providers/vercel-provider'
      );
    });
  });

  describe('4. Token Exchange Flow: Vercel OIDC -> Google STS -> IAM Impersonation', () => {
    test('successfully retrieves short-lived Google Sheets access token through STS & IAM', async () => {
      process.env.GCP_PROJECT_NUMBER = '987654321000';
      process.env.GCP_WORKLOAD_IDENTITY_POOL_ID = 'prod-pool';
      process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID = 'vercel-prod';
      process.env.GCP_SERVICE_ACCOUNT_EMAIL = 'arth-sheets@my-project.iam.gserviceaccount.com';

      let stsRequestBody: Record<string, string> = {};
      let iamRequestBody: unknown = null;
      let iamRequestHeaders: Record<string, string> = {};

      const client = createGcpExternalAccountClient({
        customSubjectTokenSupplier: async () => 'test-vercel-oidc-jwt',
      });
      assert.ok(client);

      // Mock STS call
      (
        client as unknown as {
          stsCredential: {
            transporter: {
              request: (opts: {
                data: URLSearchParams;
                url: string;
              }) => Promise<unknown>;
            };
          };
        }
      ).stsCredential.transporter.request = async (opts) => {
        opts.data.forEach((val, key) => {
          stsRequestBody[key] = val;
        });
        return {
          status: 200,
          data: {
            access_token: 'gcp-sts-federated-token-xyz',
            issued_token_type: 'urn:ietf:params:oauth:token-type:access_token',
            token_type: 'Bearer',
            expires_in: 3600,
          },
        };
      };

      // Mock IAM impersonation call
      (
        client as unknown as {
          transporter: {
            request: (opts: {
              url: string;
              headers: Record<string, string>;
              data: unknown;
            }) => Promise<unknown>;
          };
        }
      ).transporter.request = async (opts) => {
        iamRequestHeaders = opts.headers;
        iamRequestBody = opts.data;
        return {
          status: 200,
          data: {
            accessToken: 'ya29.mock-google-sheets-oauth-access-token',
            expireTime: new Date(Date.now() + 3600000).toISOString(),
          },
        };
      };

      setCachedExternalClient(client);

      const token = await getGoogleSheetsAccessToken();

      // Verify token
      assert.equal(token, 'ya29.mock-google-sheets-oauth-access-token');

      // Verify STS parameters
      assert.equal(
        stsRequestBody['grant_type'],
        'urn:ietf:params:oauth:grant-type:token-exchange'
      );
      assert.equal(
        stsRequestBody['subject_token_type'],
        'urn:ietf:params:oauth:token-type:jwt'
      );
      assert.equal(stsRequestBody['subject_token'], 'test-vercel-oidc-jwt');
      assert.equal(
        stsRequestBody['audience'],
        '//iam.googleapis.com/projects/987654321000/locations/global/workloadIdentityPools/prod-pool/providers/vercel-prod'
      );

      // Verify IAM parameters
      assert.equal(
        iamRequestHeaders['authorization'],
        'Bearer gcp-sts-federated-token-xyz'
      );
      assert.deepEqual(iamRequestBody, {
        scope: ['https://www.googleapis.com/auth/spreadsheets'],
        lifetime: '3600s',
      });
    });

    test('subsequent token requests within validity buffer return cached token without STS/IAM calls', async () => {
      process.env.GCP_PROJECT_NUMBER = '987654321000';
      process.env.GCP_WORKLOAD_IDENTITY_POOL_ID = 'prod-pool';
      process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID = 'vercel-prod';
      process.env.GCP_SERVICE_ACCOUNT_EMAIL = 'arth-sheets@my-project.iam.gserviceaccount.com';

      let stsCallCount = 0;
      let iamCallCount = 0;

      const client = createGcpExternalAccountClient({
        customSubjectTokenSupplier: async () => 'test-vercel-oidc-jwt',
      });
      assert.ok(client);

      (
        client as unknown as {
          stsCredential: {
            transporter: { request: () => Promise<unknown> };
          };
        }
      ).stsCredential.transporter.request = async () => {
        stsCallCount++;
        return {
          status: 200,
          data: {
            access_token: 'sts-token-abc',
            expires_in: 3600,
          },
        };
      };

      (
        client as unknown as {
          transporter: { request: () => Promise<unknown> };
        }
      ).transporter.request = async () => {
        iamCallCount++;
        return {
          status: 200,
          data: {
            accessToken: 'cached-token-12345',
            expireTime: new Date(Date.now() + 3600000).toISOString(),
          },
        };
      };

      setCachedExternalClient(client);

      const token1 = await getGoogleSheetsAccessToken();
      const token2 = await getGoogleSheetsAccessToken();

      assert.equal(token1, 'cached-token-12345');
      assert.equal(token2, 'cached-token-12345');
      assert.equal(stsCallCount, 1, 'STS should only be called once');
      assert.equal(iamCallCount, 1, 'IAM should only be called once');
    });
  });

  describe('5. Error Handling & Edge Cases', () => {
    test('throws actionable error when unconfigured', async () => {
      await assert.rejects(
        async () => {
          await getGoogleSheetsAccessToken();
        },
        {
          name: 'Error',
          message: /Google Sheets integration is not configured/,
        }
      );
    });

    test('propagates clear error when STS rejects the token exchange', async () => {
      process.env.GCP_PROJECT_NUMBER = '987654321000';
      process.env.GCP_WORKLOAD_IDENTITY_POOL_ID = 'prod-pool';
      process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID = 'vercel-prod';
      process.env.GCP_SERVICE_ACCOUNT_EMAIL = 'arth-sheets@my-project.iam.gserviceaccount.com';

      const client = createGcpExternalAccountClient({
        customSubjectTokenSupplier: async () => 'expired-vercel-jwt',
      });
      assert.ok(client);

      (
        client as unknown as {
          stsCredential: {
            transporter: { request: () => Promise<unknown> };
          };
        }
      ).stsCredential.transporter.request = async () => {
        const error = new Error('invalid_grant: The token has expired or is invalid.');
        throw error;
      };

      setCachedExternalClient(client);

      await assert.rejects(
        async () => {
          await getGoogleSheetsAccessToken();
        },
        {
          name: 'Error',
          message: /Google Sheets authentication failed.*invalid_grant/,
        }
      );
    });

    test('propagates clear error when IAM impersonation is denied', async () => {
      process.env.GCP_PROJECT_NUMBER = '987654321000';
      process.env.GCP_WORKLOAD_IDENTITY_POOL_ID = 'prod-pool';
      process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID = 'vercel-prod';
      process.env.GCP_SERVICE_ACCOUNT_EMAIL = 'arth-sheets@my-project.iam.gserviceaccount.com';

      const client = createGcpExternalAccountClient({
        customSubjectTokenSupplier: async () => 'valid-vercel-jwt',
      });
      assert.ok(client);

      (
        client as unknown as {
          stsCredential: {
            transporter: { request: () => Promise<unknown> };
          };
        }
      ).stsCredential.transporter.request = async () => {
        return {
          status: 200,
          data: {
            access_token: 'sts-token-ok',
            expires_in: 3600,
          },
        };
      };

      (
        client as unknown as {
          transporter: { request: () => Promise<unknown> };
        }
      ).transporter.request = async () => {
        const error = new Error(
          'Permission denied on resource (or it may not exist). Ensure roles/iam.workloadIdentityUser is granted.'
        );
        throw error;
      };

      setCachedExternalClient(client);

      await assert.rejects(
        async () => {
          await getGoogleSheetsAccessToken();
        },
        {
          name: 'Error',
          message: /Google Sheets authentication failed.*Permission denied/,
        }
      );
    });
  });

  describe('6. Google Sheets API Client Operations with Keyless Token', () => {
    test('verifyAndInitializeSheet uses access token from keyless flow', async () => {
      process.env.GCP_PROJECT_NUMBER = '987654321000';
      process.env.GCP_WORKLOAD_IDENTITY_POOL_ID = 'prod-pool';
      process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID = 'vercel-prod';
      process.env.GCP_SERVICE_ACCOUNT_EMAIL = 'arth-sheets@my-project.iam.gserviceaccount.com';

      const client = createGcpExternalAccountClient({
        customSubjectTokenSupplier: async () => 'valid-vercel-jwt',
      });
      assert.ok(client);

      (
        client as unknown as {
          stsCredential: {
            transporter: { request: () => Promise<unknown> };
          };
        }
      ).stsCredential.transporter.request = async () => ({
        status: 200,
        data: { access_token: 'sts-token-ok', expires_in: 3600 },
      });

      (
        client as unknown as {
          transporter: { request: () => Promise<unknown> };
        }
      ).transporter.request = async () => ({
        status: 200,
        data: {
          accessToken: 'ya29.keyless-token-sheets-ready',
          expireTime: new Date(Date.now() + 3600000).toISOString(),
        },
      });

      setCachedExternalClient(client);

      // Mock global fetch for Google Sheets REST API
      const originalFetch = global.fetch;
      const fetchCalls: { url: string; headers: Record<string, string> }[] = [];

      global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const headers = (init?.headers as Record<string, string>) || {};
        fetchCalls.push({ url, headers });

        if (url.includes('https://sheets.googleapis.com/v4/spreadsheets/test-sheet-id')) {
          return new Response(
            JSON.stringify({
              properties: { title: 'My Personal Arth Finances' },
              sheets: [
                {
                  properties: {
                    sheetId: 0,
                    title: 'Transactions',
                  },
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        if (url.includes('values/Transactions!A1:Z1')) {
          return new Response(
            JSON.stringify({
              values: [
                [
                  'Transaction ID',
                  'Date',
                  'Name / Description',
                  'Category',
                  'Type',
                  'Amount (INR)',
                  'Payment Method',
                  'Necessity',
                  'Notes',
                  'Status',
                  'Created At',
                  'Updated At',
                ],
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        return new Response('{}', { status: 200 });
      };

      try {
        const result = await verifyAndInitializeSheet('test-sheet-id', 'Transactions');
        assert.equal(result.spreadsheetTitle, 'My Personal Arth Finances');
        assert.equal(result.sheetName, 'Transactions');

        // Verify Bearer token sent to Google Sheets API
        assert.ok(fetchCalls.length >= 2);
        for (const call of fetchCalls) {
          assert.equal(
            call.headers['Authorization'],
            'Bearer ya29.keyless-token-sheets-ready'
          );
        }
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe('7. Regression Suite: Workload Identity Federation Audience Mismatch Resolution', () => {
    const PROD_PROJECT_ID = 'project-714a095d-5530-43be-bda';
    const PROD_PROJECT_NUMBER = '973069107406';
    const PROD_POOL_ID = 'vercel';
    const PROD_PROVIDER_ID = 'vercel';
    const PROD_TEAM_SLUG = 'anshkmrn-8908s-projects';
    const PROD_SA_EMAIL =
      'arth-sheets-sync@project-714a095d-5530-43be-bda.iam.gserviceaccount.com';
    const PROD_DEFAULT_AUDIENCE = `https://iam.googleapis.com/projects/${PROD_PROJECT_NUMBER}/locations/global/workloadIdentityPools/${PROD_POOL_ID}/providers/${PROD_PROVIDER_ID}`;
    const PROD_ALLOWED_AUDIENCE = `https://vercel.com/${PROD_TEAM_SLUG}`;
    const PROD_STS_RESOURCE = `//iam.googleapis.com/projects/${PROD_PROJECT_NUMBER}/locations/global/workloadIdentityPools/${PROD_POOL_ID}/providers/${PROD_PROVIDER_ID}`;

    test('reproduces production error when token audience is Default Audience but GCP provider expects Allowed Audience', async () => {
      process.env.GCP_PROJECT_ID = PROD_PROJECT_ID;
      process.env.GCP_PROJECT_NUMBER = PROD_PROJECT_NUMBER;
      process.env.GCP_WORKLOAD_IDENTITY_POOL_ID = PROD_POOL_ID;
      process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID = PROD_PROVIDER_ID;
      process.env.GCP_SERVICE_ACCOUNT_EMAIL = PROD_SA_EMAIL;
      process.env.VERCEL_TEAM_SLUG = PROD_TEAM_SLUG;
      // Simulate buggy configuration where GCP_AUDIENCE was set to Default Audience URL
      process.env.GCP_AUDIENCE = PROD_DEFAULT_AUDIENCE;

      // In the mock STS endpoint, GCP Provider vercel has Allowed Audiences = [PROD_ALLOWED_AUDIENCE]
      const gcpProviderExpectedAudience = PROD_ALLOWED_AUDIENCE;

      const client = createGcpExternalAccountClient({
        customSubjectTokenSupplier: async (ctx) => {
          // Token is minted with ctx.audience (PROD_DEFAULT_AUDIENCE)
          return `mock-jwt-with-aud:${ctx.audience}`;
        },
      });
      assert.ok(client);

      (
        client as unknown as {
          stsCredential: {
            transporter: {
              request: (opts: { data: URLSearchParams }) => Promise<unknown>;
            };
          };
        }
      ).stsCredential.transporter.request = async (opts) => {
        const subjectToken = opts.data.get('subject_token') || '';
        const tokenAudience = subjectToken.replace('mock-jwt-with-aud:', '');

        if (tokenAudience !== gcpProviderExpectedAudience) {
          throw new Error(
            `invalid_grant: The audience in ID Token [${tokenAudience}] does not match the expected audience.`
          );
        }

        return {
          status: 200,
          data: { access_token: 'sts-ok-token', expires_in: 3600 },
        };
      };

      setCachedExternalClient(client);

      // Verify that the exact production error is thrown
      await assert.rejects(
        async () => {
          await getGoogleSheetsAccessToken();
        },
        {
          name: 'Error',
          message:
            /invalid_grant: The audience in ID Token \[https:\/\/iam\.googleapis\.com\/projects\/973069107406\/locations\/global\/workloadIdentityPools\/vercel\/providers\/vercel\] does not match the expected audience\./,
        }
      );
    });

    test('verifies fix: Allowed Audiences configuration matches GCP provider and acquires access token', async () => {
      process.env.GCP_PROJECT_ID = PROD_PROJECT_ID;
      process.env.GCP_PROJECT_NUMBER = PROD_PROJECT_NUMBER;
      process.env.GCP_WORKLOAD_IDENTITY_POOL_ID = PROD_POOL_ID;
      process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID = PROD_PROVIDER_ID;
      process.env.GCP_SERVICE_ACCOUNT_EMAIL = PROD_SA_EMAIL;
      process.env.VERCEL_TEAM_SLUG = PROD_TEAM_SLUG;
      // Do not set GCP_AUDIENCE -> defaults cleanly to Allowed Audience (https://vercel.com/anshkmrn-8908s-projects)

      const audienceConfig = resolveGcpAudienceConfig();
      assert.equal(audienceConfig.mode, 'allowed');
      assert.equal(audienceConfig.stsAudience, PROD_STS_RESOURCE);
      assert.equal(audienceConfig.oidcAudience, PROD_ALLOWED_AUDIENCE);

      let requestedSubjectTokenAudience: string | undefined;
      let stsAudiencePassed: string | null = null;

      const client = createGcpExternalAccountClient({
        customSubjectTokenSupplier: async (ctx) => {
          requestedSubjectTokenAudience = ctx.audience;
          return `mock-jwt-with-aud:${ctx.audience}`;
        },
      });
      assert.ok(client);

      (
        client as unknown as {
          stsCredential: {
            transporter: {
              request: (opts: { data: URLSearchParams }) => Promise<unknown>;
            };
          };
        }
      ).stsCredential.transporter.request = async (opts) => {
        stsAudiencePassed = opts.data.get('audience');
        const subjectToken = opts.data.get('subject_token') || '';
        const tokenAudience = subjectToken.replace('mock-jwt-with-aud:', '');

        // Provider checks that token audience matches its Allowed Audiences list
        if (tokenAudience !== PROD_ALLOWED_AUDIENCE) {
          throw new Error(
            `invalid_grant: The audience in ID Token [${tokenAudience}] does not match the expected audience.`
          );
        }

        return {
          status: 200,
          data: {
            access_token: 'sts-federated-token-production-fixed',
            expires_in: 3600,
          },
        };
      };

      (
        client as unknown as {
          transporter: {
            request: () => Promise<unknown>;
          };
        }
      ).transporter.request = async () => ({
        status: 200,
        data: {
          accessToken: 'ya29.production-ready-google-sheets-oauth-token',
          expireTime: new Date(Date.now() + 3600000).toISOString(),
        },
      });

      setCachedExternalClient(client);

      const token = await getGoogleSheetsAccessToken();

      assert.equal(token, 'ya29.production-ready-google-sheets-oauth-token');
      assert.equal(
        requestedSubjectTokenAudience,
        'https://vercel.com/anshkmrn-8908s-projects'
      );
      assert.equal(
        stsAudiencePassed,
        '//iam.googleapis.com/projects/973069107406/locations/global/workloadIdentityPools/vercel/providers/vercel'
      );
    });

    test('verifies fix: Default Audience mode works when explicitly configured with provider in Default mode', async () => {
      process.env.GCP_PROJECT_ID = PROD_PROJECT_ID;
      process.env.GCP_PROJECT_NUMBER = PROD_PROJECT_NUMBER;
      process.env.GCP_WORKLOAD_IDENTITY_POOL_ID = PROD_POOL_ID;
      process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID = PROD_PROVIDER_ID;
      process.env.GCP_SERVICE_ACCOUNT_EMAIL = PROD_SA_EMAIL;
      process.env.GCP_AUDIENCE_MODE = 'default';

      const audienceConfig = resolveGcpAudienceConfig();
      assert.equal(audienceConfig.mode, 'default');
      assert.equal(audienceConfig.stsAudience, PROD_STS_RESOURCE);
      assert.equal(audienceConfig.oidcAudience, PROD_DEFAULT_AUDIENCE);

      let requestedSubjectTokenAudience: string | undefined;

      const client = createGcpExternalAccountClient({
        customSubjectTokenSupplier: async (ctx) => {
          requestedSubjectTokenAudience = ctx.audience;
          return `mock-jwt-with-aud:${ctx.audience}`;
        },
      });
      assert.ok(client);

      (
        client as unknown as {
          stsCredential: {
            transporter: {
              request: (opts: { data: URLSearchParams }) => Promise<unknown>;
            };
          };
        }
      ).stsCredential.transporter.request = async (opts) => {
        const subjectToken = opts.data.get('subject_token') || '';
        const tokenAudience = subjectToken.replace('mock-jwt-with-aud:', '');

        // In Default Audience mode, provider expects its auto-generated URL
        if (tokenAudience !== PROD_DEFAULT_AUDIENCE) {
          throw new Error(
            `invalid_grant: The audience in ID Token [${tokenAudience}] does not match the expected audience.`
          );
        }

        return {
          status: 200,
          data: {
            access_token: 'sts-federated-token-default-mode',
            expires_in: 3600,
          },
        };
      };

      (
        client as unknown as {
          transporter: {
            request: () => Promise<unknown>;
          };
        }
      ).transporter.request = async () => ({
        status: 200,
        data: {
          accessToken: 'ya29.default-mode-oauth-token',
          expireTime: new Date(Date.now() + 3600000).toISOString(),
        },
      });

      setCachedExternalClient(client);

      const token = await getGoogleSheetsAccessToken();
      assert.equal(token, 'ya29.default-mode-oauth-token');
      assert.equal(requestedSubjectTokenAudience, PROD_DEFAULT_AUDIENCE);
    });
  });
});
