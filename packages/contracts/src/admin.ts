export type AdminRole = 'OWNER_ADMIN' | 'OPERATIONS_ADMIN' | 'SUPPORT_ADMIN';

export type AdminMembershipStatus = 'PENDING_ACTIVATION' | 'ENABLED' | 'DISABLED';

export type AdminActivationState =
  | 'PENDING_EMAIL'
  | 'PENDING_EMAIL_VERIFICATION'
  | 'AWAITING_OWNER_APPROVAL'
  | 'AWAITING_PASSWORD_SETUP'
  | 'ACTIVE';

export type AdminAuditResult = 'SUCCESS' | 'DENIED' | 'FAILED';

export interface AdminIdentityDTO {
  adminId: string;
  fullName: string;
  username: string;
  role: AdminRole;
  isOwner: boolean;
  status: AdminMembershipStatus;
  activationState: AdminActivationState;
  verifiedEmail: string | null;
  pendingEmail: string | null;
  pendingEmailVerified: boolean;
  lastLoginAt: string | null;
  lastSeenAt: string | null;
}

export interface AdminLoginResponse {
  authenticated: boolean;
  requiresActivation: boolean;
  identity: AdminIdentityDTO;
  sessionToken?: string;
}

export interface AdminAccessMemberDTO extends AdminIdentityDTO {
  tempCredentialInvalidated: boolean;
  disabledAt: string | null;
  disabledReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminAuditLogDTO {
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

export interface AdminAccessOverviewResponse {
  members: AdminAccessMemberDTO[];
  pendingApprovalsCount: number;
  recentAuditLogs: AdminAuditLogDTO[];
}

export interface AdminOverviewDTO {
  generatedAt: string;
  dataSource: 'supabase' | 'local_dev_store';
  users: {
    registeredUsers: number | null;
    activeUsersLast30Days: number | null;
    dailyActiveUsers: number | null;
    webUsersCount: number | null;
    androidUsersCount: number | null;
    availabilityNote: string;
  };
  backend: {
    status: 'ok' | 'degraded';
    uptimeSeconds: number;
    apiErrorRatePercent: number;
    p95ResponseMs: number;
  };
  capture: {
    totalEventsLast24h: number;
    candidatesGenerated: number;
    acceptedCandidates: number;
    rejectedCandidates: number;
  };
  sync: {
    pendingQueueCount: number | null;
    failedSyncCount: number | null;
    lastSuccessfulSyncAt: string | null;
  };
  versions: {
    webAppVersion: string;
    pwaBuildId: string;
    androidStandardVersion: string;
    androidDirectSmsVersion: string;
  };
  recentIncidents: Array<{
    id: string;
    severity: 'info' | 'warning' | 'error';
    service: string;
    message: string;
    timestamp: string;
  }>;
}

export interface AdminUserDiagnosticDTO {
  userId: string;
  maskedIdentifier: string;
  email: string | null;
  username: string | null;
  createdAt: string;
  accountStatus: 'active' | 'unconfirmed' | 'disabled' | 'unknown';
  platform: 'web' | 'pwa' | 'android' | 'multi' | 'unknown';
  appVersion: string | null;
  lastSeenAt: string | null;
  authDiagnostics: {
    provider: 'email' | 'google' | 'unknown';
    emailConfirmed: boolean;
    lastSignInError: string | null;
  };
  syncHealth: {
    status: 'healthy' | 'delayed' | 'error' | 'unknown';
    pendingMutations: number | null;
    lastSyncedAt: string | null;
  };
}

export interface AdminUsersResponse {
  items: AdminUserDiagnosticDTO[];
  totalCount: number;
  page: number;
  pageSize: number;
  dataSource: 'supabase' | 'local_dev_store';
  privacyNotice: string;
}

export interface AdminCaptureTelemetryDTO {
  generatedAt: string;
  dataSource: 'supabase' | 'local_dev_store';
  totals: {
    captureEvents: number;
    candidatesGenerated: number;
    acceptedCandidates: number;
    rejectedCandidates: number;
    duplicateDetections: number;
    parserFailures: number;
    processingFailures: number;
  };
  byChannel: Array<{
    channel: 'android_notification' | 'android_direct_sms' | 'android_share_sheet' | 'statement_import';
    label: string;
    permissionGrantedUsers: number | null;
    successfulCaptureUsers: number | null;
    eventsCount: number;
    failuresCount: number;
  }>;
  parserVersions: Array<{ version: string; eventsCount: number }>;
  androidAppVersions: Array<{ version: string; activeInstallations: number }>;
  supportedSourceCategories: Array<{
    category: string;
    packagesCount: number;
    status: 'supported' | 'conditional';
  }>;
  privacyNotice: string;
}

export interface AdminSystemHealthDTO {
  generatedAt: string;
  dataSource: 'supabase' | 'local_dev_store';
  backend: {
    available: boolean;
    uptimeSeconds: number;
    avgResponseMs: number;
    p95ResponseMs: number;
    errorRatePercent: number;
  };
  database: {
    status: 'connected' | 'unconfigured' | 'degraded';
    latencyMs: number | null;
    note: string;
  };
  sync: {
    failedSyncCount: number | null;
    pendingSyncCount: number | null;
    authErrorsLast24h: number;
  };
  lastSuccessfulHealthCheckAt: string;
}

export interface AdminReleaseMonitorDTO {
  generatedAt: string;
  webVersion: string;
  pwaVersion: string;
  androidStandard: {
    published: boolean;
    version: string;
    apkFileName: string;
    apkSize: string;
    sha256: string;
    minAndroidVersion: string;
    targetAndroidVersion: string;
    releaseDate: string;
  };
  androidDirectSms: {
    published: boolean;
    apkFileName: string;
    apkSize: string;
    sha256: string;
    installerFileName: string;
    installerSize: string;
    installerSha256: string;
  };
  releaseNotes: string[];
  githubReleaseUrl: string;
  availabilityNote: string;
}
