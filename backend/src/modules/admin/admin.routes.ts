import path from 'node:path';
import type { FastifyInstance, FastifyPluginAsync, FastifyReply } from 'fastify';
import type { AdminAuditResult, AdminRole } from '@arth/contracts';
import type { AppConfig } from '../../config/index.js';
import { generateOpaqueToken } from './admin.crypto.js';
import { AdminMailer, type IAdminMailer } from './admin.mailer.js';
import { AdminRateLimiter } from './admin.rate-limit.js';
import { createAdminAuthGuard } from './admin.rbac.js';
import { createAdminRepository, type IAdminRepository } from './admin.repository.js';
import { AdminDomainError, AdminService } from './admin.service.js';
import { recordApiSample } from './admin.telemetry.js';

export interface AdminRoutesOptions {
  config: AppConfig;
  repository?: IAdminRepository;
  mailer?: IAdminMailer;
  jwtSecret?: string;
  rateLimiter?: AdminRateLimiter;
}

function handleAdminError(err: unknown, reply: FastifyReply) {
  if (err instanceof AdminDomainError) {
    return reply.status(err.statusCode).send({
      statusCode: err.statusCode,
      error: err.statusCode === 403 ? 'Forbidden' : err.statusCode === 401 ? 'Unauthorized' : 'Bad Request',
      message: err.message,
    });
  }
  return reply.status(500).send({
    statusCode: 500,
    error: 'Internal Server Error',
    message: 'Unexpected administrative server error.',
  });
}

function parseBoundedPagination(query: Record<string, unknown>): { page: number; pageSize: number } {
  const rawPage = Number(query?.page || 1);
  const rawSize = Number(query?.pageSize || 20);
  const page = Number.isFinite(rawPage) ? Math.min(1000, Math.max(1, Math.trunc(rawPage))) : 1;
  const pageSize = Number.isFinite(rawSize) ? Math.min(50, Math.max(1, Math.trunc(rawSize))) : 20;
  return { page, pageSize };
}

export const adminRoutes: FastifyPluginAsync<AdminRoutesOptions> = async (
  app: FastifyInstance,
  options: AdminRoutesOptions
) => {
  const jwtSecret =
    options.jwtSecret ||
    process.env.ADMIN_JWT_SECRET ||
    options.config.supabaseJwtSecret ||
    `spendsense-dev-admin-ephemeral-${generateOpaqueToken()}`;

  const defaultLocalFile =
    options.config.env === 'test'
      ? null
      : path.resolve(process.cwd(), '.local-admin-state.json');

  const defaultMailboxFile =
    options.config.env === 'test'
      ? null
      : path.resolve(process.cwd(), '.local-admin-mailbox.json');

  const repo = options.repository || createAdminRepository(options.config, { persistFilePath: defaultLocalFile });
  const mailer =
    options.mailer ||
    new AdminMailer({
      resendApiKey: process.env.RESEND_API_KEY,
      fromAddress: process.env.ADMIN_MAIL_FROM,
      localMailboxFilePath: defaultMailboxFile,
    });
  const service = new AdminService(repo, mailer, options.config, jwtSecret);
  const limiter = options.rateLimiter || new AdminRateLimiter();

  await repo.ensureProvisioned();

  app.addHook('onResponse', async (request, reply) => {
    const start = (request as unknown as { _startMs?: number })._startMs;
    const duration = typeof start === 'number' ? Date.now() - start : 5;
    const isAuthErr = request.url.startsWith('/api/v1/admin/auth') && (reply.statusCode === 401 || reply.statusCode === 403);
    recordApiSample(duration, reply.statusCode, isAuthErr);
  });

  app.addHook('onRequest', async (request) => {
    (request as unknown as { _startMs?: number })._startMs = Date.now();
  });

  const requireAuthenticated = createAdminAuthGuard({ repo, jwtSecret, requireActive: false });
  const requireOverview = createAdminAuthGuard({ repo, jwtSecret, requireActive: true, permission: 'overview:read' });
  const requireUsers = createAdminAuthGuard({ repo, jwtSecret, requireActive: true, permission: 'users:read' });
  const requireCapture = createAdminAuthGuard({ repo, jwtSecret, requireActive: true, permission: 'capture:read' });
  const requireSystem = createAdminAuthGuard({ repo, jwtSecret, requireActive: true, permission: 'system:read' });
  const requireReleases = createAdminAuthGuard({ repo, jwtSecret, requireActive: true, permission: 'releases:read' });
  const requireAudit = createAdminAuthGuard({ repo, jwtSecret, requireActive: true, permission: 'audit:read' });
  const requireOwnerAccess = createAdminAuthGuard({ repo, jwtSecret, requireActive: true, permission: 'access:manage' });

  // ---------------------------------------------------------------------------
  // AUTH & FIRST-TIME ACTIVATION LIFECYCLE
  // ---------------------------------------------------------------------------
  app.post('/api/v1/admin/auth/login', async (request, reply) => {
    const ipKey = `login:${request.ip}`;
    const rate = limiter.checkAndConsume(ipKey, 20, 10 * 60 * 1000);
    if (!rate.allowed) {
      return reply.status(429).send({
        statusCode: 429,
        error: 'Too Many Requests',
        message: `Too many login attempts. Try again in ${rate.retryAfterSec}s.`,
      });
    }

    const body = (request.body || {}) as { username?: string; password?: string };
    try {
      const result = await service.login(body.username || '', body.password || '');
      return reply.status(200).send(result);
    } catch (err) {
      return handleAdminError(err, reply);
    }
  });

  app.get('/api/v1/admin/auth/me', { preHandler: [requireAuthenticated] }, async (request, reply) => {
    const m = request.adminContext!.membership;
    return reply.status(200).send({
      adminId: m.adminId,
      fullName: m.fullName,
      username: m.username,
      role: m.role,
      isOwner: m.isOwner,
      status: m.status,
      activationState: m.activationState,
      verifiedEmail: m.verifiedEmail,
      pendingEmail: m.pendingEmail,
      pendingEmailVerified: m.pendingEmailVerified,
      lastLoginAt: m.lastLoginAt,
      lastSeenAt: m.lastSeenAt,
    });
  });

  app.post('/api/v1/admin/auth/logout', { preHandler: [requireAuthenticated] }, async (request, reply) => {
    const ctx = request.adminContext!;
    await service.logout(ctx.membership, ctx.sessionId);
    return reply.status(200).send({ ok: true });
  });

  app.post(
    '/api/v1/admin/auth/activation/submit-email',
    { preHandler: [requireAuthenticated] },
    async (request, reply) => {
      const body = (request.body || {}) as { email?: string };
      try {
        const identity = await service.submitActivationEmail(request.adminContext!.membership, body.email || '');
        return reply.status(200).send({ identity });
      } catch (err) {
        return handleAdminError(err, reply);
      }
    }
  );

  app.post(
    '/api/v1/admin/auth/activation/verify-email',
    { preHandler: [requireAuthenticated] },
    async (request, reply) => {
      const rate = limiter.checkAndConsume(`otp:${request.adminContext!.membership.adminId}`, 12, 15 * 60 * 1000);
      if (!rate.allowed) {
        return reply.status(429).send({
          statusCode: 429,
          error: 'Too Many Requests',
          message: `Too many verification attempts. Try again in ${rate.retryAfterSec}s.`,
        });
      }
      const body = (request.body || {}) as { code?: string };
      try {
        const identity = await service.verifyActivationEmail(request.adminContext!.membership, body.code || '');
        return reply.status(200).send({ identity });
      } catch (err) {
        return handleAdminError(err, reply);
      }
    }
  );

  app.post(
    '/api/v1/admin/auth/activation/complete',
    { preHandler: [requireAuthenticated] },
    async (request, reply) => {
      const body = (request.body || {}) as { newPassword?: string; confirmPassword?: string };
      try {
        const result = await service.completeActivation(
          request.adminContext!.membership,
          body.newPassword || '',
          body.confirmPassword || ''
        );
        return reply.status(200).send(result);
      } catch (err) {
        return handleAdminError(err, reply);
      }
    }
  );

  app.post('/api/v1/admin/auth/forgot-password', async (request, reply) => {
    const rate = limiter.checkAndConsume(`forgot:${request.ip}`, 10, 15 * 60 * 1000);
    if (!rate.allowed) {
      return reply.status(429).send({
        statusCode: 429,
        error: 'Too Many Requests',
        message: 'Too many recovery requests. Try again shortly.',
      });
    }
    const body = (request.body || {}) as { email?: string };
    try {
      const res = await service.initiateForgotPassword(body.email || '');
      return reply.status(200).send(res);
    } catch (err) {
      return handleAdminError(err, reply);
    }
  });

  app.post('/api/v1/admin/auth/reset-password', async (request, reply) => {
    const body = (request.body || {}) as { token?: string; newPassword?: string; confirmPassword?: string };
    try {
      await service.completePasswordReset(body.token || '', body.newPassword || '', body.confirmPassword || '');
      return reply.status(200).send({ ok: true });
    } catch (err) {
      return handleAdminError(err, reply);
    }
  });

  app.post('/api/v1/admin/auth/change-password', { preHandler: [requireOverview] }, async (request, reply) => {
    const body = (request.body || {}) as { currentPassword?: string; newPassword?: string; confirmPassword?: string };
    try {
      const sessionToken = await service.changePermanentPassword(
        request.adminContext!.membership,
        body.currentPassword || '',
        body.newPassword || '',
        body.confirmPassword || ''
      );
      return reply.status(200).send({ ok: true, sessionToken });
    } catch (err) {
      return handleAdminError(err, reply);
    }
  });

  app.post('/api/v1/admin/auth/change-email', { preHandler: [requireOverview] }, async (request, reply) => {
    const body = (request.body || {}) as { currentPassword?: string; newEmail?: string };
    try {
      const identity = await service.requestEmailChange(
        request.adminContext!.membership,
        body.currentPassword || '',
        body.newEmail || ''
      );
      return reply.status(200).send({ identity });
    } catch (err) {
      return handleAdminError(err, reply);
    }
  });

  // ---------------------------------------------------------------------------
  // OWNER ACCESS CONTROL (/api/v1/admin/access) — Strictly Ansh Gupta ONLY
  // ---------------------------------------------------------------------------
  app.get('/api/v1/admin/access', { preHandler: [requireOwnerAccess] }, async (request, reply) => {
    try {
      const overview = await service.getAccessOverview(request.adminContext!.membership);
      return reply.status(200).send(overview);
    } catch (err) {
      return handleAdminError(err, reply);
    }
  });

  app.post('/api/v1/admin/access/:adminId/disable', { preHandler: [requireOwnerAccess] }, async (request, reply) => {
    const { adminId } = request.params as { adminId: string };
    const body = (request.body || {}) as { reason?: string };
    try {
      const member = await service.disableAdmin(request.adminContext!.membership, adminId, body.reason || '');
      return reply.status(200).send({ member });
    } catch (err) {
      return handleAdminError(err, reply);
    }
  });

  app.post('/api/v1/admin/access/:adminId/enable', { preHandler: [requireOwnerAccess] }, async (request, reply) => {
    const { adminId } = request.params as { adminId: string };
    const body = (request.body || {}) as { reason?: string };
    try {
      const member = await service.enableAdmin(request.adminContext!.membership, adminId, body.reason);
      return reply.status(200).send({ member });
    } catch (err) {
      return handleAdminError(err, reply);
    }
  });

  app.post('/api/v1/admin/access/:adminId/role', { preHandler: [requireOwnerAccess] }, async (request, reply) => {
    const { adminId } = request.params as { adminId: string };
    const body = (request.body || {}) as { role?: AdminRole; reason?: string };
    try {
      const member = await service.changeAdminRole(
        request.adminContext!.membership,
        adminId,
        body.role as AdminRole,
        body.reason
      );
      return reply.status(200).send({ member });
    } catch (err) {
      return handleAdminError(err, reply);
    }
  });

  app.post('/api/v1/admin/access/:adminId/email-approval', { preHandler: [requireOwnerAccess] }, async (request, reply) => {
    const { adminId } = request.params as { adminId: string };
    const body = (request.body || {}) as { decision?: 'approve' | 'reject'; reason?: string };
    if (body.decision !== 'approve' && body.decision !== 'reject') {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'decision must be approve or reject.' });
    }
    try {
      const member = await service.processEmailApproval(
        request.adminContext!.membership,
        adminId,
        body.decision,
        body.reason
      );
      return reply.status(200).send({ member });
    } catch (err) {
      return handleAdminError(err, reply);
    }
  });

  app.post('/api/v1/admin/access/:adminId/reset-password', { preHandler: [requireOwnerAccess] }, async (request, reply) => {
    const { adminId } = request.params as { adminId: string };
    try {
      const res = await service.ownerInitiateReset(request.adminContext!.membership, adminId);
      return reply.status(200).send(res);
    } catch (err) {
      return handleAdminError(err, reply);
    }
  });

  app.get('/api/v1/admin/access/:adminId/activity', { preHandler: [requireOwnerAccess] }, async (request, reply) => {
    const { adminId } = request.params as { adminId: string };
    try {
      const activity = await service.getAdminActivity(request.adminContext!.membership, adminId);
      return reply.status(200).send({ activity });
    } catch (err) {
      return handleAdminError(err, reply);
    }
  });

  // ---------------------------------------------------------------------------
  // OPERATIONS PORTAL MODULES
  // ---------------------------------------------------------------------------
  app.get('/api/v1/admin/overview', { preHandler: [requireOverview] }, async (_request, reply) => {
    try {
      return reply.status(200).send(await service.getOverview());
    } catch (err) {
      return handleAdminError(err, reply);
    }
  });

  app.get('/api/v1/admin/users', { preHandler: [requireUsers] }, async (request, reply) => {
    const query = (request.query || {}) as Record<string, unknown>;
    const { page, pageSize } = parseBoundedPagination(query);
    const search = typeof query.search === 'string' ? query.search : undefined;
    try {
      return reply.status(200).send(await service.getUsersDiagnostics({ search, page, pageSize }));
    } catch (err) {
      return handleAdminError(err, reply);
    }
  });

  app.get('/api/v1/admin/capture', { preHandler: [requireCapture] }, async (_request, reply) => {
    try {
      return reply.status(200).send(await service.getCaptureTelemetry());
    } catch (err) {
      return handleAdminError(err, reply);
    }
  });

  app.get('/api/v1/admin/system', { preHandler: [requireSystem] }, async (_request, reply) => {
    try {
      return reply.status(200).send(await service.getSystemHealth());
    } catch (err) {
      return handleAdminError(err, reply);
    }
  });

  app.get('/api/v1/admin/releases', { preHandler: [requireReleases] }, async (_request, reply) => {
    try {
      return reply.status(200).send(await service.getReleases());
    } catch (err) {
      return handleAdminError(err, reply);
    }
  });

  app.get('/api/v1/admin/audit', { preHandler: [requireAudit] }, async (request, reply) => {
    const query = (request.query || {}) as Record<string, unknown>;
    const { page, pageSize } = parseBoundedPagination(query);
    const action = typeof query.action === 'string' ? query.action : undefined;
    const result =
      query.result === 'SUCCESS' || query.result === 'DENIED' || query.result === 'FAILED'
        ? (query.result as AdminAuditResult)
        : undefined;
    try {
      return reply.status(200).send(
        await service.getAuditLogs(request.adminContext!.membership, { page, pageSize, action, result })
      );
    } catch (err) {
      return handleAdminError(err, reply);
    }
  });
};
