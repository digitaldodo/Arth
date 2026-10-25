import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT } from 'jose';
import { buildApp } from '../src/app.js';
import type { AuthIdentityResponse } from '@arth/contracts';

const TEST_SECRET = 'test-secret-key-that-is-at-least-32-characters-long';
const secretBytes = new TextEncoder().encode(TEST_SECRET);
const TEST_ISSUER = 'https://arth-test.supabase.co/auth/v1';
const TEST_AUDIENCE = 'authenticated';

async function generateTestToken(options: {
  sub?: string;
  email?: string;
  role?: string;
  expiresIn?: string | number;
  issuer?: string;
  audience?: string;
  secret?: Uint8Array;
}) {
  const secretToUse = options.secret || secretBytes;
  let jwt = new SignJWT({
    email: options.email ?? 'test@example.com',
    role: options.role ?? 'authenticated',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(options.sub ?? '11111111-1111-4111-a111-111111111111')
    .setIssuedAt()
    .setIssuer(options.issuer ?? TEST_ISSUER)
    .setAudience(options.audience ?? TEST_AUDIENCE);

  if (options.expiresIn !== undefined) {
    jwt = jwt.setExpirationTime(options.expiresIn);
  } else {
    jwt = jwt.setExpirationTime('1h');
  }

  return jwt.sign(secretToUse);
}

describe('Backend Authentication & JWT Verification', () => {
  const appConfig = {
    env: 'test' as const,
    supabaseJwtSecret: TEST_SECRET,
    jwtIssuer: TEST_ISSUER,
    jwtAudience: TEST_AUDIENCE,
  };

  test('Public /health endpoint accessible without token', async () => {
    const app = await buildApp(appConfig);

    const res = await app.inject({
      method: 'GET',
      url: '/health',
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.status, 'ok');

    await app.close();
  });

  test('GET /api/v1/auth/me without token returns 401 Unauthorized', async () => {
    const app = await buildApp(appConfig);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
    });

    assert.equal(res.statusCode, 401);
    const body = JSON.parse(res.body);
    assert.equal(body.error, 'Unauthorized');
    assert.match(body.message, /Missing or malformed/);

    await app.close();
  });

  test('GET /api/v1/auth/me with non-Bearer header returns 401', async () => {
    const app = await buildApp(appConfig);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: {
        authorization: 'Basic dXNlcjpwYXNz',
      },
    });

    assert.equal(res.statusCode, 401);
    await app.close();
  });

  test('GET /api/v1/auth/me with empty Bearer token returns 401', async () => {
    const app = await buildApp(appConfig);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: {
        authorization: 'Bearer ',
      },
    });

    assert.equal(res.statusCode, 401);
    await app.close();
  });

  test('GET /api/v1/auth/me with invalid signature returns 401', async () => {
    const app = await buildApp(appConfig);
    const wrongSecret = new TextEncoder().encode('wrong-secret-key-that-is-at-least-32-chars-long');
    const tamperedToken = await generateTestToken({ secret: wrongSecret });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: {
        authorization: `Bearer ${tamperedToken}`,
      },
    });

    assert.equal(res.statusCode, 401);
    const body = JSON.parse(res.body);
    assert.equal(body.error, 'Unauthorized');

    await app.close();
  });

  test('GET /api/v1/auth/me with expired token returns 401', async () => {
    const app = await buildApp(appConfig);
    // Create token expired 10 seconds ago
    const expiredToken = await generateTestToken({ expiresIn: '-10s' });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: {
        authorization: `Bearer ${expiredToken}`,
      },
    });

    assert.equal(res.statusCode, 401);
    const body = JSON.parse(res.body);
    assert.equal(body.message, 'Token has expired');

    await app.close();
  });

  test('GET /api/v1/auth/me with incorrect issuer returns 401', async () => {
    const app = await buildApp(appConfig);
    const wrongIssuerToken = await generateTestToken({ issuer: 'https://impostor.supabase.co/auth/v1' });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: {
        authorization: `Bearer ${wrongIssuerToken}`,
      },
    });

    assert.equal(res.statusCode, 401);
    const body = JSON.parse(res.body);
    assert.match(body.message, /Token validation failed/);

    await app.close();
  });

  test('GET /api/v1/auth/me with incorrect audience returns 401', async () => {
    const app = await buildApp(appConfig);
    const wrongAudToken = await generateTestToken({ audience: 'wrong-audience' });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: {
        authorization: `Bearer ${wrongAudToken}`,
      },
    });

    assert.equal(res.statusCode, 401);
    const body = JSON.parse(res.body);
    assert.match(body.message, /Token validation failed/);

    await app.close();
  });

  test('GET /api/v1/auth/me with valid token returns 200 and verified identity', async () => {
    const app = await buildApp(appConfig);
    const validToken = await generateTestToken({
      sub: '98765432-1234-4321-a123-987654321000',
      email: 'owner@arth.finance',
      role: 'authenticated',
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: {
        authorization: `Bearer ${validToken}`,
      },
    });

    assert.equal(res.statusCode, 200);
    const body: AuthIdentityResponse = JSON.parse(res.body);
    assert.equal(body.userId, '98765432-1234-4321-a123-987654321000');
    assert.equal(body.email, 'owner@arth.finance');
    assert.equal(body.role, 'authenticated');
    assert.ok(typeof body.exp === 'number');

    await app.close();
  });

  test('Verification failure fails closed without leaking token', async () => {
    // Failing verifier simulation
    const failingVerifier = async () => {
      throw new Error('Key service timeout');
    };

    const app = await buildApp(appConfig, failingVerifier);
    const someToken = 'dummy-untrusted-token-value';

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: {
        authorization: `Bearer ${someToken}`,
      },
    });

    assert.equal(res.statusCode, 401);
    // Ensure the token itself is not returned in the error payload
    assert.ok(!res.body.includes(someToken));

    await app.close();
  });

  test('Accepts token when secret has surrounding quotes and whitespace', async () => {
    // Config with quotes and whitespace as commonly entered in dashboard env vars
    const quotedConfig = {
      ...appConfig,
      supabaseJwtSecret: `  "${TEST_SECRET}"  `,
    };
    const app = await buildApp(quotedConfig);
    const validToken = await generateTestToken({
      sub: '98765432-1234-4321-a123-987654321000',
      email: 'owner@arth.finance',
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: {
        authorization: `Bearer ${validToken}`,
      },
    });

    assert.equal(res.statusCode, 200);
    const body: AuthIdentityResponse = JSON.parse(res.body);
    assert.equal(body.userId, '98765432-1234-4321-a123-987654321000');
    await app.close();
  });

  test('Accepts token with iss: "supabase" when configured with Supabase project issuer', async () => {
    const app = await buildApp(appConfig);
    const supabaseIssToken = await generateTestToken({
      issuer: 'supabase',
      sub: '98765432-1234-4321-a123-987654321000',
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: {
        authorization: `Bearer ${supabaseIssToken}`,
      },
    });

    assert.equal(res.statusCode, 200);
    const body: AuthIdentityResponse = JSON.parse(res.body);
    assert.equal(body.userId, '98765432-1234-4321-a123-987654321000');
    await app.close();
  });
});
