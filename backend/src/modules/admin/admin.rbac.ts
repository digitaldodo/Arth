import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AdminRole } from '@arth/contracts';
import { verifyAdminSessionToken } from './admin.crypto.js';
import type { IAdminRepository, StoredAdminMembership } from './admin.repository.js';

export type AdminPermission =
  | 'overview:read'
  | 'users:read'
  | 'capture:read'
  | 'system:read'
  | 'releases:read'
  | 'audit:read'
  | 'access:manage';

const ROLE_PERMISSIONS: Record<AdminRole, ReadonlySet<AdminPermission>> = {
  OWNER_ADMIN: new Set<AdminPermission>([
    'overview:read',
    'users:read',
    'capture:read',
    'system:read',
    'releases:read',
    'audit:read',
    'access:manage',
  ]),
  OPERATIONS_ADMIN: new Set<AdminPermission>([
    'overview:read',
    'users:read',
    'capture:read',
    'system:read',
    'releases:read',
  ]),
  SUPPORT_ADMIN: new Set<AdminPermission>([
    'overview:read',
    'users:read',
    'system:read',
    'releases:read',
  ]),
};

export function hasAdminPermission(role: AdminRole, permission: AdminPermission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

export interface VerifiedAdminContext {
  membership: StoredAdminMembership;
  sessionId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    adminContext?: VerifiedAdminContext;
  }
}

export function createAdminAuthGuard(params: {
  repo: IAdminRepository;
  jwtSecret: string;
  requireActive?: boolean;
  permission?: AdminPermission;
}) {
  const { repo, jwtSecret, requireActive = true, permission } = params;

  return async function verifyAdminRequest(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Admin bearer authentication required.',
      });
    }

    const token = authHeader.slice(7).trim();
    const payload = verifyAdminSessionToken(token, jwtSecret);
    if (!payload) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid or expired admin session.',
      });
    }

    // Always re-verify live database membership & session revocation status server-side
    const [membership, session] = await Promise.all([
      repo.findByAdminId(payload.sub),
      repo.findSession(payload.sid),
    ]);

    if (!membership || !session || session.adminId !== membership.adminId) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Administrator session is no longer valid.',
      });
    }

    if (session.revokedAt || Date.parse(session.expiresAt) <= Date.now() || session.sessionVersion !== membership.sessionVersion || payload.sv !== membership.sessionVersion) {
      await repo.appendAuditLog({
        actorAdminId: membership.adminId,
        actorUsername: membership.username,
        actorRole: membership.role,
        action: 'SESSION_REJECTED_REVOKED',
        targetId: membership.adminId,
        result: 'DENIED',
        reason: 'Session revoked or superseded',
        metadata: { path: request.url },
      });
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Administrative session has been revoked. Sign in again.',
      });
    }

    if (membership.status === 'DISABLED') {
      await repo.appendAuditLog({
        actorAdminId: membership.adminId,
        actorUsername: membership.username,
        actorRole: membership.role,
        action: 'DISABLED_ADMIN_REQUEST_BLOCKED',
        targetId: membership.adminId,
        result: 'DENIED',
        reason: membership.disabledReason || 'Administrator account disabled',
        metadata: { path: request.url },
      });
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Your administrator access has been disabled by the primary owner.',
      });
    }

    if (requireActive && (membership.activationState !== 'ACTIVE' || membership.status !== 'ENABLED')) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Complete administrator activation before accessing portal modules.',
      });
    }

    if (permission && !hasAdminPermission(membership.role, permission)) {
      await repo.appendAuditLog({
        actorAdminId: membership.adminId,
        actorUsername: membership.username,
        actorRole: membership.role,
        action: 'RBAC_PERMISSION_DENIED',
        targetId: permission,
        result: 'DENIED',
        reason: `Role ${membership.role} lacks ${permission}`,
        metadata: { path: request.url },
      });
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Insufficient administrative role for this action.',
      });
    }

    await repo.updateMembership(membership.adminId, { lastSeenAt: new Date().toISOString() });
    request.adminContext = { membership, sessionId: session.sessionId };
  };
}
