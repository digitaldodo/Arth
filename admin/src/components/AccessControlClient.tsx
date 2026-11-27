'use client';

import React, { useState } from 'react';
import type {
  AdminAccessMemberDTO,
  AdminAccessOverviewResponse,
  AdminAuditLogDTO,
  AdminRole,
} from '@arth/contracts';
import { RoleBadge, StatusBadge } from '@/components/AdminBadges';
import { adminClient, AdminClientError } from '@/lib/admin-api';

type PendingActionModal =
  | { type: 'disable'; member: AdminAccessMemberDTO }
  | { type: 'enable'; member: AdminAccessMemberDTO }
  | { type: 'role'; member: AdminAccessMemberDTO; nextRole: Exclude<AdminRole, 'OWNER_ADMIN'> }
  | { type: 'email'; member: AdminAccessMemberDTO; decision: 'approve' | 'reject' }
  | null;

export function AccessControlClient({
  initialData,
  initialError,
}: {
  initialData: AdminAccessOverviewResponse | null;
  initialError: string | null;
}) {
  const [data, setData] = useState<AdminAccessOverviewResponse | null>(initialData);
  const [error, setError] = useState<string | null>(initialError);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [modal, setModal] = useState<PendingActionModal>(null);
  const [reason, setReason] = useState('');
  const [activityMember, setActivityMember] = useState<AdminAccessMemberDTO | null>(null);
  const [activityLogs, setActivityLogs] = useState<AdminAuditLogDTO[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  const reload = async () => {
    const fresh = await adminClient.getAccess();
    setData(fresh);
  };

  const openActivity = async (member: AdminAccessMemberDTO) => {
    setActivityMember(member);
    setActivityLoading(true);
    try {
      const res = await adminClient.getAdminActivity(member.adminId);
      setActivityLogs(res.activity);
    } catch (err) {
      setError(err instanceof AdminClientError ? err.message : 'Unable to fetch activity.');
    } finally {
      setActivityLoading(false);
    }
  };

  const handleConfirmModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modal) return;
    setError(null);
    setNotice(null);
    setBusyId(modal.member.adminId);

    try {
      if (modal.type === 'disable') {
        await adminClient.disableAdmin(modal.member.adminId, reason.trim());
        setNotice(`Disabled ${modal.member.fullName} and revoked all active sessions immediately.`);
      } else if (modal.type === 'enable') {
        await adminClient.enableAdmin(modal.member.adminId, reason.trim() || undefined);
        setNotice(`Enabled access for ${modal.member.fullName}.`);
      } else if (modal.type === 'role') {
        await adminClient.changeAdminRole(modal.member.adminId, modal.nextRole, reason.trim() || undefined);
        setNotice(`Updated role for ${modal.member.fullName} to ${modal.nextRole}.`);
      } else if (modal.type === 'email') {
        await adminClient.decideEmailApproval(
          modal.member.adminId,
          modal.decision,
          reason.trim() || undefined,
        );
        setNotice(
          modal.decision === 'approve'
            ? `Approved email address for ${modal.member.fullName}.`
            : `Rejected pending email request for ${modal.member.fullName}.`,
        );
      }
      setModal(null);
      setReason('');
      await reload();
    } catch (err) {
      setError(err instanceof AdminClientError ? err.message : 'Operation failed.');
    } finally {
      setBusyId(null);
    }
  };

  const handleResetPassword = async (member: AdminAccessMemberDTO) => {
    setError(null);
    setNotice(null);
    setBusyId(member.adminId);
    try {
      await adminClient.triggerPasswordReset(member.adminId);
      setNotice(`Dispatched password recovery link to verified email for ${member.fullName}.`);
      await reload();
    } catch (err) {
      setError(err instanceof AdminClientError ? err.message : 'Password recovery failed.');
    } finally {
      setBusyId(null);
    }
  };

  if (!data) {
    return <p className="text-sm text-[var(--status-error-fg)]">{error || 'Access console unavailable.'}</p>;
  }

  const pendingApprovals = data.members.filter(
    (m) => m.activationState === 'AWAITING_OWNER_APPROVAL' || (m.pendingEmail && m.pendingEmailVerified),
  );

  return (
    <div className="space-y-6">
      {error && (
        <div
          role="alert"
          className="rounded-lg border px-4 py-3 text-xs font-medium"
          style={{
            color: 'var(--status-error-fg)',
            backgroundColor: 'var(--status-error-bg)',
            borderColor: 'var(--status-error-border)',
          }}
        >
          {error}
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="rounded-lg border px-4 py-3 text-xs font-medium"
          style={{
            color: 'var(--status-success-fg)',
            backgroundColor: 'var(--status-success-bg)',
            borderColor: 'var(--status-success-border)',
          }}
        >
          {notice}
        </div>
      )}

      {/* Pending Email Approvals Queue */}
      {pendingApprovals.length > 0 && (
        <section className="rounded-xl border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)]/40 p-5">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            Pending Email Verification Approvals ({pendingApprovals.length})
          </h2>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Approve or reject administrator email bindings verified via 6-digit OTP before onboarding advances.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {pendingApprovals.map((m) => (
              <div
                key={m.adminId}
                className="flex flex-col justify-between rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4 text-xs"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[var(--text-primary)]">{m.fullName}</span>
                    <span className="font-mono text-[var(--text-muted)]">@{m.username}</span>
                  </div>
                  <p className="mt-1.5 text-[var(--text-secondary)]">
                    Requested email: <span className="font-mono text-[var(--text-primary)]">{m.pendingEmail}</span>
                  </p>
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    disabled={busyId === m.adminId}
                    onClick={() => {
                      setReason('');
                      setModal({ type: 'email', member: m, decision: 'approve' });
                    }}
                    className="rounded-md bg-[var(--action-primary-bg)] px-3 py-1.5 font-medium text-[var(--action-primary-fg)] hover:bg-[var(--action-primary-hover)] cursor-pointer"
                  >
                    Approve Email
                  </button>
                  <button
                    type="button"
                    disabled={busyId === m.adminId}
                    onClick={() => {
                      setReason('');
                      setModal({ type: 'email', member: m, decision: 'reject' });
                    }}
                    className="rounded-md border border-[var(--border-subtle)] px-3 py-1.5 font-medium text-[var(--status-error-fg)] hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 5 Pre-Authorized Administrators Governance Roster */}
      <section className="overflow-x-auto rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)]">
        <div className="flex items-center justify-between border-b border-[var(--border-hairline)] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Pre-Authorized Administrators (5 Fixed Records)</h2>
            <p className="text-xs text-[var(--text-muted)]">
              Toggle access, update non-owner roles, dispatch password resets, and inspect per-admin activity.
            </p>
          </div>
        </div>

        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
              <th className="px-4 py-3 font-medium">Administrator</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Access Status</th>
              <th className="px-4 py-3 font-medium">Verified Email</th>
              <th className="px-4 py-3 font-medium">Last Login</th>
              <th className="px-4 py-3 font-medium">Owner Controls</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-hairline)]">
            {data.members.map((m) => (
              <tr key={m.adminId} className="hover:bg-[var(--bg-surface-subtle)]/40">
                <td className="px-4 py-3.5">
                  <div className="font-medium text-[var(--text-primary)]">{m.fullName}</div>
                  <div className="font-mono text-[11px] text-[var(--text-muted)]">@{m.username}</div>
                </td>
                <td className="px-4 py-3.5">
                  {m.isOwner ? (
                    <RoleBadge role={m.role} isOwner />
                  ) : (
                    <select
                      aria-label={`Change role for ${m.fullName}`}
                      value={m.role}
                      disabled={busyId === m.adminId}
                      onChange={(e) => {
                        const nextRole = e.target.value as Exclude<AdminRole, 'OWNER_ADMIN'>;
                        if (nextRole !== m.role) {
                          setReason('');
                          setModal({ type: 'role', member: m, nextRole });
                        }
                      }}
                      className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2 py-1 text-xs"
                    >
                      <option value="SUPPORT_ADMIN">Support Admin</option>
                      <option value="OPERATIONS_ADMIN">Operations Admin</option>
                    </select>
                  )}
                </td>
                <td className="px-4 py-3.5">
                  <StatusBadge status={m.status} activationState={m.activationState} />
                  {m.disabledReason && m.status === 'DISABLED' && (
                    <p className="mt-1 text-[11px] text-[var(--text-muted)]">Reason: {m.disabledReason}</p>
                  )}
                </td>
                <td className="px-4 py-3.5 font-mono text-[var(--text-secondary)]">
                  {m.verifiedEmail || (m.pendingEmail ? `${m.pendingEmail} (pending)` : 'Not registered')}
                </td>
                <td className="px-4 py-3.5 font-mono text-[var(--text-muted)]">
                  {m.lastLoginAt ? new Date(m.lastLoginAt).toLocaleString() : 'Never'}
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {m.isOwner ? (
                      <span className="rounded border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] px-2 py-1 text-[11px] text-[var(--text-muted)]">
                        Protected Primary Owner
                      </span>
                    ) : m.status === 'DISABLED' ? (
                      <button
                        type="button"
                        disabled={busyId === m.adminId}
                        onClick={() => {
                          setReason('');
                          setModal({ type: 'enable', member: m });
                        }}
                        className="rounded border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-2.5 py-1 font-medium text-[var(--status-success-fg)] cursor-pointer"
                      >
                        Enable Access
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busyId === m.adminId}
                        onClick={() => {
                          setReason('');
                          setModal({ type: 'disable', member: m });
                        }}
                        className="rounded border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-2.5 py-1 font-medium text-[var(--status-error-fg)] cursor-pointer"
                      >
                        Disable Access
                      </button>
                    )}

                    {!m.isOwner && m.verifiedEmail && (
                      <button
                        type="button"
                        disabled={busyId === m.adminId}
                        onClick={() => void handleResetPassword(m)}
                        className="rounded border border-[var(--border-subtle)] px-2.5 py-1 font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                      >
                        Reset PW
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => void openActivity(m)}
                      className="rounded border border-[var(--border-subtle)] px-2.5 py-1 font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                    >
                      Activity
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Confirmation Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-xl">
            <h3 className="text-base font-semibold">
              {modal.type === 'disable'
                ? `Disable ${modal.member.fullName}`
                : modal.type === 'enable'
                  ? `Enable ${modal.member.fullName}`
                  : modal.type === 'role'
                    ? `Change Role for ${modal.member.fullName}`
                    : `${modal.decision === 'approve' ? 'Approve' : 'Reject'} Email for ${modal.member.fullName}`}
            </h3>
            <p className="mt-1.5 text-xs text-[var(--text-secondary)]">
              {modal.type === 'disable'
                ? 'Disabling immediately revokes all active bearer sessions and prevents API access until re-enabled.'
                : modal.type === 'role'
                  ? `Confirm updating role to ${modal.nextRole}. Existing sessions remain subject to server RBAC.`
                  : modal.type === 'email'
                    ? `Pending email: ${modal.member.pendingEmail}`
                    : 'Re-enables account access according to its onboarding progress.'}
            </p>
            <form onSubmit={handleConfirmModal} className="mt-4 space-y-4">
              <div>
                <label htmlFor="owner-action-reason" className="block text-xs font-medium text-[var(--text-secondary)]">
                  Audit Reason {modal.type === 'disable' ? '(required)' : '(optional)'}
                </label>
                <input
                  id="owner-action-reason"
                  type="text"
                  required={modal.type === 'disable'}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Recorded in immutable admin audit logs"
                  className="mt-1.5 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-xs"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="rounded-md border border-[var(--border-subtle)] px-3.5 py-2 text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busyId === modal.member.adminId}
                  className="rounded-md bg-[var(--action-primary-bg)] px-4 py-2 text-xs font-medium text-[var(--action-primary-fg)] cursor-pointer"
                >
                  {busyId === modal.member.adminId ? 'Applying...' : 'Confirm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Per-Admin Activity Drawer */}
      {activityMember && (
        <section className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
          <div className="flex items-center justify-between border-b border-[var(--border-hairline)] pb-3">
            <div>
              <h3 className="text-sm font-semibold">
                Activity History — {activityMember.fullName} (@{activityMember.username})
              </h3>
              <p className="text-xs text-[var(--text-muted)]">Events involving or executed by this administrator.</p>
            </div>
            <button
              type="button"
              onClick={() => setActivityMember(null)}
              className="rounded border border-[var(--border-subtle)] px-2.5 py-1 text-xs cursor-pointer"
            >
              Close
            </button>
          </div>
          {activityLoading ? (
            <p className="py-4 text-xs text-[var(--text-muted)]">Loading activity...</p>
          ) : activityLogs.length === 0 ? (
            <p className="py-4 text-xs text-[var(--text-muted)]">No events recorded yet for this administrator.</p>
          ) : (
            <div className="mt-3 divide-y divide-[var(--border-hairline)]">
              {activityLogs.map((evt) => (
                <div key={evt.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs">
                  <div>
                    <span className="font-mono font-medium text-[var(--text-primary)]">{evt.action}</span>
                    {evt.reason && <span className="ml-2 text-[var(--text-secondary)]">— {evt.reason}</span>}
                  </div>
                  <span className="font-mono text-[var(--text-muted)]">
                    {evt.result} • {new Date(evt.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
