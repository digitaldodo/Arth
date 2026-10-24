import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getBackendBaseUrl, safeBackendErrorResponse } from '../src/lib/server-config.js';

describe('Server Configuration & Safe Gateway Error Utilities', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('getBackendBaseUrl returns trimmed INTERNAL_API_URL with trailing slashes stripped', () => {
    process.env.INTERNAL_API_URL = 'https://arth-backend.onrender.com///';
    const url = getBackendBaseUrl();
    assert.equal(url, 'https://arth-backend.onrender.com');
  });

  test('getBackendBaseUrl falls back to NEXT_PUBLIC_API_URL when INTERNAL_API_URL is unset', () => {
    delete process.env.INTERNAL_API_URL;
    process.env.NEXT_PUBLIC_API_URL = 'https://api.arth.example.com/';
    const url = getBackendBaseUrl();
    assert.equal(url, 'https://api.arth.example.com');
  });

  test('getBackendBaseUrl falls back to http://localhost:3001 in non-production when no URL is set', () => {
    delete process.env.INTERNAL_API_URL;
    delete process.env.NEXT_PUBLIC_API_URL;
    (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
    const url = getBackendBaseUrl();
    assert.equal(url, 'http://localhost:3001');
  });

  test('getBackendBaseUrl strictly throws in production when INTERNAL_API_URL is unset', () => {
    delete process.env.INTERNAL_API_URL;
    delete process.env.NEXT_PUBLIC_API_URL;
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';

    assert.throws(
      () => {
        getBackendBaseUrl();
      },
      {
        name: 'Error',
        message: /INTERNAL_API_URL environment variable is required in production/,
      }
    );
  });

  test('safeBackendErrorResponse returns sanitized 502 Bad Gateway response without leaking sensitive info', async () => {
    const errorWithSecrets = new Error(
      'connect ECONNREFUSED 10.0.4.12:3001 with secret_token=eyJhbGciOi'
    );

    const res = safeBackendErrorResponse(errorWithSecrets, 'TestContext');
    assert.equal(res.status, 502);

    const body = await res.json();
    assert.equal(body.statusCode, 502);
    assert.equal(body.error, 'Bad Gateway');
    assert.equal(
      body.message,
      'Backend service is currently unavailable. Please try again shortly.'
    );

    // Verify raw error string and secrets are never returned in response body
    const bodyString = JSON.stringify(body);
    assert.ok(!bodyString.includes('10.0.4.12'));
    assert.ok(!bodyString.includes('secret_token'));
    assert.ok(!bodyString.includes('ECONNREFUSED'));
  });

  test('safeBackendErrorResponse supports custom 503 status code for service unavailability', async () => {
    const res = safeBackendErrorResponse(new Error('timeout'), 'TestContext', 503);
    assert.equal(res.status, 503);

    const body = await res.json();
    assert.equal(body.statusCode, 503);
    assert.equal(body.error, 'Service Unavailable');
  });
});
