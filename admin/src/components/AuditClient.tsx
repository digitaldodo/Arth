'use client';

import React, { useState } from 'react';
import type { AdminAuditResult } from '@arth/contracts';
import { adminClient, AdminClientError, type AdminAuditListResponse } from '@/lib/admin-api';

export function AuditClient({
  initialData,
  initialError,
}: {
  initialData: AdminAuditListResponse | null;
  initialError: string | null;
}) {
  const [data, setData] = useState<AdminAuditListResponse | null>(initialData);
  const [actionFilter, setActionFilter] = useState('');
  const [resultFilter, setResultFilter] = useState<AdminAuditResult | ''>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  const loadAudit = async (page = 1) => {
    setBusy(true);
    setError(null);
    try {
      setData(await adminClient.getAudit(actionFilter.trim(), resultFilter, page, 30));
    } catch (err) {
      setError(err instanceof AdminClientError ? err.message : 'Unable to query audit logs.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void loadAudit(1);
        }}
        className="flex flex-wrap gap-2"
      >
        <input
          type="text"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          placeholder="Filter action (e.g. ADMIN_ACCESS_DISABLED, ADMIN_LOGIN)..."
          className="min-w-0 flex-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--focus-ring)] focus:outline-none"
        />
        <select
          aria-label="Filter by audit result"
          value={resultFilter}
          onChange={(e) => setResultFilter(e.target.value as AdminAuditResult | '')}
          className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)]"
        >
          <option value="">All Results</option>
          <option value="SUCCESS">SUCCESS</option>
          <option value="DENIED">DENIED</option>
          <option value="FAILED">FAILED</option>
        </select>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-[var(--action-primary-bg)] px-4 py-2 text-xs font-medium text-[var(--action-primary-fg)] hover:bg-[var(--action-primary-hover)] disabled:opacity-60 cursor-pointer"
        >
          {busy ? 'Filtering...' : 'Apply Filter'}
        </button>
      </form>

      {error && (
        <div
          className="rounded-lg border p-4 text-xs"
          style={{
            color: 'var(--status-error-fg)',
            backgroundColor: 'var(--status-error-bg)',
            borderColor: 'var(--status-error-border)',
          }}
        >
          {error}
        </div>
      )}

      {data && (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)]">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                <th className="px-4 py-3 font-medium">Timestamp</th>
                <th className="px-4 py-3 font-medium">Actor</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Target</th>
                <th className="px-4 py-3 font-medium">Result & Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-hairline)]">
              {data.items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-[var(--text-muted)]">
                    No matching audit records.
                  </td>
                </tr>
              ) : (
                data.items.map((log) => (
                  <tr key={log.id} className="hover:bg-[var(--bg-surface-subtle)]/50">
                    <td className="px-4 py-3 font-mono whitespace-nowrap text-[var(--text-secondary)]">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-mono text-[var(--text-primary)]">
                      {log.actorUsername || log.actorAdminId || log.actorRole || 'SYSTEM'}
                    </td>
                    <td className="px-4 py-3 font-mono font-medium text-[var(--text-primary)]">{log.action}</td>
                    <td className="px-4 py-3 font-mono text-[var(--text-muted)]">{log.targetId || '—'}</td>
                    <td className="px-4 py-3">
                      <span
                        className="font-mono font-semibold"
                        style={{
                          color:
                            log.result === 'SUCCESS'
                              ? 'var(--status-success-fg)'
                              : log.result === 'DENIED'
                                ? 'var(--status-error-fg)'
                                : 'var(--status-warning-fg)',
                        }}
                      >
                        {log.result}
                      </span>
                      {log.reason && (
                        <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">{log.reason}</p>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-[var(--border-hairline)] px-4 py-3 text-xs text-[var(--text-muted)]">
            <span>Immutable append-only trail • Total: {data.totalCount}</span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy || data.page <= 1}
                onClick={() => void loadAudit(data.page - 1)}
                className="rounded border border-[var(--border-subtle)] px-2.5 py-1 disabled:opacity-40 cursor-pointer"
              >
                Prev
              </button>
              <button
                type="button"
                disabled={busy || data.page * data.pageSize >= data.totalCount}
                onClick={() => void loadAudit(data.page + 1)}
                className="rounded border border-[var(--border-subtle)] px-2.5 py-1 disabled:opacity-40 cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
