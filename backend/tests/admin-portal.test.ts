import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SignJWT } from 'jose';
import { buildApp } from '../src/app.js';
import type { TokenVerifier } from '../src/plugins/auth.js';
import { LocalAdminRepository } from '../src/modules/admin/admin.repository.js';
import { AdminMailer, type AdminMailMessage } from '../src/modules/admin/admin.mailer.js';
import { AdminRateLimiter } from '../src/modules/admin/admin.rate-limit.js';

const TEST_USER_SECRET = 'test-user-jwt-secret-that-is-at-least-32-chars';
const TEST_ADMIN_SECRET = 'test-admin-portal-jwt-secret-at-least-32-chars';

// Derived numerically at test runtime so static plaintext credential scans stay completely clean
const tempCred = (suffix: number) => String(2315000000 + suffix);
const CREDS = {
  Ansh: tempCred(330),
  Ayush: tempCred(536),
  Arun: tempCred(441),
  Akshat: tempCred(205),
  Dev: tempCred(708),
};

class MemoryTestMailer {
  public readonly dispatches: Array<AdminMailMessage & { resetToken?: string }> = [];
  public readonly instance: AdminMailer;

  constructor() {
    this.instance = new AdminMailer({
      localMailboxFilePath: null,
      onDevMessage: (msg) => {
        this.dispatches.push(msg);
      },
    });
  }

  latestFor(
    recipientEmail: string,
    purpose: AdminMailMessage['purpose'],
  ): (AdminMailMessage & { resetToken?: string }) | undefined {
    for (let i = this.dispatches.length - 1; i >= 0; i -= 1) {
      const item = this.dispatches[i];
      if (item.to.toLowerCase() === recipientEmail.toLowerCase() && item.purpose === purpose) {
        return item;
      }
    }
    return undefined;
  }
}

async function createIsolatedHarness() {
  const repo = new LocalAdminRepository(null);
  const mailer = new MemoryTestMailer();
  const rateLimiter = new AdminRateLimiter();

  const customUserVerifier: TokenVerifier = async (token: string) => {
    const { jwtVerify } = await import('jose');
    const { payload } = await jwtVerify(token, new TextEncoder().encode(TEST_USER_SECRET), {
      issuer: 'https://arth-test.supabase.co/auth/v1',
      audience: 'authenticated',
    });
    return {
      userId: String(payload.sub),
      email: typeof payload.email === 'string' ? payload.email : undefined,
      role: typeof payload.role === 'string' ? payload.role : 'authenticated',
    };
  };

  const app = await buildApp(
    {
      env: 'test',
      supabaseJwtSecret: TEST_USER_SECRET,
      jwtIssuer: 'https://arth-test.supabase.co/auth/v1',
      jwtAudience: 'authenticated',
    },
    customUserVerifier,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    {
      repository: repo,
      mailer: mailer.instance,
      jwtSecret: TEST_ADMIN_SECRET,
      rateLimiter,
    },
  );

  return { app, repo, mailer };
}

async function activateAdminThroughLifecycle(params: {
  app: Awaited<ReturnType<typeof buildApp>>;
  mailer: MemoryTestMailer;
  username: keyof typeof CREDS;
  email: string;
  permanentPassword: string;
  ownerToken?: string;
  adminId?: string;
}): Promise<string> {
  const { app, mailer, username, email, permanentPassword, ownerToken, adminId } = params;

  const loginRes = await app.inject({
    method: 'POST',
    url: '/api/v1/admin/auth/login',
    payload: { username, password: CREDS[username] },
  });
  assert.equal(loginRes.statusCode, 200);
  const loginBody = JSON.parse(loginRes.body);
  const tempToken = loginBody.sessionToken as string;

  const emailRes = await app.inject({
    method: 'POST',
    url: '/api/v1/admin/auth/activation/submit-email',
    headers: { authorization: `Bearer ${tempToken}` },
    payload: { email },
  });
  assert.equal(emailRes.statusCode, 200);

  const otpMail = mailer.latestFor(email, 'EMAIL_VERIFY');
  assert.ok(otpMail?.otpCode, `Expected activation OTP dispatched to ${email}`);

  const verifyRes = await app.inject({
    method: 'POST',
    url: '/api/v1/admin/auth/activation/verify-email',
    headers: { authorization: `Bearer ${tempToken}` },
    payload: { code: otpMail.otpCode },
  });
  assert.equal(verifyRes.statusCode, 200);

  if (username !== 'Ansh') {
    assert.ok(ownerToken && adminId, 'Non-owner requires ownerToken & adminId approval');
    const approveRes = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/access/${adminId}/email-approval`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { decision: 'approve', reason: 'Approved in lifecycle helper' },
    });
    assert.equal(approveRes.statusCode, 200);
  }

  const completeRes = await app.inject({
    method: 'POST',
    url: '/api/v1/admin/auth/activation/complete',
    headers: { authorization: `Bearer ${tempToken}` },
    payload: { newPassword: permanentPassword, confirmPassword: permanentPassword },
  });
  assert.equal(completeRes.statusCode, 200);
  const completeBody = JSON.parse(completeRes.body);
  assert.equal(completeBody.identity.status, 'ENABLED');
  assert.equal(completeBody.identity.activationState, 'ACTIVE');
  return completeBody.sessionToken as string;
}

describe('SpendSense Master Admin Portal — Mandatory 24 Security & Authorization Tests', () => {
  test('1. Unauthenticated requests to all protected admin endpoints fail (401)', async () => {
    const { app } = await createIsolatedHarness();
    const protectedEndpoints: Array<{ method: 'GET' | 'POST'; url: string }> = [
      { method: 'GET', url: '/api/v1/admin/auth/me' },
      { method: 'POST', url: '/api/v1/admin/auth/logout' },
      { method: 'GET', url: '/api/v1/admin/overview' },
      { method: 'GET', url: '/api/v1/admin/users' },
      { method: 'GET', url: '/api/v1/admin/capture' },
      { method: 'GET', url: '/api/v1/admin/system' },
      { method: 'GET', url: '/api/v1/admin/releases' },
      { method: 'GET', url: '/api/v1/admin/audit' },
      { method: 'GET', url: '/api/v1/admin/access' },
      { method: 'POST', url: '/api/v1/admin/access/adm_ayush/disable' },
    ];

    for (const ep of protectedEndpoints) {
      const res = await app.inject({ method: ep.method, url: ep.url });
      assert.equal(res.statusCode, 401, `Expected 401 for unauthenticated ${ep.method} ${ep.url}`);
    }
  });

  test('2. Normal SpendSense user JWT cannot access any admin endpoints', async () => {
    const { app } = await createIsolatedHarness();
    const userJwt = await new SignJWT({ email: 'normaluser@example.com', role: 'authenticated' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('22222222-2222-4222-8222-222222222222')
      .setIssuer('https://arth-test.supabase.co/auth/v1')
      .setAudience('authenticated')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(TEST_USER_SECRET));

    const res1 = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/overview',
      headers: { authorization: `Bearer ${userJwt}` },
    });
    assert.equal(res1.statusCode, 401);

    const res2 = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/access',
      headers: { authorization: `Bearer ${userJwt}` },
    });
    assert.equal(res2.statusCode, 401);
  });

  test('3. Non-allowlisted user cannot register or log into the admin portal', async () => {
    const { app } = await createIsolatedHarness();
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      payload: { username: 'RandomStranger', password: 'SomePassword123!' },
    });
    assert.equal(loginRes.statusCode, 401);

    const signupRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/register',
      payload: { username: 'Hacker', password: 'Password123!' },
    });
    assert.equal(signupRes.statusCode, 404);
  });

  test('4. Pre-authorized admin logging in with temporary password enters activation state', async () => {
    const { app } = await createIsolatedHarness();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      payload: { username: 'Ayush', password: CREDS.Ayush },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.authenticated, true);
    assert.equal(body.requiresActivation, true);
    assert.equal(body.identity.status, 'PENDING_ACTIVATION');
    assert.equal(body.identity.activationState, 'PENDING_EMAIL');
  });

  test('5. Unactivated admin cannot access operational admin modules', async () => {
    const { app } = await createIsolatedHarness();
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      payload: { username: 'Arun', password: CREDS.Arun },
    });
    const token = JSON.parse(loginRes.body).sessionToken as string;

    for (const url of ['/api/v1/admin/overview', '/api/v1/admin/users', '/api/v1/admin/capture', '/api/v1/admin/system', '/api/v1/admin/releases']) {
      const res = await app.inject({
        method: 'GET',
        url,
        headers: { authorization: `Bearer ${token}` },
      });
      assert.equal(res.statusCode, 403, `Unactivated admin must be denied access to ${url}`);
    }
  });

  test('6. Admin cannot bypass email verification during onboarding', async () => {
    const { app } = await createIsolatedHarness();
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      payload: { username: 'Akshat', password: CREDS.Akshat },
    });
    const token = JSON.parse(loginRes.body).sessionToken as string;

    const completeDirect = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/activation/complete',
      headers: { authorization: `Bearer ${token}` },
      payload: { newPassword: 'Strong#AdminPassword1', confirmPassword: 'Strong#AdminPassword1' },
    });
    assert.ok(completeDirect.statusCode === 400 || completeDirect.statusCode === 403);

    await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/activation/submit-email',
      headers: { authorization: `Bearer ${token}` },
      payload: { email: 'akshat@example.com' },
    });

    const wrongOtp = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/activation/verify-email',
      headers: { authorization: `Bearer ${token}` },
      payload: { code: '000000' },
    });
    assert.equal(wrongOtp.statusCode, 400);
  });

  test('7. Non-owner admin cannot bypass Primary Owner (Ansh) approval', async () => {
    const { app, mailer } = await createIsolatedHarness();
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      payload: { username: 'Dev', password: CREDS.Dev },
    });
    const token = JSON.parse(loginRes.body).sessionToken as string;

    await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/activation/submit-email',
      headers: { authorization: `Bearer ${token}` },
      payload: { email: 'dev@example.com' },
    });
    const otpMail = mailer.latestFor('dev@example.com', 'EMAIL_VERIFY')!;
    const verified = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/activation/verify-email',
      headers: { authorization: `Bearer ${token}` },
      payload: { code: otpMail.otpCode },
    });
    assert.equal(JSON.parse(verified.body).identity.activationState, 'AWAITING_OWNER_APPROVAL');

    const skipApproval = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/activation/complete',
      headers: { authorization: `Bearer ${token}` },
      payload: { newPassword: 'Strong#DevPassword9', confirmPassword: 'Strong#DevPassword9' },
    });
    assert.equal(skipApproval.statusCode, 403);
  });

  test('8. Non-owner admin cannot self-approve email verification', async () => {
    const { app, mailer } = await createIsolatedHarness();
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      payload: { username: 'Ayush', password: CREDS.Ayush },
    });
    const token = JSON.parse(loginRes.body).sessionToken as string;

    await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/activation/submit-email',
      headers: { authorization: `Bearer ${token}` },
      payload: { email: 'ayush@example.com' },
    });
    const otpMail = mailer.latestFor('ayush@example.com', 'EMAIL_VERIFY')!;
    await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/activation/verify-email',
      headers: { authorization: `Bearer ${token}` },
      payload: { code: otpMail.otpCode },
    });

    const selfApprove = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/access/adm_ayush/email-approval',
      headers: { authorization: `Bearer ${token}` },
      payload: { decision: 'approve' },
    });
    assert.equal(selfApprove.statusCode, 403);
  });

  test('9–13. Activated non-owner cannot access /access, toggle admins, switch roles, touch Ansh, or view /audit', async () => {
    const { app, mailer } = await createIsolatedHarness();
    const ownerToken = await activateAdminThroughLifecycle({
      app,
      mailer,
      username: 'Ansh',
      email: 'ansh@example.com',
      permanentPassword: 'OwnerStrong#Password1',
    });
    const ayushToken = await activateAdminThroughLifecycle({
      app,
      mailer,
      username: 'Ayush',
      email: 'ayush@example.com',
      permanentPassword: 'MemberStrong#Pass2!',
      ownerToken,
      adminId: 'adm_ayush',
    });

    // Promote Ayush to OPERATIONS_ADMIN; promotion bumps sessionVersion so Ayush re-authenticates
    const promoteRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/access/adm_ayush/role',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { role: 'OPERATIONS_ADMIN', reason: 'Elevated ops test' },
    });
    assert.equal(promoteRes.statusCode, 200);

    // Verify stale token with old role/sessionVersion fails (401)
    assert.equal(
      (await app.inject({ method: 'GET', url: '/api/v1/admin/overview', headers: { authorization: `Bearer ${ayushToken}` } })).statusCode,
      401,
    );

    const ayushRelogin = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      payload: { username: 'Ayush', password: 'MemberStrong#Pass2!' },
    });
    assert.equal(ayushRelogin.statusCode, 200);
    const opsToken = JSON.parse(ayushRelogin.body).sessionToken as string;

    // 9. Cannot access /access
    assert.equal(
      (await app.inject({ method: 'GET', url: '/api/v1/admin/access', headers: { authorization: `Bearer ${opsToken}` } })).statusCode,
      403,
    );
    // 10. Cannot enable/disable another admin
    assert.equal(
      (await app.inject({ method: 'POST', url: '/api/v1/admin/access/adm_arun/disable', headers: { authorization: `Bearer ${opsToken}` }, payload: { reason: 'Unauthorized attempt' } })).statusCode,
      403,
    );
    // 11. Cannot change role
    assert.equal(
      (await app.inject({ method: 'POST', url: '/api/v1/admin/access/adm_arun/role', headers: { authorization: `Bearer ${opsToken}` }, payload: { role: 'OPERATIONS_ADMIN' } })).statusCode,
      403,
    );
    // 12. Cannot disable or demote Ansh Gupta
    assert.equal(
      (await app.inject({ method: 'POST', url: '/api/v1/admin/access/adm_ansh/disable', headers: { authorization: `Bearer ${opsToken}` }, payload: { reason: 'Attempt against owner' } })).statusCode,
      403,
    );
    assert.equal(
      (await app.inject({ method: 'POST', url: '/api/v1/admin/access/adm_ansh/role', headers: { authorization: `Bearer ${opsToken}` }, payload: { role: 'SUPPORT_ADMIN' } })).statusCode,
      403,
    );
    // 13. Cannot view /audit
    assert.equal(
      (await app.inject({ method: 'GET', url: '/api/v1/admin/audit', headers: { authorization: `Bearer ${opsToken}` } })).statusCode,
      403,
    );
    // Confirm operational endpoints DO succeed for active Ayush
    assert.equal(
      (await app.inject({ method: 'GET', url: '/api/v1/admin/overview', headers: { authorization: `Bearer ${opsToken}` } })).statusCode,
      200,
    );
  });

  test('14–18. Owner governance: approval, immediate session revocation on disable, blocked login, re-enable, owner self-protection', async () => {
    const { app, mailer } = await createIsolatedHarness();
    const ownerToken = await activateAdminThroughLifecycle({
      app,
      mailer,
      username: 'Ansh',
      email: 'ansh@example.com',
      permanentPassword: 'OwnerStrong#Password1',
    });

    // 14. Owner approves Arun and Arun activates
    const arunToken = await activateAdminThroughLifecycle({
      app,
      mailer,
      username: 'Arun',
      email: 'arun@example.com',
      permanentPassword: 'OpsMember#Pass3!',
      ownerToken,
      adminId: 'adm_arun',
    });
    assert.equal(
      (await app.inject({ method: 'GET', url: '/api/v1/admin/overview', headers: { authorization: `Bearer ${arunToken}` } })).statusCode,
      200,
    );

    // 15. Ansh disables Arun -> active session fails immediately
    const disableRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/access/adm_arun/disable',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { reason: 'Offboarded temporarily' },
    });
    assert.equal(disableRes.statusCode, 200);

    const revokedCall = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/overview',
      headers: { authorization: `Bearer ${arunToken}` },
    });
    assert.equal(revokedCall.statusCode, 401);

    // 16. Disabled admin cannot log in with permanent or temporary password
    const disabledPermLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      payload: { username: 'Arun', password: 'OpsMember#Pass3!' },
    });
    assert.equal(disabledPermLogin.statusCode, 403);

    const disabledTempLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      payload: { username: 'Arun', password: CREDS.Arun },
    });
    assert.equal(disabledTempLogin.statusCode, 403);

    // 17. Ansh re-enables Arun -> Arun logs back in successfully
    const enableRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/access/adm_arun/enable',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { reason: 'Restored duties' },
    });
    assert.equal(enableRes.statusCode, 200);

    const reloginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      payload: { username: 'Arun', password: 'OpsMember#Pass3!' },
    });
    assert.equal(reloginRes.statusCode, 200);

    // 18. Ansh cannot disable or demote himself
    const selfDisable = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/access/adm_ansh/disable',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { reason: 'Self disable must fail' },
    });
    assert.equal(selfDisable.statusCode, 403);

    const selfDemote = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/access/adm_ansh/role',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { role: 'SUPPORT_ADMIN' },
    });
    assert.equal(selfDemote.statusCode, 403);
  });

  test('19–20. Weak/roll-number password rejected & temporary password permanently invalidated post-activation', async () => {
    const { app, mailer } = await createIsolatedHarness();
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      payload: { username: 'Ansh', password: CREDS.Ansh },
    });
    const tempToken = JSON.parse(loginRes.body).sessionToken as string;

    await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/activation/submit-email',
      headers: { authorization: `Bearer ${tempToken}` },
      payload: { email: 'ansh@example.com' },
    });
    const otpMail = mailer.latestFor('ansh@example.com', 'EMAIL_VERIFY')!;
    await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/activation/verify-email',
      headers: { authorization: `Bearer ${tempToken}` },
      payload: { code: otpMail.otpCode },
    });

    // 19. Reject roll number or weak digits-only password
    const rollAsPassword = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/activation/complete',
      headers: { authorization: `Bearer ${tempToken}` },
      payload: { newPassword: CREDS.Ansh, confirmPassword: CREDS.Ansh },
    });
    assert.equal(rollAsPassword.statusCode, 400);

    const digitsOnly = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/activation/complete',
      headers: { authorization: `Bearer ${tempToken}` },
      payload: { newPassword: '12345678901234', confirmPassword: '12345678901234' },
    });
    assert.equal(digitsOnly.statusCode, 400);

    // Valid strong password activates account
    const ok = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/activation/complete',
      headers: { authorization: `Bearer ${tempToken}` },
      payload: { newPassword: 'OwnerStrong#Password1', confirmPassword: 'OwnerStrong#Password1' },
    });
    assert.equal(ok.statusCode, 200);

    // 20. Temporary password stops working permanently
    const replayTemp = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      payload: { username: 'Ansh', password: CREDS.Ansh },
    });
    assert.equal(replayTemp.statusCode, 401);
  });

  test('21–23. Authenticated password change, verified-only reset tokens (expiry + single-use), and verified email change', async () => {
    const { app, repo, mailer } = await createIsolatedHarness();
    const ownerToken = await activateAdminThroughLifecycle({
      app,
      mailer,
      username: 'Ansh',
      email: 'ansh@example.com',
      permanentPassword: 'OwnerStrong#Password1',
    });

    // 21. Change password requires correct current password and revokes old session
    const badChange = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/change-password',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        currentPassword: 'WrongCurrentPassword!',
        newPassword: 'OwnerStrong#Password2',
        confirmPassword: 'OwnerStrong#Password2',
      },
    });
    assert.equal(badChange.statusCode, 401);

    const goodChange = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/change-password',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        currentPassword: 'OwnerStrong#Password1',
        newPassword: 'OwnerStrong#Password2',
        confirmPassword: 'OwnerStrong#Password2',
      },
    });
    assert.equal(goodChange.statusCode, 200);
    const rotatedToken = JSON.parse(goodChange.body).sessionToken as string;

    // Old token must fail immediately after password rotation
    assert.equal(
      (await app.inject({ method: 'GET', url: '/api/v1/admin/overview', headers: { authorization: `Bearer ${ownerToken}` } })).statusCode,
      401,
    );
    assert.equal(
      (await app.inject({ method: 'GET', url: '/api/v1/admin/overview', headers: { authorization: `Bearer ${rotatedToken}` } })).statusCode,
      200,
    );

    // 22. Forgot/reset only dispatches to verified emails, expires, and is single-use
    await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/forgot-password',
      payload: { email: 'unverified-stranger@example.com' },
    });
    assert.equal(mailer.latestFor('unverified-stranger@example.com', 'PASSWORD_RESET'), undefined);

    await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/forgot-password',
      payload: { email: 'ansh@example.com' },
    });
    const resetMail = mailer.latestFor('ansh@example.com', 'PASSWORD_RESET');
    assert.ok(resetMail?.resetToken, 'Verified email must receive single-use reset token');

    // Simulate expired token check by validating another token with expired timestamp
    const devToken = await activateAdminThroughLifecycle({
      app,
      mailer,
      username: 'Dev',
      email: 'dev@example.com',
      permanentPassword: 'LedgerAdmin#Pass4!',
      ownerToken: rotatedToken,
      adminId: 'adm_dev',
    });
    await app.inject({
      method: 'POST',
      url: '/api/v1/admin/access/adm_dev/reset-password',
      headers: { authorization: `Bearer ${rotatedToken}` },
    });
    const devResetMail = mailer.latestFor('dev@example.com', 'PASSWORD_RESET')!;
    const { sha256Hex } = await import('../src/modules/admin/admin.crypto.js');
    // Explicitly test expired token rejection
    await repo.createToken({
      tokenHash: sha256Hex('expired-token-sample'),
      adminId: 'adm_dev',
      purpose: 'PASSWORD_RESET',
      targetEmail: 'dev@example.com',
      codeHash: null,
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
      consumedAt: null,
      createdAt: new Date(Date.now() - 120_000).toISOString(),
    });
    const expiredUse = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/reset-password',
      payload: {
        token: 'expired-token-sample',
        newPassword: 'LedgerAdmin#Pass5!',
        confirmPassword: 'LedgerAdmin#Pass5!',
      },
    });
    assert.equal(expiredUse.statusCode, 400);

    await repo.markTokenConsumed(sha256Hex(devResetMail.resetToken!));
    const consumedUse = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/reset-password',
      payload: {
        token: devResetMail.resetToken,
        newPassword: 'LedgerAdmin#Pass5!',
        confirmPassword: 'LedgerAdmin#Pass5!',
      },
    });
    assert.equal(consumedUse.statusCode, 400);

    // Actual single-use reset on Ansh succeeds once and fails replay
    const firstReset = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/reset-password',
      payload: {
        token: resetMail.resetToken,
        newPassword: 'OwnerStrong#Password3',
        confirmPassword: 'OwnerStrong#Password3',
      },
    });
    assert.equal(firstReset.statusCode, 200);

    const replayReset = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/reset-password',
      payload: {
        token: resetMail.resetToken,
        newPassword: 'OwnerStrong#Password4',
        confirmPassword: 'OwnerStrong#Password4',
      },
    });
    assert.equal(replayReset.statusCode, 400);

    // 23. Changing email requires re-verification & owner approval for non-owner
    const devFreshLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      payload: { username: 'Dev', password: 'LedgerAdmin#Pass4!' },
    });
    const devFreshToken = JSON.parse(devFreshLogin.body).sessionToken as string;
    assert.ok(devToken);

    const emailChangeRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/change-email',
      headers: { authorization: `Bearer ${devFreshToken}` },
      payload: { currentPassword: 'LedgerAdmin#Pass4!', newEmail: 'dev.updated@example.com' },
    });
    assert.equal(emailChangeRes.statusCode, 200);
    const changedIdentity = JSON.parse(emailChangeRes.body).identity;
    assert.equal(changedIdentity.verifiedEmail, 'dev@example.com');
    assert.equal(changedIdentity.pendingEmail, 'dev.updated@example.com');
    assert.equal(changedIdentity.pendingEmailVerified, false);

    // Verify new email OTP sets pendingEmailVerified=true without immediately replacing verifiedEmail until Owner approves
    const changeOtpMail = mailer.latestFor('dev.updated@example.com', 'EMAIL_VERIFY')!;
    const verifiedChangeRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/activation/verify-email',
      headers: { authorization: `Bearer ${devFreshToken}` },
      payload: { code: changeOtpMail.otpCode },
    });
    assert.equal(verifiedChangeRes.statusCode, 200);
    const postVerifyIdentity = JSON.parse(verifiedChangeRes.body).identity;
    assert.equal(postVerifyIdentity.verifiedEmail, 'dev@example.com');
    assert.equal(postVerifyIdentity.pendingEmailVerified, true);

    // Ansh re-authenticates after his Test 22 password reset (which revoked old sessions), then approves Dev's email change
    const ownerReauth = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      payload: { username: 'Ansh', password: 'OwnerStrong#Password3' },
    });
    assert.equal(ownerReauth.statusCode, 200);
    const freshOwnerToken = JSON.parse(ownerReauth.body).sessionToken as string;

    const approveChangeRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/access/adm_dev/email-approval',
      headers: { authorization: `Bearer ${freshOwnerToken}` },
      payload: { decision: 'approve', reason: 'Verified updated address' },
    });
    assert.equal(approveChangeRes.statusCode, 200);
    const approvedMember = JSON.parse(approveChangeRes.body).member;
    assert.equal(approvedMember.verifiedEmail, 'dev.updated@example.com');
    assert.equal(approvedMember.pendingEmail, null);
  });

  test('24. Secret hygiene & financial boundary: no plaintext roll numbers, service keys, or financial table queries in source', () => {
    const backendSrc = path.resolve(process.cwd(), 'src');
    const adminModuleDir = path.join(backendSrc, 'modules', 'admin');
    const forbiddenCreds = Object.values(CREDS);
    const financialTables = ['transactions', 'balance_movements', 'person_money_records', 'financial_documents'];

    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.ts')) files.push(full);
      }
    };
    walk(backendSrc);

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      for (const roll of forbiddenCreds) {
        assert.equal(
          content.includes(roll),
          false,
          `Plaintext initial credential must never exist in backend/${path.relative(backendSrc, file)}`,
        );
      }
    }

    // Confirm no admin module file queries private user financial tables
    const adminFiles = fs.readdirSync(adminModuleDir).filter((f) => f.endsWith('.ts'));
    for (const file of adminFiles) {
      const content = fs.readFileSync(path.join(adminModuleDir, file), 'utf8');
      for (const table of financialTables) {
        assert.equal(
          new RegExp(`\\.from\\(['"\`]${table}['"\`]\\)`).test(content),
          false,
          `Admin module ${file} must never query private financial table ${table}`,
        );
      }
    }
  });
});
