import crypto from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  AdminAccessMemberDTO,
  AdminAccessOverviewResponse,
  AdminAuditLogDTO,
  AdminAuditResult,
  AdminCaptureTelemetryDTO,
  AdminIdentityDTO,
  AdminLoginResponse,
  AdminOverviewDTO,
  AdminReleaseMonitorDTO,
  AdminRole,
  AdminSystemHealthDTO,
  AdminUsersResponse,
} from '@arth/contracts';
import type { AppConfig } from '../../config/index.js';
import {
  generateNumericOtp,
  generateOpaqueToken,
  hashPassword,
  sha256Hex,
  signAdminSessionToken,
  validatePermanentPasswordPolicy,
  verifyPasswordHash,
} from './admin.crypto.js';
import type { IAdminMailer } from './admin.mailer.js';
import { OWNER_ADMIN_ID, PRE_AUTHORIZED_ADMINS } from './admin.provisioning.js';
import type { IAdminRepository, StoredAdminAuditLog, StoredAdminMembership } from './admin.repository.js';
import { fetchReadOnlyReleaseMonitor, getApiTelemetrySummary } from './admin.telemetry.js';

export class AdminDomainError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'AdminDomainError';
  }
}

const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 hours
const OTP_TTL_MS = 15 * 60 * 1000; // 15 minutes
const RESET_TTL_MS = 30 * 60 * 1000; // 30 minutes
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toIdentityDTO(m: StoredAdminMembership): AdminIdentityDTO {
  return {
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
  };
}

function toAccessMemberDTO(m: StoredAdminMembership): AdminAccessMemberDTO {
  return {
    ...toIdentityDTO(m),
    tempCredentialInvalidated: m.tempCredentialInvalidated,
    disabledAt: m.disabledAt,
    disabledReason: m.disabledReason,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

function toAuditLogDTO(l: StoredAdminAuditLog): AdminAuditLogDTO {
  return {
    id: l.id,
    actorAdminId: l.actorAdminId,
    actorUsername: l.actorUsername,
    actorRole: l.actorRole,
    action: l.action,
    targetId: l.targetId,
    result: l.result,
    reason: l.reason,
    metadata: l.metadata,
    createdAt: l.createdAt,
  };
}

export class AdminService {
  private readonly supabaseAdminClient: SupabaseClient | null;

  constructor(
    private readonly repo: IAdminRepository,
    private readonly mailer: IAdminMailer,
    private readonly config: AppConfig,
    private readonly jwtSecret: string
  ) {
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    this.supabaseAdminClient =
      config.supabaseUrl && serviceRole
        ? createClient(config.supabaseUrl, serviceRole, {
            auth: { autoRefreshToken: false, persistSession: false },
          })
        : null;
  }

  private async createAndPersistSession(member: StoredAdminMembership): Promise<string> {
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
    await this.repo.createSession({
      sessionId,
      adminId: member.adminId,
      sessionVersion: member.sessionVersion,
      expiresAt,
      revokedAt: null,
      createdAt: new Date().toISOString(),
    });
    return signAdminSessionToken(
      {
        sub: member.adminId,
        sid: sessionId,
        role: member.role,
        sv: member.sessionVersion,
      },
      this.jwtSecret,
      SESSION_TTL_SECONDS
    );
  }

  async login(rawUsername: string, password: string): Promise<AdminLoginResponse> {
    await this.repo.ensureProvisioned();
    const username = typeof rawUsername === 'string' ? rawUsername.trim() : '';
    if (!username || typeof password !== 'string' || !password) {
      await this.repo.appendAuditLog({
        actorAdminId: null,
        actorUsername: username || null,
        actorRole: 'ANONYMOUS',
        action: 'ADMIN_LOGIN_ATTEMPT',
        targetId: username || null,
        result: 'FAILED',
        reason: 'Missing username or password',
        metadata: {},
      });
      throw new AdminDomainError(400, 'Username and password are required.');
    }

    const member = await this.repo.findByUsername(username);
    if (!member) {
      await this.repo.appendAuditLog({
        actorAdminId: null,
        actorUsername: username,
        actorRole: 'ANONYMOUS',
        action: 'ADMIN_LOGIN_ATTEMPT',
        targetId: username,
        result: 'DENIED',
        reason: 'Unknown administrator username',
        metadata: {},
      });
      throw new AdminDomainError(401, 'Invalid administrator credentials.');
    }

    if (member.status === 'DISABLED') {
      await this.repo.appendAuditLog({
        actorAdminId: member.adminId,
        actorUsername: member.username,
        actorRole: member.role,
        action: 'ADMIN_LOGIN_BLOCKED_DISABLED',
        targetId: member.adminId,
        result: 'DENIED',
        reason: member.disabledReason || 'Account disabled by owner',
        metadata: {},
      });
      throw new AdminDomainError(403, 'Administrator access is disabled. Contact the primary owner.');
    }

    const isActivated = member.activationState === 'ACTIVE';
    let passwordMatches = false;

    if (isActivated) {
      // Activated admins must never be able to use temporary roll numbers again.
      if (member.tempCredentialInvalidated && member.permanentPasswordHash) {
        passwordMatches = verifyPasswordHash(password, member.permanentPasswordHash);
      }
    } else {
      // Pre-activation admins authenticate strictly via their initial temporary credential hash
      if (!member.tempCredentialInvalidated && member.tempCredentialHash) {
        passwordMatches = verifyPasswordHash(password, member.tempCredentialHash);
      }
    }

    if (!passwordMatches) {
      await this.repo.appendAuditLog({
        actorAdminId: member.adminId,
        actorUsername: member.username,
        actorRole: member.role,
        action: 'ADMIN_LOGIN_FAILED',
        targetId: member.adminId,
        result: 'FAILED',
        reason: isActivated ? 'Invalid permanent password' : 'Invalid temporary credential',
        metadata: { activationState: member.activationState },
      });
      throw new AdminDomainError(401, 'Invalid administrator credentials.');
    }

    const nowIso = new Date().toISOString();
    const updated = await this.repo.updateMembership(member.adminId, {
      lastLoginAt: nowIso,
      lastSeenAt: nowIso,
    });
    const sessionToken = await this.createAndPersistSession(updated);

    await this.repo.appendAuditLog({
      actorAdminId: updated.adminId,
      actorUsername: updated.username,
      actorRole: updated.role,
      action: isActivated ? 'ADMIN_LOGIN_SUCCESS' : 'ADMIN_TEMP_LOGIN_SUCCESS',
      targetId: updated.adminId,
      result: 'SUCCESS',
      reason: null,
      metadata: { activationState: updated.activationState },
    });

    return {
      authenticated: true,
      requiresActivation: updated.activationState !== 'ACTIVE',
      identity: toIdentityDTO(updated),
      sessionToken,
    };
  }

  async logout(member: StoredAdminMembership, sessionId: string): Promise<void> {
    await this.repo.revokeSession(sessionId);
    await this.repo.appendAuditLog({
      actorAdminId: member.adminId,
      actorUsername: member.username,
      actorRole: member.role,
      action: 'ADMIN_LOGOUT',
      targetId: member.adminId,
      result: 'SUCCESS',
      reason: null,
      metadata: {},
    });
  }

  async submitActivationEmail(member: StoredAdminMembership, rawEmail: string): Promise<AdminIdentityDTO> {
    if (member.status === 'DISABLED') {
      throw new AdminDomainError(403, 'Administrator access is disabled.');
    }
    if (member.activationState === 'ACTIVE') {
      throw new AdminDomainError(409, 'Administrator account is already activated.');
    }

    const email = (rawEmail || '').trim().toLowerCase();
    if (!EMAIL_REGEX.test(email)) {
      throw new AdminDomainError(400, 'Provide a valid email address.');
    }

    const existingOwner = await this.repo.findByVerifiedEmail(email);
    if (existingOwner && existingOwner.adminId !== member.adminId) {
      throw new AdminDomainError(409, 'This email is already registered to another administrator.');
    }

    const otpCode = generateNumericOtp(6);
    const opaqueToken = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

    await this.repo.createToken({
      tokenHash: sha256Hex(opaqueToken),
      adminId: member.adminId,
      purpose: 'EMAIL_VERIFY',
      targetEmail: email,
      codeHash: sha256Hex(`${member.adminId}:${email}:${otpCode}`),
      expiresAt,
      consumedAt: null,
      createdAt: new Date().toISOString(),
    });

    await this.mailer.sendVerificationOtp({
      to: email,
      adminId: member.adminId,
      fullName: member.fullName,
      otpCode,
      expiresAt,
    });

    const updated = await this.repo.updateMembership(member.adminId, {
      pendingEmail: email,
      pendingEmailVerified: false,
      activationState: 'PENDING_EMAIL_VERIFICATION',
    });

    await this.repo.appendAuditLog({
      actorAdminId: member.adminId,
      actorUsername: member.username,
      actorRole: member.role,
      action: 'ACTIVATION_EMAIL_SUBMITTED',
      targetId: member.adminId,
      result: 'SUCCESS',
      reason: null,
      metadata: { targetEmail: email },
    });

    return toIdentityDTO(updated);
  }

  async verifyActivationEmail(member: StoredAdminMembership, rawCode: string): Promise<AdminIdentityDTO> {
    if (member.status === 'DISABLED') {
      throw new AdminDomainError(403, 'Administrator access is disabled.');
    }
    if (!member.pendingEmail) {
      throw new AdminDomainError(400, 'Submit an email address first.');
    }

    const code = (rawCode || '').trim();
    if (!code) {
      throw new AdminDomainError(400, 'Verification code is required.');
    }

    const activeToken = await this.repo.findLatestActiveToken(member.adminId, 'EMAIL_VERIFY');
    if (!activeToken || Date.parse(activeToken.expiresAt) <= Date.now() || activeToken.consumedAt) {
      await this.repo.appendAuditLog({
        actorAdminId: member.adminId,
        actorUsername: member.username,
        actorRole: member.role,
        action: 'EMAIL_VERIFICATION_FAILED',
        targetId: member.adminId,
        result: 'FAILED',
        reason: 'Missing or expired verification code',
        metadata: {},
      });
      throw new AdminDomainError(400, 'Verification code has expired or is invalid.');
    }

    const expectedHash = sha256Hex(`${member.adminId}:${activeToken.targetEmail}:${code}`);
    if (activeToken.codeHash !== expectedHash) {
      await this.repo.appendAuditLog({
        actorAdminId: member.adminId,
        actorUsername: member.username,
        actorRole: member.role,
        action: 'EMAIL_VERIFICATION_FAILED',
        targetId: member.adminId,
        result: 'FAILED',
        reason: 'Incorrect verification code',
        metadata: {},
      });
      throw new AdminDomainError(400, 'Invalid verification code.');
    }

    await this.repo.markTokenConsumed(activeToken.tokenHash);

    // Non-owner administrators MUST wait for Ansh (OWNER_ADMIN) approval before permanent password setup.
    // Primary owner Ansh cannot approve himself in advance as nobody else is owner; his verified email advances to password setup.
    const nextState =
      member.activationState === 'ACTIVE'
        ? 'ACTIVE'
        : member.isOwner
          ? 'AWAITING_PASSWORD_SETUP'
          : 'AWAITING_OWNER_APPROVAL';

    const updated = await this.repo.updateMembership(member.adminId, {
      verifiedEmail: member.isOwner && member.activationState !== 'ACTIVE' ? activeToken.targetEmail : member.verifiedEmail,
      pendingEmail: member.isOwner && member.activationState !== 'ACTIVE' ? null : activeToken.targetEmail,
      pendingEmailVerified: !(member.isOwner && member.activationState !== 'ACTIVE'),
      activationState: nextState,
    });

    await this.repo.appendAuditLog({
      actorAdminId: member.adminId,
      actorUsername: member.username,
      actorRole: member.role,
      action: 'EMAIL_OWNERSHIP_VERIFIED',
      targetId: member.adminId,
      result: 'SUCCESS',
      reason: null,
      metadata: {
        email: activeToken.targetEmail,
        nextState,
        autoApprovedOwnerBootstrap: member.isOwner && member.activationState !== 'ACTIVE',
      },
    });

    return toIdentityDTO(updated);
  }

  private async syncToSupabaseAuthOnActivation(
    member: StoredAdminMembership,
    verifiedEmail: string,
    permanentPassword: string
  ): Promise<string | null> {
    if (!this.supabaseAdminClient) return null;

    if (member.supabaseUserId) {
      const { error } = await this.supabaseAdminClient.auth.admin.updateUserById(member.supabaseUserId, {
        email: verifiedEmail,
        password: permanentPassword,
        email_confirm: true,
        user_metadata: {
          admin_id: member.adminId,
          admin_username: member.username,
          full_name: member.fullName,
        },
      });
      if (error) {
        throw new AdminDomainError(500, `Failed to synchronize administrator credentials: ${error.message}`);
      }
      return member.supabaseUserId;
    }

    // Create dedicated Supabase Auth user; never overwrite an unrelated personal SpendSense account password.
    const { data: created, error } = await this.supabaseAdminClient.auth.admin.createUser({
      email: verifiedEmail,
      password: permanentPassword,
      email_confirm: true,
      user_metadata: {
        admin_id: member.adminId,
        admin_username: member.username,
        full_name: member.fullName,
      },
    });

    if (error) {
      if (/already registered|exists/i.test(error.message)) {
        throw new AdminDomainError(
          409,
          'An unrelated SpendSense personal account already uses this email. Register a dedicated administrator email to avoid altering personal accounts.'
        );
      }
      throw new AdminDomainError(500, `Failed to create administrator auth identity: ${error.message}`);
    }

    return created.user?.id || null;
  }

  async completeActivation(
    member: StoredAdminMembership,
    newPassword: string,
    confirmPassword: string
  ): Promise<AdminLoginResponse> {
    if (member.status === 'DISABLED') {
      throw new AdminDomainError(403, 'Administrator access is disabled.');
    }
    if (member.activationState === 'ACTIVE') {
      throw new AdminDomainError(409, 'Administrator account is already activated.');
    }
    if (member.activationState !== 'AWAITING_PASSWORD_SETUP') {
      const msg =
        member.activationState === 'AWAITING_OWNER_APPROVAL'
          ? 'Your verified email is awaiting primary owner approval before password setup.'
          : 'Complete email verification and owner approval before setting your permanent password.';
      throw new AdminDomainError(403, msg);
    }
    if (!member.verifiedEmail) {
      throw new AdminDomainError(400, 'Verified and approved email is required before activation.');
    }
    if (newPassword !== confirmPassword) {
      throw new AdminDomainError(400, 'Password confirmation does not match.');
    }

    const forbiddenHashes = PRE_AUTHORIZED_ADMINS.map((a) => a.tempCredentialHash);
    const policy = validatePermanentPasswordPolicy(newPassword, member.username, member.tempCredentialHash, forbiddenHashes);
    if (!policy.valid) {
      throw new AdminDomainError(400, policy.reason || 'Password does not meet security requirements.');
    }

    const supabaseUserId = await this.syncToSupabaseAuthOnActivation(member, member.verifiedEmail, newPassword);
    const permanentHash = hashPassword(newPassword);
    const nextSessionVersion = member.sessionVersion + 1;

    await this.repo.revokeAdminSessions(member.adminId);

    const updated = await this.repo.updateMembership(member.adminId, {
      status: 'ENABLED',
      activationState: 'ACTIVE',
      tempCredentialHash: null,
      tempCredentialInvalidated: true,
      permanentPasswordHash: permanentHash,
      supabaseUserId,
      sessionVersion: nextSessionVersion,
      lastLoginAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    });

    const sessionToken = await this.createAndPersistSession(updated);

    await this.repo.appendAuditLog({
      actorAdminId: updated.adminId,
      actorUsername: updated.username,
      actorRole: updated.role,
      action: 'ADMIN_ACTIVATION_COMPLETED',
      targetId: updated.adminId,
      result: 'SUCCESS',
      reason: 'Email verified, owner approved, temporary credential permanently invalidated',
      metadata: { role: updated.role },
    });

    return {
      authenticated: true,
      requiresActivation: false,
      identity: toIdentityDTO(updated),
      sessionToken,
    };
  }

  async initiateForgotPassword(rawEmail: string, initiatedByOwner?: StoredAdminMembership): Promise<{ dispatched: boolean }> {
    const email = (rawEmail || '').trim().toLowerCase();
    if (!EMAIL_REGEX.test(email)) {
      throw new AdminDomainError(400, 'Valid email address is required.');
    }

    const target = await this.repo.findByVerifiedEmail(email);
    if (!target || target.activationState !== 'ACTIVE' || target.status !== 'ENABLED') {
      await this.repo.appendAuditLog({
        actorAdminId: initiatedByOwner?.adminId ?? null,
        actorUsername: initiatedByOwner?.username ?? null,
        actorRole: initiatedByOwner?.role ?? 'ANONYMOUS',
        action: 'PASSWORD_RESET_REQUESTED',
        targetId: target?.adminId ?? email,
        result: 'DENIED',
        reason: 'Account missing, inactive, or disabled',
        metadata: {},
      });
      // Do not leak membership enumeration on unauthenticated recovery requests
      if (!initiatedByOwner) return { dispatched: true };
      throw new AdminDomainError(400, 'Target administrator does not have an active verified email.');
    }

    const rawToken = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + RESET_TTL_MS).toISOString();
    const resetBase = process.env.ADMIN_APP_URL || 'http://localhost:3002';
    const resetUrl = `${resetBase.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(rawToken)}`;

    await this.repo.createToken({
      tokenHash: sha256Hex(rawToken),
      adminId: target.adminId,
      purpose: 'PASSWORD_RESET',
      targetEmail: email,
      codeHash: null,
      expiresAt,
      consumedAt: null,
      createdAt: new Date().toISOString(),
    });

    await this.mailer.sendPasswordReset({
      to: email,
      adminId: target.adminId,
      fullName: target.fullName,
      resetToken: rawToken,
      resetUrl,
      expiresAt,
    });

    await this.repo.appendAuditLog({
      actorAdminId: initiatedByOwner?.adminId ?? target.adminId,
      actorUsername: initiatedByOwner?.username ?? target.username,
      actorRole: initiatedByOwner?.role ?? target.role,
      action: initiatedByOwner ? 'OWNER_INITIATED_PASSWORD_RESET' : 'PASSWORD_RESET_REQUESTED',
      targetId: target.adminId,
      result: 'SUCCESS',
      reason: null,
      metadata: { targetEmail: email },
    });

    return { dispatched: true };
  }

  async completePasswordReset(rawToken: string, newPassword: string, confirmPassword: string): Promise<void> {
    const token = (rawToken || '').trim();
    if (!token) throw new AdminDomainError(400, 'Reset token is required.');
    if (newPassword !== confirmPassword) throw new AdminDomainError(400, 'Password confirmation does not match.');

    const tokenRecord = await this.repo.findTokenByHash(sha256Hex(token));
    if (
      !tokenRecord ||
      tokenRecord.purpose !== 'PASSWORD_RESET' ||
      tokenRecord.consumedAt ||
      Date.parse(tokenRecord.expiresAt) <= Date.now()
    ) {
      throw new AdminDomainError(400, 'Password recovery link is invalid or expired.');
    }

    const member = await this.repo.findByAdminId(tokenRecord.adminId);
    if (!member || member.activationState !== 'ACTIVE' || member.status !== 'ENABLED') {
      await this.repo.appendAuditLog({
        actorAdminId: member?.adminId ?? null,
        actorUsername: member?.username ?? null,
        actorRole: member?.role ?? 'ANONYMOUS',
        action: 'PASSWORD_RESET_DENIED',
        targetId: tokenRecord.adminId,
        result: 'DENIED',
        reason: 'Membership is disabled or not active',
        metadata: {},
      });
      throw new AdminDomainError(403, 'Administrator access is disabled or incomplete.');
    }

    const forbiddenHashes = PRE_AUTHORIZED_ADMINS.map((a) => a.tempCredentialHash);
    const policy = validatePermanentPasswordPolicy(newPassword, member.username, member.tempCredentialHash, forbiddenHashes);
    if (!policy.valid) {
      throw new AdminDomainError(400, policy.reason || 'Password does not meet security requirements.');
    }

    if (this.supabaseAdminClient && member.supabaseUserId) {
      const { error } = await this.supabaseAdminClient.auth.admin.updateUserById(member.supabaseUserId, {
        password: newPassword,
      });
      if (error) throw new AdminDomainError(500, `Failed to update auth password: ${error.message}`);
    }

    await this.repo.markTokenConsumed(tokenRecord.tokenHash);
    await this.repo.revokeAdminSessions(member.adminId);
    await this.repo.updateMembership(member.adminId, {
      permanentPasswordHash: hashPassword(newPassword),
      sessionVersion: member.sessionVersion + 1,
    });

    await this.repo.appendAuditLog({
      actorAdminId: member.adminId,
      actorUsername: member.username,
      actorRole: member.role,
      action: 'PASSWORD_RESET_COMPLETED',
      targetId: member.adminId,
      result: 'SUCCESS',
      reason: null,
      metadata: {},
    });
  }

  async changePermanentPassword(
    member: StoredAdminMembership,
    currentPassword: string,
    newPassword: string,
    confirmPassword: string
  ): Promise<string> {
    if (member.activationState !== 'ACTIVE' || !member.permanentPasswordHash) {
      throw new AdminDomainError(403, 'Complete initial activation before changing permanent password.');
    }
    if (!verifyPasswordHash(currentPassword, member.permanentPasswordHash)) {
      await this.repo.appendAuditLog({
        actorAdminId: member.adminId,
        actorUsername: member.username,
        actorRole: member.role,
        action: 'PASSWORD_CHANGE_FAILED',
        targetId: member.adminId,
        result: 'FAILED',
        reason: 'Current password mismatch',
        metadata: {},
      });
      throw new AdminDomainError(401, 'Current password is incorrect.');
    }
    if (newPassword !== confirmPassword) {
      throw new AdminDomainError(400, 'Password confirmation does not match.');
    }
    const forbiddenHashes = PRE_AUTHORIZED_ADMINS.map((a) => a.tempCredentialHash);
    const policy = validatePermanentPasswordPolicy(newPassword, member.username, member.tempCredentialHash, forbiddenHashes);
    if (!policy.valid) {
      throw new AdminDomainError(400, policy.reason || 'Password does not meet requirements.');
    }

    if (this.supabaseAdminClient && member.supabaseUserId) {
      await this.supabaseAdminClient.auth.admin.updateUserById(member.supabaseUserId, { password: newPassword });
    }

    await this.repo.revokeAdminSessions(member.adminId);
    const updated = await this.repo.updateMembership(member.adminId, {
      permanentPasswordHash: hashPassword(newPassword),
      sessionVersion: member.sessionVersion + 1,
    });

    await this.repo.appendAuditLog({
      actorAdminId: member.adminId,
      actorUsername: member.username,
      actorRole: member.role,
      action: 'PASSWORD_CHANGED',
      targetId: member.adminId,
      result: 'SUCCESS',
      reason: null,
      metadata: {},
    });

    return this.createAndPersistSession(updated);
  }

  async requestEmailChange(
    member: StoredAdminMembership,
    currentPassword: string,
    newEmailRaw: string
  ): Promise<AdminIdentityDTO> {
    if (member.activationState !== 'ACTIVE' || !member.permanentPasswordHash) {
      throw new AdminDomainError(403, 'Only activated administrators can request an email change.');
    }
    if (!verifyPasswordHash(currentPassword, member.permanentPasswordHash)) {
      throw new AdminDomainError(401, 'Current password verification failed.');
    }
    const newEmail = (newEmailRaw || '').trim().toLowerCase();
    if (!EMAIL_REGEX.test(newEmail)) {
      throw new AdminDomainError(400, 'Valid email address is required.');
    }
    const existingOwner = await this.repo.findByVerifiedEmail(newEmail);
    if (existingOwner) {
      throw new AdminDomainError(409, 'Email is already registered to an administrator.');
    }

    const otpCode = generateNumericOtp(6);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();
    await this.repo.createToken({
      tokenHash: sha256Hex(generateOpaqueToken()),
      adminId: member.adminId,
      purpose: 'EMAIL_VERIFY',
      targetEmail: newEmail,
      codeHash: sha256Hex(`${member.adminId}:${newEmail}:${otpCode}`),
      expiresAt,
      consumedAt: null,
      createdAt: new Date().toISOString(),
    });
    await this.mailer.sendVerificationOtp({
      to: newEmail,
      adminId: member.adminId,
      fullName: member.fullName,
      otpCode,
      expiresAt,
    });

    const updated = await this.repo.updateMembership(member.adminId, {
      pendingEmail: newEmail,
      pendingEmailVerified: false,
    });

    await this.repo.appendAuditLog({
      actorAdminId: member.adminId,
      actorUsername: member.username,
      actorRole: member.role,
      action: 'EMAIL_CHANGE_REQUESTED',
      targetId: member.adminId,
      result: 'SUCCESS',
      reason: null,
      metadata: { newEmail },
    });

    return toIdentityDTO(updated);
  }

  // =========================================================================
  // OWNER ACCESS MANAGEMENT (Strictly OWNER_ADMIN / Ansh Gupta only)
  // =========================================================================

  private assertOwner(actor: StoredAdminMembership): void {
    if (actor.role !== 'OWNER_ADMIN' || !actor.isOwner || actor.adminId !== OWNER_ADMIN_ID) {
      throw new AdminDomainError(403, 'Only the primary owner (Ansh Gupta) may modify administrator access.');
    }
  }

  async getAccessOverview(actor: StoredAdminMembership): Promise<AdminAccessOverviewResponse> {
    this.assertOwner(actor);
    const [members, logs] = await Promise.all([
      this.repo.listMemberships(),
      this.repo.queryAuditLogs({ page: 1, pageSize: 25 }),
    ]);

    const pendingApprovalsCount = members.filter(
      (m) => m.activationState === 'AWAITING_OWNER_APPROVAL' || (m.activationState === 'ACTIVE' && m.pendingEmail && m.pendingEmailVerified)
    ).length;

    return {
      members: members.map(toAccessMemberDTO),
      pendingApprovalsCount,
      recentAuditLogs: logs.items.map(toAuditLogDTO),
    };
  }

  async disableAdmin(actor: StoredAdminMembership, targetAdminId: string, reason: string): Promise<AdminAccessMemberDTO> {
    this.assertOwner(actor);
    const target = await this.repo.findByAdminId(targetAdminId);
    if (!target) throw new AdminDomainError(404, 'Administrator not found.');

    if (target.isOwner || target.adminId === OWNER_ADMIN_ID || target.adminId === actor.adminId) {
      await this.repo.appendAuditLog({
        actorAdminId: actor.adminId,
        actorUsername: actor.username,
        actorRole: actor.role,
        action: 'OWNER_DISABLE_PROTECTED_BLOCKED',
        targetId: target.adminId,
        result: 'DENIED',
        reason: 'Primary owner cannot be disabled or self-revoked through normal admin management',
        metadata: {},
      });
      throw new AdminDomainError(403, 'The primary owner account is protected and cannot be disabled.');
    }

    const cleanReason = (reason || '').trim();
    if (!cleanReason) throw new AdminDomainError(400, 'Provide a clear reason before disabling an administrator.');

    await this.repo.revokeAdminSessions(target.adminId);
    const updated = await this.repo.updateMembership(target.adminId, {
      status: 'DISABLED',
      sessionVersion: target.sessionVersion + 1,
      disabledAt: new Date().toISOString(),
      disabledReason: cleanReason,
      disabledBy: actor.adminId,
    });

    await this.repo.appendAuditLog({
      actorAdminId: actor.adminId,
      actorUsername: actor.username,
      actorRole: actor.role,
      action: 'ADMIN_ACCESS_DISABLED',
      targetId: target.adminId,
      result: 'SUCCESS',
      reason: cleanReason,
      metadata: { targetUsername: target.username },
    });

    return toAccessMemberDTO(updated);
  }

  async enableAdmin(actor: StoredAdminMembership, targetAdminId: string, reason?: string): Promise<AdminAccessMemberDTO> {
    this.assertOwner(actor);
    const target = await this.repo.findByAdminId(targetAdminId);
    if (!target) throw new AdminDomainError(404, 'Administrator not found.');

    const restoredStatus = target.activationState === 'ACTIVE' ? 'ENABLED' : 'PENDING_ACTIVATION';
    const updated = await this.repo.updateMembership(target.adminId, {
      status: restoredStatus,
      disabledAt: null,
      disabledReason: null,
      disabledBy: null,
      sessionVersion: target.sessionVersion + 1,
    });

    await this.repo.appendAuditLog({
      actorAdminId: actor.adminId,
      actorUsername: actor.username,
      actorRole: actor.role,
      action: 'ADMIN_ACCESS_ENABLED',
      targetId: target.adminId,
      result: 'SUCCESS',
      reason: reason?.trim() || 'Enabled by primary owner',
      metadata: { targetUsername: target.username, restoredStatus },
    });

    return toAccessMemberDTO(updated);
  }

  async changeAdminRole(
    actor: StoredAdminMembership,
    targetAdminId: string,
    newRole: AdminRole,
    reason?: string
  ): Promise<AdminAccessMemberDTO> {
    this.assertOwner(actor);
    const target = await this.repo.findByAdminId(targetAdminId);
    if (!target) throw new AdminDomainError(404, 'Administrator not found.');

    if (target.isOwner || target.adminId === OWNER_ADMIN_ID) {
      throw new AdminDomainError(403, 'Primary owner role cannot be modified through normal role assignment.');
    }
    if (newRole === 'OWNER_ADMIN') {
      throw new AdminDomainError(403, 'Only one initial OWNER_ADMIN may exist; use SUPPORT_ADMIN or OPERATIONS_ADMIN.');
    }
    if (newRole !== 'SUPPORT_ADMIN' && newRole !== 'OPERATIONS_ADMIN') {
      throw new AdminDomainError(400, 'Invalid administrative role requested.');
    }

    const previousRole = target.role;
    const updated = await this.repo.updateMembership(target.adminId, {
      role: newRole,
      sessionVersion: target.sessionVersion + 1,
    });

    await this.repo.appendAuditLog({
      actorAdminId: actor.adminId,
      actorUsername: actor.username,
      actorRole: actor.role,
      action: 'ADMIN_ROLE_CHANGED',
      targetId: target.adminId,
      result: 'SUCCESS',
      reason: reason?.trim() || `Role changed from ${previousRole} to ${newRole}`,
      metadata: { previousRole, newRole, targetUsername: target.username },
    });

    return toAccessMemberDTO(updated);
  }

  async processEmailApproval(
    actor: StoredAdminMembership,
    targetAdminId: string,
    decision: 'approve' | 'reject',
    reason?: string
  ): Promise<AdminAccessMemberDTO> {
    this.assertOwner(actor);
    const target = await this.repo.findByAdminId(targetAdminId);
    if (!target) throw new AdminDomainError(404, 'Administrator not found.');

    if (!target.pendingEmail || !target.pendingEmailVerified) {
      throw new AdminDomainError(400, 'This administrator does not have a verified pending email awaiting approval.');
    }

    if (decision === 'approve') {
      const nextActivationState = target.activationState === 'AWAITING_OWNER_APPROVAL' ? 'AWAITING_PASSWORD_SETUP' : target.activationState;
      const approvedEmail = target.pendingEmail;
      const updated = await this.repo.updateMembership(target.adminId, {
        verifiedEmail: approvedEmail,
        pendingEmail: null,
        pendingEmailVerified: false,
        activationState: nextActivationState,
        status: target.status === 'DISABLED' ? 'DISABLED' : nextActivationState === 'ACTIVE' ? 'ENABLED' : 'PENDING_ACTIVATION',
      });

      await this.repo.appendAuditLog({
        actorAdminId: actor.adminId,
        actorUsername: actor.username,
        actorRole: actor.role,
        action: 'ADMIN_EMAIL_APPROVED',
        targetId: target.adminId,
        result: 'SUCCESS',
        reason: reason?.trim() || 'Email association approved by owner',
        metadata: { approvedEmail, targetUsername: target.username },
      });
      return toAccessMemberDTO(updated);
    }

    const rejectedEmail = target.pendingEmail;
    const fallbackState = target.activationState === 'ACTIVE' ? 'ACTIVE' : 'PENDING_EMAIL';
    const updated = await this.repo.updateMembership(target.adminId, {
      pendingEmail: null,
      pendingEmailVerified: false,
      activationState: fallbackState,
    });

    await this.repo.appendAuditLog({
      actorAdminId: actor.adminId,
      actorUsername: actor.username,
      actorRole: actor.role,
      action: 'ADMIN_EMAIL_REJECTED',
      targetId: target.adminId,
      result: 'SUCCESS',
      reason: reason?.trim() || 'Email association rejected by owner',
      metadata: { rejectedEmail, targetUsername: target.username },
    });
    return toAccessMemberDTO(updated);
  }

  async ownerInitiateReset(actor: StoredAdminMembership, targetAdminId: string): Promise<{ dispatched: boolean }> {
    this.assertOwner(actor);
    const target = await this.repo.findByAdminId(targetAdminId);
    if (!target) throw new AdminDomainError(404, 'Administrator not found.');
    if (!target.verifiedEmail || target.activationState !== 'ACTIVE') {
      throw new AdminDomainError(400, 'Administrator must be active with a verified email before initiating password recovery.');
    }
    return this.initiateForgotPassword(target.verifiedEmail, actor);
  }

  async getAdminActivity(actor: StoredAdminMembership, targetAdminId: string): Promise<AdminAuditLogDTO[]> {
    this.assertOwner(actor);
    const logs = await this.repo.queryAuditLogs({ page: 1, pageSize: 50, targetId: targetAdminId });
    return logs.items.map(toAuditLogDTO);
  }

  // =========================================================================
  // OPERATIONAL PORTAL READ MODULES (Zero Private Financial Data)
  // =========================================================================

  async getOverview(): Promise<AdminOverviewDTO> {
    const [op, release, api, audit] = await Promise.all([
      this.repo.getOperationalSnapshot(),
      fetchReadOnlyReleaseMonitor(),
      Promise.resolve(getApiTelemetrySummary()),
      this.repo.queryAuditLogs({ page: 1, pageSize: 10 }),
    ]);

    const incidents = audit.items
      .filter((i) => i.result !== 'SUCCESS')
      .slice(0, 5)
      .map((i) => ({
        id: i.id,
        severity: (i.result === 'DENIED' ? 'warning' : 'error') as 'warning' | 'error',
        service: 'admin-auth',
        message: `${i.action}: ${i.reason || i.result}`,
        timestamp: i.createdAt,
      }));

    return {
      generatedAt: new Date().toISOString(),
      dataSource: op.dataSource,
      users: {
        registeredUsers: op.registeredUsers,
        activeUsersLast30Days: op.activeUsersLast30Days,
        dailyActiveUsers: op.dailyActiveUsers,
        webUsersCount: op.webUsersCount,
        androidUsersCount: op.androidUsersCount,
        availabilityNote: op.databaseNote,
      },
      backend: {
        status: api.errorRatePercent > 5 ? 'degraded' : 'ok',
        uptimeSeconds: api.uptimeSeconds,
        apiErrorRatePercent: api.errorRatePercent,
        p95ResponseMs: api.p95ResponseMs,
      },
      capture: {
        totalEventsLast24h: op.captureTotals.captureEvents,
        candidatesGenerated: op.captureTotals.candidatesGenerated,
        acceptedCandidates: op.captureTotals.acceptedCandidates,
        rejectedCandidates: op.captureTotals.rejectedCandidates,
      },
      sync: {
        pendingQueueCount: op.pendingSyncCount,
        failedSyncCount: op.failedSyncCount,
        lastSuccessfulSyncAt: op.lastSuccessfulSyncAt,
      },
      versions: {
        webAppVersion: release.webVersion,
        pwaBuildId: release.pwaVersion,
        androidStandardVersion: release.androidStandard.published ? release.androidStandard.version : 'Not published locally',
        androidDirectSmsVersion: release.androidDirectSms.published ? release.androidStandard.version : 'Not published locally',
      },
      recentIncidents: incidents,
    };
  }

  async getUsersDiagnostics(params: { search?: string; page: number; pageSize: number }): Promise<AdminUsersResponse> {
    const op = await this.repo.getOperationalSnapshot();
    let list = op.usersDirectory;
    if (params.search) {
      const q = params.search.trim().toLowerCase();
      list = list.filter(
        (u) =>
          u.userId.toLowerCase().includes(q) ||
          (u.email || '').toLowerCase().includes(q) ||
          (u.username || '').toLowerCase().includes(q)
      );
    }
    const start = (params.page - 1) * params.pageSize;
    return {
      items: list.slice(start, start + params.pageSize),
      totalCount: list.length,
      page: params.page,
      pageSize: params.pageSize,
      dataSource: op.dataSource,
      privacyNotice:
        'Diagnostics expose account status and sync/auth metadata only. Transactions, balances, documents, and SMS/notification contents are never accessible.',
    };
  }

  async getCaptureTelemetry(): Promise<AdminCaptureTelemetryDTO> {
    const op = await this.repo.getOperationalSnapshot();
    return {
      generatedAt: new Date().toISOString(),
      dataSource: op.dataSource,
      totals: op.captureTotals,
      byChannel: [
        {
          channel: 'android_notification',
          label: 'Android Notification Listener (Bank & UPI)',
          permissionGrantedUsers: null,
          successfulCaptureUsers: null,
          eventsCount: 0,
          failuresCount: 0,
        },
        {
          channel: 'android_direct_sms',
          label: 'Android Direct Inbox SMS (Direct Variant)',
          permissionGrantedUsers: null,
          successfulCaptureUsers: null,
          eventsCount: 0,
          failuresCount: 0,
        },
        {
          channel: 'android_share_sheet',
          label: 'Android Share Sheet (ACTION_SEND)',
          permissionGrantedUsers: null,
          successfulCaptureUsers: null,
          eventsCount: 0,
          failuresCount: 0,
        },
        {
          channel: 'statement_import',
          label: 'Bank Statement Import (CSV / PDF / OCR)',
          permissionGrantedUsers: null,
          successfulCaptureUsers: null,
          eventsCount: 0,
          failuresCount: 0,
        },
      ],
      parserVersions: [{ version: 'sms_classifier_v1', eventsCount: op.captureTotals.captureEvents }],
      androidAppVersions: [{ version: '1.4.0', activeInstallations: op.androidUsersCount ?? 0 }],
      supportedSourceCategories: [
        { category: 'Default Messages App (SMS Notification)', packagesCount: 2, status: 'supported' },
        { category: 'UPI & Payment Apps (GPay, PhonePe, Paytm, CRED, BHIM, Amazon Pay)', packagesCount: 6, status: 'supported' },
        { category: 'Banking Apps (HDFC, SBI YONO, ICICI, Axis, Kotak, IDFC)', packagesCount: 6, status: 'conditional' },
      ],
      privacyNotice:
        'Only aggregated counters and parser versions are shown. Raw SMS/notification text, amounts, and merchant names never leave devices unreviewed.',
    };
  }

  async getSystemHealth(): Promise<AdminSystemHealthDTO> {
    const [op, api] = await Promise.all([this.repo.getOperationalSnapshot(), Promise.resolve(getApiTelemetrySummary())]);
    return {
      generatedAt: new Date().toISOString(),
      dataSource: op.dataSource,
      backend: {
        available: true,
        uptimeSeconds: api.uptimeSeconds,
        avgResponseMs: api.avgResponseMs,
        p95ResponseMs: api.p95ResponseMs,
        errorRatePercent: api.errorRatePercent,
      },
      database: {
        status: op.databaseConnected ? 'connected' : this.config.supabaseUrl ? 'degraded' : 'unconfigured',
        latencyMs: op.databaseLatencyMs,
        note: op.databaseNote,
      },
      sync: {
        failedSyncCount: op.failedSyncCount,
        pendingSyncCount: op.pendingSyncCount,
        authErrorsLast24h: api.authErrorsLast24h,
      },
      lastSuccessfulHealthCheckAt: new Date().toISOString(),
    };
  }

  async getReleases(): Promise<AdminReleaseMonitorDTO> {
    return fetchReadOnlyReleaseMonitor();
  }

  async getAuditLogs(
    actor: StoredAdminMembership,
    params: { page: number; pageSize: number; action?: string; result?: AdminAuditResult }
  ): Promise<{ items: AdminAuditLogDTO[]; totalCount: number; page: number; pageSize: number }> {
    this.assertOwner(actor);
    const res = await this.repo.queryAuditLogs({
      page: params.page,
      pageSize: params.pageSize,
      action: params.action,
      result: params.result,
    });
    return {
      items: res.items.map(toAuditLogDTO),
      totalCount: res.totalCount,
      page: params.page,
      pageSize: params.pageSize,
    };
  }
}
