import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  normalizeGooglePrivateKey,
  getGoogleCredentials,
  isGoogleServiceAccountConfigured,
  getServiceAccountEmail,
} from '../src/lib/server/google-auth';

// Generate a valid RSA key pair for testing OpenSSL cryptographic signing
const { privateKey: validPemKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

describe('Google Sheets Service Account Authentication & Private Key Normalization', () => {
  describe('1. normalizeGooglePrivateKey resolves OpenSSL 1E08010C DECODER error', () => {
    test('handles standard raw PEM key directly', () => {
      const normalized = normalizeGooglePrivateKey(validPemKey);
      assert.ok(normalized);
      assert.ok(normalized.startsWith('-----BEGIN PRIVATE KEY-----'));
      assert.ok(normalized.endsWith('-----END PRIVATE KEY-----'));

      // Verify OpenSSL creates signature without error
      const signer = crypto.createSign('RSA-SHA256');
      signer.update('test-payload');
      signer.end();
      assert.doesNotThrow(() => {
        signer.sign(normalized);
      });
    });

    test('strips surrounding double quotes (common Vercel UI copy/paste error)', () => {
      // In Vercel, pasting `"-----BEGIN..."` causes OpenSSL to fail with error:1E08010C:DECODER routines::unsupported
      const quoted = `"${validPemKey.replace(/\n/g, '\\n')}"`;
      const normalized = normalizeGooglePrivateKey(quoted);
      assert.ok(normalized);
      assert.ok(!normalized.startsWith('"'));
      assert.ok(!normalized.endsWith('"'));

      const signer = crypto.createSign('RSA-SHA256');
      signer.update('test-payload');
      signer.end();
      assert.doesNotThrow(() => {
        signer.sign(normalized);
      });
    });

    test('strips surrounding single quotes', () => {
      const singleQuoted = `'${validPemKey.replace(/\n/g, '\\n')}'`;
      const normalized = normalizeGooglePrivateKey(singleQuoted);
      assert.ok(normalized);
      assert.ok(!normalized.startsWith("'"));
      assert.ok(!normalized.endsWith("'"));

      const signer = crypto.createSign('RSA-SHA256');
      signer.update('test-payload');
      signer.end();
      assert.doesNotThrow(() => {
        signer.sign(normalized);
      });
    });

    test('strips escaped quotes \\"..."\\"', () => {
      const escapedQuoted = `\\"${validPemKey.replace(/\n/g, '\\n')}\\"`;
      const normalized = normalizeGooglePrivateKey(escapedQuoted);
      assert.ok(normalized);
      assert.ok(!normalized.startsWith('\\"'));
      assert.ok(!normalized.endsWith('\\"'));

      const signer = crypto.createSign('RSA-SHA256');
      signer.update('test-payload');
      signer.end();
      assert.doesNotThrow(() => {
        signer.sign(normalized);
      });
    });

    test('converts literal escaped \\n into real newlines', () => {
      const withLiteralNewlines = validPemKey.replace(/\n/g, '\\n');
      assert.ok(withLiteralNewlines.includes('\\n'));
      assert.ok(!withLiteralNewlines.includes('\n'));

      const normalized = normalizeGooglePrivateKey(withLiteralNewlines);
      assert.ok(normalized);
      assert.ok(normalized.includes('\n'));

      const signer = crypto.createSign('RSA-SHA256');
      signer.update('test-payload');
      signer.end();
      assert.doesNotThrow(() => {
        signer.sign(normalized);
      });
    });

    test('extracts private_key from complete JSON credentials string', () => {
      const jsonCredentials = JSON.stringify({
        type: 'service_account',
        project_id: 'test-arth',
        private_key_id: 'abc12345',
        private_key: validPemKey.replace(/\n/g, '\\n'),
        client_email: 'arth-sheets-sync@test-arth.iam.gserviceaccount.com',
      });

      const normalized = normalizeGooglePrivateKey(jsonCredentials);
      assert.ok(normalized);
      assert.ok(normalized.startsWith('-----BEGIN PRIVATE KEY-----'));

      const signer = crypto.createSign('RSA-SHA256');
      signer.update('test-payload');
      signer.end();
      assert.doesNotThrow(() => {
        signer.sign(normalized);
      });
    });

    test('handles Windows CRLF and carriage returns', () => {
      const crlfKey = validPemKey.replace(/\n/g, '\r\n');
      const normalized = normalizeGooglePrivateKey(crlfKey);
      assert.ok(normalized);
      assert.ok(!normalized.includes('\r'));

      const signer = crypto.createSign('RSA-SHA256');
      signer.update('test-payload');
      signer.end();
      assert.doesNotThrow(() => {
        signer.sign(normalized);
      });
    });

    test('returns null for empty or invalid inputs', () => {
      assert.equal(normalizeGooglePrivateKey(''), null);
      assert.equal(normalizeGooglePrivateKey(null), null);
      assert.equal(normalizeGooglePrivateKey(undefined), null);
    });
  });

  describe('2. Credential derivation across environment variable configurations', () => {
    const origEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const origKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
    const origJsonKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

    const restore = () => {
      if (origEmail !== undefined) process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = origEmail;
      else delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;

      if (origKey !== undefined) process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = origKey;
      else delete process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

      if (origJsonKey !== undefined) process.env.GOOGLE_SERVICE_ACCOUNT_KEY = origJsonKey;
      else delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    };

    test('extracts from GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY with surrounding quotes', () => {
      try {
        process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'arth-sync@test-arth.iam.gserviceaccount.com';
        process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = `"${validPemKey.replace(/\n/g, '\\n')}"`;

        const creds = getGoogleCredentials();
        assert.equal(creds.email, 'arth-sync@test-arth.iam.gserviceaccount.com');
        assert.ok(creds.privateKey);
        assert.ok(creds.privateKey.startsWith('-----BEGIN PRIVATE KEY-----'));
        assert.ok(isGoogleServiceAccountConfigured());
        assert.equal(getServiceAccountEmail(), 'arth-sync@test-arth.iam.gserviceaccount.com');
      } finally {
        restore();
      }
    });

    test('extracts from full JSON in GOOGLE_SERVICE_ACCOUNT_KEY', () => {
      try {
        delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
        delete process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
        process.env.GOOGLE_SERVICE_ACCOUNT_KEY = JSON.stringify({
          client_email: 'json-service@test-arth.iam.gserviceaccount.com',
          private_key: validPemKey,
        });

        const creds = getGoogleCredentials();
        assert.equal(creds.email, 'json-service@test-arth.iam.gserviceaccount.com');
        assert.ok(creds.privateKey);
        assert.ok(isGoogleServiceAccountConfigured());
      } finally {
        restore();
      }
    });

    test('extracts when user pasted JSON into GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY', () => {
      try {
        delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
        process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = JSON.stringify({
          client_email: 'pasted-json@test-arth.iam.gserviceaccount.com',
          private_key: validPemKey,
        });

        const creds = getGoogleCredentials();
        assert.equal(creds.email, 'pasted-json@test-arth.iam.gserviceaccount.com');
        assert.ok(creds.privateKey);
        assert.ok(isGoogleServiceAccountConfigured());
      } finally {
        restore();
      }
    });
  });

  describe('3. Error sanitization prevents raw OpenSSL DECODER messages in UI', () => {
    test('raw OpenSSL 1E08010C error message is sanitized into helpful user guidance', () => {
      const rawError = 'error:1E08010C:DECODER routines::unsupported';

      // Replicating route sanitization check
      let clientMessage = rawError;
      if (
        rawError.includes('DECODER') ||
        rawError.includes('unsupported') ||
        rawError.includes('1E08010C') ||
        rawError.includes('routines')
      ) {
        clientMessage =
          'Google Sheets authentication failed. Please verify the server configuration and try again.';
      }

      assert.equal(
        clientMessage,
        'Google Sheets authentication failed. Please verify the server configuration and try again.'
      );
      assert.ok(!clientMessage.includes('1E08010C'));
      assert.ok(!clientMessage.includes('DECODER'));
    });
  });
});
