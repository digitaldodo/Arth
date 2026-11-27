'use client';

import React, { useState } from 'react';
import type { AdminUsersResponse } from '@arth/contracts';
import { adminClient, AdminClientError } from '@/lib/admin-api';

export function UsersClient({
  initialData,
  initialError,
}: {
  initialData: AdminUsersResponse | null;
  initialError: string | null;
}) {
  const [data, setData] = useState<AdminUsersResponse | null>(initialData);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  const loadUsers = async (query = search, page = 1) => {
    setBusy(true);
    setError(null);
    try {
      setData(await adminClient.getUsers(query, page, 25));
    } catch (err) {
      setError(err instanceof AdminClientError ? err.message : 'Unable to query user diagnostics.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void loadUsers(search, 1);
        }}
        className="flex flex-wrap gap-2"
      >
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by email or user identifier..."
          className="min-w-0 flex-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--focus-ring)] focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-[var(--action-primary-bg)] px-4 py-2 text-xs font-medium text-[var(--action-primary-fg)] hover:bg-[var(--action-primary-hover)] disabled:opacity-60 cursor-pointer"
        >
          {busy ? 'Searching...' : 'Search Users'}
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
                <th className="px-4 py-3 font-medium">User Identifier</th>
                <th className="px-4 py-3 font-medium">Provider / Client</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Last Seen</th>
                <th className="px-4 py-3 font-medium">Sync State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-hairline)]">
              {data.items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-[var(--text-muted)]">
                    No user accounts matched your filter ({data.dataSource}).
                  </td>
                </tr>
              ) : (
                data.items.map((u) => (
                  <tr key={u.userId} className="hover:bg-[var(--bg-surface-subtle)]/50">
                    <td className="px-4 py-3 font-mono text-[var(--text-primary)]">{u.maskedIdentifier}</td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {u.authDiagnostics.provider} • {u.platform}
                    </td>
                    <td className="px-4 py-3">
                      {u.authDiagnostics.emailConfirmed ? (
                        <span className="text-[var(--status-success-fg)]">{u.accountStatus}</span>
                      ) : (
                        <span className="text-[var(--status-warning-fg)]">unconfirmed</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-[var(--text-secondary)]">
                      {u.lastSeenAt ? new Date(u.lastSeenAt).toLocaleString() : 'Never'}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">{u.syncHealth.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-hairline)] px-4 py-3 text-xs text-[var(--text-muted)]">
            <span>{data.privacyNotice}</span>
            <div className="flex items-center gap-2">
              <span>Total: {data.totalCount}</span>
              <button
                type="button"
                disabled={busy || data.page <= 1}
                onClick={() => void loadUsers(search, data.page - 1)}
                className="rounded border border-[var(--border-subtle)] px-2.5 py-1 disabled:opacity-40 cursor-pointer"
              >
                Prev
              </button>
              <button
                type="button"
                disabled={busy || data.page * data.pageSize >= data.totalCount}
                onClick={() => void loadUsers(search, data.page + 1)}
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
