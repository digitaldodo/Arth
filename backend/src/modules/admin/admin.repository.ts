import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  AdminActivationState,
  AdminAuditResult,
  AdminMembershipStatus,
  AdminRole,
  AdminUserDiagnosticDTO,
} from '@arth/contracts';
import type { AppConfig } from '../../config/index.js';
import { PRE_AUTHORIZED_ADMINS } from './admin.provisioning.js';

export interface StoredAdminMembership {
  adminId: string;
  fullName: string;
  username: string;
  role: AdminRole;
  isOwner: boolean;
  status: AdminMembershipStatus;
  activationState: AdminActivationState;
  supabaseUserId: string | null;
  verifiedEmail: string | null;
  pendingEmail: string | null;
  pendingEmailVerified: boolean;
  tempCredentialHash: string | null;
  tempCredentialInvalidated: boolean;
  permanentPasswordHash: string | null;
  sessionVersion: number;
  lastLoginAt: string | null;
  lastSeenAt: string | null;
  disabledAt: string | null;
  disabledReason: string | null;
  disabledBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StoredAdminSession {
  sessionId: string;
  adminId: string;
  sessionVersion: number;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

export interface StoredAdminToken {
  tokenHash: string;
  adminId: string;
  purpose: 'EMAIL_VERIFY' | 'PASSWORD_RESET';
  targetEmail: string;
  codeHash: string | null;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
}

export interface StoredAdminAuditLog {
  id: string;
  actorAdminId: string | null;
  actorUsername: string | null;
  actorRole: AdminRole | 'SYSTEM' | 'ANONYMOUS' | null;
  action: string;
  targetId: string | null;
  result: AdminAuditResult;
  reason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface OperationalStatsSnapshot {
  dataSource: 'supabase' | 'local_dev_store';
  registeredUsers: number | null;
  activeUsersLast30Days: number | null;
  dailyActiveUsers: number | null;
  webUsersCount: number | null;
  androidUsersCount: number | null;
  pendingSyncCount: number | null;
  failedSyncCount: number | null;
  lastSuccessfulSyncAt: string | null;
  databaseConnected: boolean;
  databaseLatencyMs: number | null;
  databaseNote: string;
  captureTotals: {
    captureEvents: number;
    candidatesGenerated: number;
    acceptedCandidates: number;
    rejectedCandidates: number;
    duplicateDetections: number;
    parserFailures: number;
    processingFailures: number;
  };
  usersDirectory: AdminUserDiagnosticDTO[];
}

export interface IAdminRepository {
  readonly mode: 'supabase' | 'local_dev_store';
  ensureProvisioned(): Promise<void>;
  listMemberships(): Promise<StoredAdminMembership[]>;
  findByAdminId(adminId: string): Promise<StoredAdminMembership | null>;
  findByUsername(username: string): Promise<StoredAdminMembership | null>;
  findByVerifiedEmail(email: string): Promise<StoredAdminMembership | null>;
  updateMembership(adminId: string, patch: Partial<StoredAdminMembership>): Promise<StoredAdminMembership>;

  createSession(session: StoredAdminSession): Promise<void>;
  findSession(sessionId: string): Promise<StoredAdminSession | null>;
  revokeAdminSessions(adminId: string): Promise<void>;
  revokeSession(sessionId: string): Promise<void>;

  createToken(token: StoredAdminToken): Promise<void>;
  findTokenByHash(tokenHash: string): Promise<StoredAdminToken | null>;
  findLatestActiveToken(adminId: string, purpose: 'EMAIL_VERIFY' | 'PASSWORD_RESET'): Promise<StoredAdminToken | null>;
  markTokenConsumed(tokenHash: string): Promise<void>;

  appendAuditLog(entry: Omit<StoredAdminAuditLog, 'id' | 'createdAt'>): Promise<StoredAdminAuditLog>;
  queryAuditLogs(params: {
    page: number;
    pageSize: number;
    action?: string;
    targetId?: string;
    result?: AdminAuditResult;
  }): Promise<{ items: StoredAdminAuditLog[]; totalCount: number }>;

  getOperationalSnapshot(): Promise<OperationalStatsSnapshot>;
}

interface LocalStoreSerialized {
  memberships: StoredAdminMembership[];
  sessions: StoredAdminSession[];
  tokens: StoredAdminToken[];
  auditLogs: StoredAdminAuditLog[];
}

export class LocalAdminRepository implements IAdminRepository {
  readonly mode = 'local_dev_store' as const;
  private memberships = new Map<string, StoredAdminMembership>();
  private sessions = new Map<string, StoredAdminSession>();
  private tokens = new Map<string, StoredAdminToken>();
  private auditLogs: StoredAdminAuditLog[] = [];
  private loaded = false;

  /** Synthetic non-financial directory only used when Supabase service_role is absent locally. */
  private readonly devSyntheticUsers: AdminUserDiagnosticDTO[] = [
    {
      userId: 'usr-local-demo-01',
      maskedIdentifier: 'usr-…01',
      email: 'demo.web@spendsense.local',
      username: 'demo_web',
      createdAt: '2026-10-12T08:30:00.000Z',
      accountStatus: 'active',
      platform: 'pwa',
      appVersion: 'web-2026.11',
      lastSeenAt: '2026-11-27T04:15:00.000Z',
      authDiagnostics: { provider: 'email', emailConfirmed: true, lastSignInError: null },
      syncHealth: { status: 'healthy', pendingMutations: 0, lastSyncedAt: '2026-11-27T04:15:00.000Z' },
    },
    {
      userId: 'usr-local-demo-02',
      maskedIdentifier: 'usr-…02',
      email: 'demo.android@spendsense.local',
      username: 'demo_android',
      createdAt: '2026-10-20T11:45:00.000Z',
      accountStatus: 'active',
      platform: 'android',
      appVersion: '1.4.0+build.6',
      lastSeenAt: '2026-11-27T03:50:00.000Z',
      authDiagnostics: { provider: 'google', emailConfirmed: true, lastSignInError: null },
      syncHealth: { status: 'healthy', pendingMutations: 0, lastSyncedAt: '2026-11-27T03:50:00.000Z' },
    },
  ];

  constructor(private readonly persistFilePath?: string | null) {}

  private buildInitialMemberships(): StoredAdminMembership[] {
    const now = new Date().toISOString();
    return PRE_AUTHORIZED_ADMINS.map((def) => ({
      adminId: def.adminId,
      fullName: def.fullName,
      username: def.username,
      role: def.initialRole,
      isOwner: def.isOwner,
      status: 'PENDING_ACTIVATION',
      activationState: 'PENDING_EMAIL',
      supabaseUserId: null,
      verifiedEmail: null,
      pendingEmail: null,
      pendingEmailVerified: false,
      tempCredentialHash: def.tempCredentialHash,
      tempCredentialInvalidated: false,
      permanentPasswordHash: null,
      sessionVersion: 1,
      lastLoginAt: null,
      lastSeenAt: null,
      disabledAt: null,
      disabledReason: null,
      disabledBy: null,
      createdAt: now,
      updatedAt: now,
    }));
  }

  private async loadIfNeeded(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;

    if (this.persistFilePath) {
      try {
        const raw = await fs.readFile(this.persistFilePath, 'utf8');
        const parsed = JSON.parse(raw) as LocalStoreSerialized;
        if (Array.isArray(parsed.memberships) && parsed.memberships.length > 0) {
          for (const m of parsed.memberships) this.memberships.set(m.adminId, m);
          for (const s of parsed.sessions || []) this.sessions.set(s.sessionId, s);
          for (const t of parsed.tokens || []) this.tokens.set(t.tokenHash, t);
          this.auditLogs = Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [];
        }
      } catch {
        // Fresh state file
      }
    }

    for (const seed of this.buildInitialMemberships()) {
      if (!this.memberships.has(seed.adminId)) {
        this.memberships.set(seed.adminId, seed);
      }
    }
    await this.flush();
  }

  private async flush(): Promise<void> {
    if (!this.persistFilePath) return;
    const payload: LocalStoreSerialized = {
      memberships: Array.from(this.memberships.values()),
      sessions: Array.from(this.sessions.values()),
      tokens: Array.from(this.tokens.values()),
      auditLogs: this.auditLogs.slice(0, 1000),
    };
    await fs.mkdir(path.dirname(this.persistFilePath), { recursive: true });
    const tmp = `${this.persistFilePath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(payload, null, 2), 'utf8');
    await fs.rename(tmp, this.persistFilePath);
  }

  async ensureProvisioned(): Promise<void> {
    await this.loadIfNeeded();
  }

  async listMemberships(): Promise<StoredAdminMembership[]> {
    await this.loadIfNeeded();
    return Array.from(this.memberships.values()).map((m) => ({ ...m }));
  }

  async findByAdminId(adminId: string): Promise<StoredAdminMembership | null> {
    await this.loadIfNeeded();
    const rec = this.memberships.get(adminId);
    return rec ? { ...rec } : null;
  }

  async findByUsername(username: string): Promise<StoredAdminMembership | null> {
    await this.loadIfNeeded();
    const target = username.trim().toLowerCase();
    for (const rec of this.memberships.values()) {
      if (rec.username.toLowerCase() === target) return { ...rec };
    }
    return null;
  }

  async findByVerifiedEmail(email: string): Promise<StoredAdminMembership | null> {
    await this.loadIfNeeded();
    const target = email.trim().toLowerCase();
    for (const rec of this.memberships.values()) {
      if (rec.verifiedEmail && rec.verifiedEmail.toLowerCase() === target) return { ...rec };
    }
    return null;
  }

  async updateMembership(adminId: string, patch: Partial<StoredAdminMembership>): Promise<StoredAdminMembership> {
    await this.loadIfNeeded();
    const existing = this.memberships.get(adminId);
    if (!existing) throw new Error(`Admin membership not found: ${adminId}`);
    const updated: StoredAdminMembership = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.memberships.set(adminId, updated);
    await this.flush();
    return { ...updated };
  }

  async createSession(session: StoredAdminSession): Promise<void> {
    await this.loadIfNeeded();
    this.sessions.set(session.sessionId, { ...session });
    await this.flush();
  }

  async findSession(sessionId: string): Promise<StoredAdminSession | null> {
    await this.loadIfNeeded();
    const s = this.sessions.get(sessionId);
    return s ? { ...s } : null;
  }

  async revokeAdminSessions(adminId: string): Promise<void> {
    await this.loadIfNeeded();
    const now = new Date().toISOString();
    for (const [id, s] of this.sessions.entries()) {
      if (s.adminId === adminId && !s.revokedAt) {
        this.sessions.set(id, { ...s, revokedAt: now });
      }
    }
    await this.flush();
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.loadIfNeeded();
    const s = this.sessions.get(sessionId);
    if (s && !s.revokedAt) {
      this.sessions.set(sessionId, { ...s, revokedAt: new Date().toISOString() });
      await this.flush();
    }
  }

  async createToken(token: StoredAdminToken): Promise<void> {
    await this.loadIfNeeded();
    this.tokens.set(token.tokenHash, { ...token });
    await this.flush();
  }

  async findTokenByHash(tokenHash: string): Promise<StoredAdminToken | null> {
    await this.loadIfNeeded();
    const t = this.tokens.get(tokenHash);
    return t ? { ...t } : null;
  }

  async findLatestActiveToken(
    adminId: string,
    purpose: 'EMAIL_VERIFY' | 'PASSWORD_RESET'
  ): Promise<StoredAdminToken | null> {
    await this.loadIfNeeded();
    const now = Date.now();
    const candidates = Array.from(this.tokens.values())
      .filter(
        (t) =>
          t.adminId === adminId &&
          t.purpose === purpose &&
          !t.consumedAt &&
          Date.parse(t.expiresAt) > now
      )
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return candidates[0] ? { ...candidates[0] } : null;
  }

  async markTokenConsumed(tokenHash: string): Promise<void> {
    await this.loadIfNeeded();
    const existing = this.tokens.get(tokenHash);
    if (existing) {
      this.tokens.set(tokenHash, { ...existing, consumedAt: new Date().toISOString() });
      await this.flush();
    }
  }

  async appendAuditLog(entry: Omit<StoredAdminAuditLog, 'id' | 'createdAt'>): Promise<StoredAdminAuditLog> {
    await this.loadIfNeeded();
    const record: StoredAdminAuditLog = {
      ...entry,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.auditLogs.unshift(record);
    await this.flush();
    return { ...record };
  }

  async queryAuditLogs(params: {
    page: number;
    pageSize: number;
    action?: string;
    targetId?: string;
    result?: AdminAuditResult;
  }): Promise<{ items: StoredAdminAuditLog[]; totalCount: number }> {
    await this.loadIfNeeded();
    let list = this.auditLogs;
    if (params.action) {
      const a = params.action.trim().toLowerCase();
      list = list.filter((x) => x.action.toLowerCase().includes(a));
    }
    if (params.targetId) {
      const tid = params.targetId.trim().toLowerCase();
      list = list.filter((x) => (x.targetId || '').toLowerCase() === tid);
    }
    if (params.result) {
      list = list.filter((x) => x.result === params.result);
    }
    const start = (params.page - 1) * params.pageSize;
    return {
      items: list.slice(start, start + params.pageSize).map((x) => ({ ...x })),
      totalCount: list.length,
    };
  }

  async getOperationalSnapshot(): Promise<OperationalStatsSnapshot> {
    await this.loadIfNeeded();
    return {
      dataSource: 'local_dev_store',
      registeredUsers: this.devSyntheticUsers.length,
      activeUsersLast30Days: this.devSyntheticUsers.length,
      dailyActiveUsers: this.devSyntheticUsers.length,
      webUsersCount: 1,
      androidUsersCount: 1,
      pendingSyncCount: 0,
      failedSyncCount: 0,
      lastSuccessfulSyncAt: null,
      databaseConnected: false,
      databaseLatencyMs: null,
      databaseNote: 'Running in local development mode (SUPABASE_SERVICE_ROLE_KEY not configured). Displaying local dev diagnostics only.',
      captureTotals: {
        captureEvents: 0,
        candidatesGenerated: 0,
        acceptedCandidates: 0,
        rejectedCandidates: 0,
        duplicateDetections: 0,
        parserFailures: 0,
        processingFailures: 0,
      },
      usersDirectory: this.devSyntheticUsers,
    };
  }
}

/**
 * Production Supabase implementation using service_role strictly on the server.
 * Only queries admin/operational tables, profiles metadata, and outbox aggregates.
 * Never reads private financial records (transactions, balances, people debts, documents, or SMS).
 */
export class SupabaseAdminRepository implements IAdminRepository {
  readonly mode = 'supabase' as const;
  private readonly client: SupabaseClient;

  constructor(supabaseUrl: string, serviceRoleKey: string) {
    this.client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  async ensureProvisioned(): Promise<void> {
    const { data } = await this.client.from('admin_memberships').select('admin_id');
    const existingIds = new Set((data || []).map((r: { admin_id: string }) => r.admin_id));
    const missing = PRE_AUTHORIZED_ADMINS.filter((d) => !existingIds.has(d.adminId)).map((d) => ({
      admin_id: d.adminId,
      full_name: d.fullName,
      username: d.username,
      role: d.initialRole,
      is_owner: d.isOwner,
      status: 'PENDING_ACTIVATION',
      activation_state: 'PENDING_EMAIL',
      temp_credential_hash: d.tempCredentialHash,
      temp_credential_invalidated: false,
      session_version: 1,
    }));
    if (missing.length > 0) {
      await this.client.from('admin_memberships').insert(missing);
    }
  }

  private mapMembership(row: Record<string, unknown>): StoredAdminMembership {
    return {
      adminId: String(row.admin_id),
      fullName: String(row.full_name),
      username: String(row.username),
      role: row.role as AdminRole,
      isOwner: Boolean(row.is_owner),
      status: row.status as AdminMembershipStatus,
      activationState: row.activation_state as AdminActivationState,
      supabaseUserId: (row.supabase_user_id as string | null) ?? null,
      verifiedEmail: (row.verified_email as string | null) ?? null,
      pendingEmail: (row.pending_email as string | null) ?? null,
      pendingEmailVerified: Boolean(row.pending_email_verified),
      tempCredentialHash: (row.temp_credential_hash as string | null) ?? null,
      tempCredentialInvalidated: Boolean(row.temp_credential_invalidated),
      permanentPasswordHash: (row.permanent_password_hash as string | null) ?? null,
      sessionVersion: Number(row.session_version || 1),
      lastLoginAt: (row.last_login_at as string | null) ?? null,
      lastSeenAt: (row.last_seen_at as string | null) ?? null,
      disabledAt: (row.disabled_at as string | null) ?? null,
      disabledReason: (row.disabled_reason as string | null) ?? null,
      disabledBy: (row.disabled_by as string | null) ?? null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  async listMemberships(): Promise<StoredAdminMembership[]> {
    await this.ensureProvisioned();
    const { data, error } = await this.client.from('admin_memberships').select('*').order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    return (data || []).map((r) => this.mapMembership(r as Record<string, unknown>));
  }

  async findByAdminId(adminId: string): Promise<StoredAdminMembership | null> {
    await this.ensureProvisioned();
    const { data, error } = await this.client.from('admin_memberships').select('*').eq('admin_id', adminId).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.mapMembership(data as Record<string, unknown>) : null;
  }

  async findByUsername(username: string): Promise<StoredAdminMembership | null> {
    await this.ensureProvisioned();
    const { data, error } = await this.client.from('admin_memberships').select('*').ilike('username', username.trim()).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.mapMembership(data as Record<string, unknown>) : null;
  }

  async findByVerifiedEmail(email: string): Promise<StoredAdminMembership | null> {
    await this.ensureProvisioned();
    const { data, error } = await this.client.from('admin_memberships').select('*').ilike('verified_email', email.trim()).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.mapMembership(data as Record<string, unknown>) : null;
  }

  async updateMembership(adminId: string, patch: Partial<StoredAdminMembership>): Promise<StoredAdminMembership> {
    const dbPatch: Record<string, unknown> = {};
    if (patch.role !== undefined) dbPatch.role = patch.role;
    if (patch.status !== undefined) dbPatch.status = patch.status;
    if (patch.activationState !== undefined) dbPatch.activation_state = patch.activationState;
    if (patch.supabaseUserId !== undefined) dbPatch.supabase_user_id = patch.supabaseUserId;
    if (patch.verifiedEmail !== undefined) dbPatch.verified_email = patch.verifiedEmail;
    if (patch.pendingEmail !== undefined) dbPatch.pending_email = patch.pendingEmail;
    if (patch.pendingEmailVerified !== undefined) dbPatch.pending_email_verified = patch.pendingEmailVerified;
    if (patch.tempCredentialHash !== undefined) dbPatch.temp_credential_hash = patch.tempCredentialHash;
    if (patch.tempCredentialInvalidated !== undefined) dbPatch.temp_credential_invalidated = patch.tempCredentialInvalidated;
    if (patch.permanentPasswordHash !== undefined) dbPatch.permanent_password_hash = patch.permanentPasswordHash;
    if (patch.sessionVersion !== undefined) dbPatch.session_version = patch.sessionVersion;
    if (patch.lastLoginAt !== undefined) dbPatch.last_login_at = patch.lastLoginAt;
    if (patch.lastSeenAt !== undefined) dbPatch.last_seen_at = patch.lastSeenAt;
    if (patch.disabledAt !== undefined) dbPatch.disabled_at = patch.disabledAt;
    if (patch.disabledReason !== undefined) dbPatch.disabled_reason = patch.disabledReason;
    if (patch.disabledBy !== undefined) dbPatch.disabled_by = patch.disabledBy;

    const { data, error } = await this.client
      .from('admin_memberships')
      .update(dbPatch)
      .eq('admin_id', adminId)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return this.mapMembership(data as Record<string, unknown>);
  }

  async createSession(session: StoredAdminSession): Promise<void> {
    const { error } = await this.client.from('admin_sessions').insert({
      session_id: session.sessionId,
      admin_id: session.adminId,
      session_version: session.sessionVersion,
      expires_at: session.expiresAt,
      revoked_at: session.revokedAt,
    });
    if (error) throw new Error(error.message);
  }

  async findSession(sessionId: string): Promise<StoredAdminSession | null> {
    const { data, error } = await this.client.from('admin_sessions').select('*').eq('session_id', sessionId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return {
      sessionId: String(data.session_id),
      adminId: String(data.admin_id),
      sessionVersion: Number(data.session_version),
      expiresAt: String(data.expires_at),
      revokedAt: (data.revoked_at as string | null) ?? null,
      createdAt: String(data.created_at),
    };
  }

  async revokeAdminSessions(adminId: string): Promise<void> {
    const { error } = await this.client
      .from('admin_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('admin_id', adminId)
      .is('revoked_at', null);
    if (error) throw new Error(error.message);
  }

  async revokeSession(sessionId: string): Promise<void> {
    const { error } = await this.client
      .from('admin_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('session_id', sessionId)
      .is('revoked_at', null);
    if (error) throw new Error(error.message);
  }

  async createToken(token: StoredAdminToken): Promise<void> {
    const { error } = await this.client.from('admin_tokens').insert({
      token_hash: token.tokenHash,
      admin_id: token.adminId,
      purpose: token.purpose,
      target_email: token.targetEmail,
      code_hash: token.codeHash,
      expires_at: token.expiresAt,
      consumed_at: token.consumedAt,
    });
    if (error) throw new Error(error.message);
  }

  async findTokenByHash(tokenHash: string): Promise<StoredAdminToken | null> {
    const { data, error } = await this.client.from('admin_tokens').select('*').eq('token_hash', tokenHash).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return {
      tokenHash: String(data.token_hash),
      adminId: String(data.admin_id),
      purpose: data.purpose as 'EMAIL_VERIFY' | 'PASSWORD_RESET',
      targetEmail: String(data.target_email),
      codeHash: (data.code_hash as string | null) ?? null,
      expiresAt: String(data.expires_at),
      consumedAt: (data.consumed_at as string | null) ?? null,
      createdAt: String(data.created_at),
    };
  }

  async findLatestActiveToken(adminId: string, purpose: 'EMAIL_VERIFY' | 'PASSWORD_RESET'): Promise<StoredAdminToken | null> {
    const { data, error } = await this.client
      .from('admin_tokens')
      .select('*')
      .eq('admin_id', adminId)
      .eq('purpose', purpose)
      .is('consumed_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return {
      tokenHash: String(data.token_hash),
      adminId: String(data.admin_id),
      purpose: data.purpose as 'EMAIL_VERIFY' | 'PASSWORD_RESET',
      targetEmail: String(data.target_email),
      codeHash: (data.code_hash as string | null) ?? null,
      expiresAt: String(data.expires_at),
      consumedAt: (data.consumed_at as string | null) ?? null,
      createdAt: String(data.created_at),
    };
  }

  async markTokenConsumed(tokenHash: string): Promise<void> {
    const { error } = await this.client
      .from('admin_tokens')
      .update({ consumed_at: new Date().toISOString() })
      .eq('token_hash', tokenHash);
    if (error) throw new Error(error.message);
  }

  async appendAuditLog(entry: Omit<StoredAdminAuditLog, 'id' | 'createdAt'>): Promise<StoredAdminAuditLog> {
    const { data, error } = await this.client
      .from('admin_audit_logs')
      .insert({
        actor_admin_id: entry.actorAdminId,
        actor_username: entry.actorUsername,
        actor_role: entry.actorRole,
        action: entry.action,
        target_id: entry.targetId,
        result: entry.result,
        reason: entry.reason,
        metadata: entry.metadata,
      })
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return {
      id: String(data.id),
      actorAdminId: (data.actor_admin_id as string | null) ?? null,
      actorUsername: (data.actor_username as string | null) ?? null,
      actorRole: (data.actor_role as StoredAdminAuditLog['actorRole']) ?? null,
      action: String(data.action),
      targetId: (data.target_id as string | null) ?? null,
      result: data.result as AdminAuditResult,
      reason: (data.reason as string | null) ?? null,
      metadata: (data.metadata as Record<string, unknown>) || {},
      createdAt: String(data.created_at),
    };
  }

  async queryAuditLogs(params: {
    page: number;
    pageSize: number;
    action?: string;
    targetId?: string;
    result?: AdminAuditResult;
  }): Promise<{ items: StoredAdminAuditLog[]; totalCount: number }> {
    let q = this.client.from('admin_audit_logs').select('*', { count: 'exact' }).order('created_at', { ascending: false });
    if (params.action) q = q.ilike('action', `%${params.action.trim()}%`);
    if (params.targetId) q = q.eq('target_id', params.targetId.trim());
    if (params.result) q = q.eq('result', params.result);

    const start = (params.page - 1) * params.pageSize;
    const { data, count, error } = await q.range(start, start + params.pageSize - 1);
    if (error) throw new Error(error.message);
    return {
      items: (data || []).map((row) => ({
        id: String(row.id),
        actorAdminId: (row.actor_admin_id as string | null) ?? null,
        actorUsername: (row.actor_username as string | null) ?? null,
        actorRole: (row.actor_role as StoredAdminAuditLog['actorRole']) ?? null,
        action: String(row.action),
        targetId: (row.target_id as string | null) ?? null,
        result: row.result as AdminAuditResult,
        reason: (row.reason as string | null) ?? null,
        metadata: (row.metadata as Record<string, unknown>) || {},
        createdAt: String(row.created_at),
      })),
      totalCount: count || 0,
    };
  }

  async getOperationalSnapshot(): Promise<OperationalStatsSnapshot> {
    const startMs = Date.now();
    const { data: profiles, error: profErr } = await this.client
      .from('profiles')
      .select('id, username, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(100);
    const latencyMs = Date.now() - startMs;

    const { count: pendingCount } = await this.client
      .from('outbox_events')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');

    const { count: failedCount } = await this.client
      .from('outbox_events')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed');

    const usersDirectory: AdminUserDiagnosticDTO[] = (profiles || []).map((p) => {
      const id = String(p.id);
      return {
        userId: id,
        maskedIdentifier: `${id.slice(0, 4)}…${id.slice(-4)}`,
        email: null,
        username: (p.username as string | null) ?? null,
        createdAt: String(p.created_at),
        accountStatus: 'active',
        platform: 'unknown',
        appVersion: null,
        lastSeenAt: (p.updated_at as string | null) ?? null,
        authDiagnostics: { provider: 'unknown', emailConfirmed: true, lastSignInError: null },
        syncHealth: { status: 'healthy', pendingMutations: null, lastSyncedAt: null },
      };
    });

    return {
      dataSource: 'supabase',
      registeredUsers: usersDirectory.length,
      activeUsersLast30Days: null,
      dailyActiveUsers: null,
      webUsersCount: null,
      androidUsersCount: null,
      pendingSyncCount: pendingCount ?? null,
      failedSyncCount: failedCount ?? null,
      lastSuccessfulSyncAt: null,
      databaseConnected: !profErr,
      databaseLatencyMs: profErr ? null : latencyMs,
      databaseNote: profErr ? profErr.message : 'Connected to Supabase PostgreSQL via service role (read-only metadata)',
      captureTotals: {
        captureEvents: 0,
        candidatesGenerated: 0,
        acceptedCandidates: 0,
        rejectedCandidates: 0,
        duplicateDetections: 0,
        parserFailures: 0,
        processingFailures: 0,
      },
      usersDirectory,
    };
  }
}

export function createAdminRepository(
  config: AppConfig,
  options?: { persistFilePath?: string | null }
): IAdminRepository {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (config.supabaseUrl && serviceKey) {
    return new SupabaseAdminRepository(config.supabaseUrl, serviceKey);
  }
  return new LocalAdminRepository(options?.persistFilePath);
}
