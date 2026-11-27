import React from 'react';
import type { AdminMembershipStatus, AdminActivationState, AdminRole } from '@arth/contracts';

export function RoleBadge({ role, isOwner }: { role: AdminRole; isOwner?: boolean }) {
  if (role === 'OWNER_ADMIN' || isOwner) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-tight"
        style={{
          color: 'var(--status-info-fg)',
          backgroundColor: 'var(--status-info-bg)',
          borderColor: 'var(--status-info-border)',
        }}
      >
        Primary Owner
      </span>
    );
  }

  if (role === 'OPERATIONS_ADMIN') {
    return (
      <span
        className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium"
        style={{
          color: 'var(--status-success-fg)',
          backgroundColor: 'var(--status-success-bg)',
          borderColor: 'var(--status-success-border)',
        }}
      >
        Operations Admin
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
      Support Admin
    </span>
  );
}

export function StatusBadge({
  status,
  activationState,
}: {
  status: AdminMembershipStatus;
  activationState?: AdminActivationState;
}) {
  if (status === 'ENABLED' && activationState === 'ACTIVE') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium"
        style={{
          color: 'var(--status-success-fg)',
          backgroundColor: 'var(--status-success-bg)',
          borderColor: 'var(--status-success-border)',
        }}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        Enabled
      </span>
    );
  }

  if (status === 'DISABLED') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium"
        style={{
          color: 'var(--status-error-fg)',
          backgroundColor: 'var(--status-error-bg)',
          borderColor: 'var(--status-error-border)',
        }}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        Disabled
      </span>
    );
  }

  const label =
    activationState === 'AWAITING_OWNER_APPROVAL'
      ? 'Awaiting Owner Approval'
      : activationState === 'PENDING_EMAIL_VERIFICATION'
        ? 'Verify Email OTP'
        : activationState === 'AWAITING_PASSWORD_SETUP'
          ? 'Set Permanent Password'
          : 'Pending Activation';

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium"
      style={{
        color: 'var(--status-warning-fg)',
        backgroundColor: 'var(--status-warning-bg)',
        borderColor: 'var(--status-warning-border)',
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
