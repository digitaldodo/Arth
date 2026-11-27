import type {
  AdminAccessMemberDTO,
  AdminAccessOverviewResponse,
  AdminAuditLogDTO,
  AdminAuditResult,
  AdminCaptureTelemetryDTO,
  AdminIdentityDTO,
  AdminOverviewDTO,
  AdminReleaseMonitorDTO,
  AdminRole,
  AdminSystemHealthDTO,
  AdminUsersResponse,
} from '@arth/contracts';

export interface AdminAuditListResponse {
  items: AdminAuditLogDTO[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export class AdminClientError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/admin${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers || {}),
    },
    credentials: 'same-origin',
    cache: 'no-store',
  });

  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new AdminClientError(
      String(payload.message || payload.error || `Request failed (${res.status})`),
      res.status,
      typeof payload.error === 'string' ? payload.error : undefined,
    );
  }
  return payload as T;
}

export const adminClient = {
  login(username: string, password: string) {
    return requestJson<{
      authenticated: boolean;
      requiresActivation: boolean;
      identity: AdminIdentityDTO;
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },
  logout() {
    return requestJson<{ ok: boolean }>('/auth/logout', { method: 'POST', body: '{}' });
  },
  me() {
    return requestJson<AdminIdentityDTO>('/auth/me');
  },
  submitActivationEmail(email: string) {
    return requestJson<{ identity: AdminIdentityDTO }>('/auth/activation/submit-email', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },
  verifyActivationEmail(code: string) {
    return requestJson<{ identity: AdminIdentityDTO }>('/auth/activation/verify-email', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  },
  completeActivation(newPassword: string, confirmPassword: string) {
    return requestJson<{
      authenticated: boolean;
      requiresActivation: boolean;
      identity: AdminIdentityDTO;
    }>('/auth/activation/complete', {
      method: 'POST',
      body: JSON.stringify({ newPassword, confirmPassword }),
    });
  },
  forgotPassword(email: string) {
    return requestJson<{ dispatched: boolean }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },
  resetPassword(token: string, newPassword: string, confirmPassword: string) {
    return requestJson<{ ok: boolean }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword, confirmPassword }),
    });
  },
  changePassword(currentPassword: string, newPassword: string, confirmPassword: string) {
    return requestJson<{ ok: boolean }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
    });
  },
  changeEmail(currentPassword: string, newEmail: string) {
    return requestJson<{ identity: AdminIdentityDTO }>('/auth/change-email', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newEmail }),
    });
  },
  getOverview() {
    return requestJson<AdminOverviewDTO>('/overview');
  },
  getUsers(search = '', page = 1, pageSize = 25) {
    const params = new URLSearchParams({
      search,
      page: String(page),
      pageSize: String(pageSize),
    });
    return requestJson<AdminUsersResponse>(`/users?${params.toString()}`);
  },
  getCapture() {
    return requestJson<AdminCaptureTelemetryDTO>('/capture');
  },
  getSystem() {
    return requestJson<AdminSystemHealthDTO>('/system');
  },
  getReleases() {
    return requestJson<AdminReleaseMonitorDTO>('/releases');
  },
  getAudit(action = '', result: AdminAuditResult | '' = '', page = 1, pageSize = 30) {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (action) params.set('action', action);
    if (result) params.set('result', result);
    return requestJson<AdminAuditListResponse>(`/audit?${params.toString()}`);
  },
  getAccess() {
    return requestJson<AdminAccessOverviewResponse>('/access');
  },
  disableAdmin(adminId: string, reason: string) {
    return requestJson<{ member: AdminAccessMemberDTO }>(`/access/${adminId}/disable`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },
  enableAdmin(adminId: string, reason?: string) {
    return requestJson<{ member: AdminAccessMemberDTO }>(`/access/${adminId}/enable`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },
  changeAdminRole(adminId: string, role: Exclude<AdminRole, 'OWNER_ADMIN'>, reason?: string) {
    return requestJson<{ member: AdminAccessMemberDTO }>(`/access/${adminId}/role`, {
      method: 'POST',
      body: JSON.stringify({ role, reason }),
    });
  },
  decideEmailApproval(adminId: string, decision: 'approve' | 'reject', reason?: string) {
    return requestJson<{ member: AdminAccessMemberDTO }>(`/access/${adminId}/email-approval`, {
      method: 'POST',
      body: JSON.stringify({ decision, reason }),
    });
  },
  triggerPasswordReset(adminId: string) {
    return requestJson<{ dispatched: boolean }>(`/access/${adminId}/reset-password`, {
      method: 'POST',
      body: '{}',
    });
  },
  getAdminActivity(adminId: string) {
    return requestJson<{ activity: AdminAuditLogDTO[] }>(`/access/${adminId}/activity`);
  },
};
