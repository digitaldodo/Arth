'use client';

import React, { useState } from 'react';
import type { AdminSystemHealthDTO } from '@arth/contracts';
import { adminClient, AdminClientError } from '@/lib/admin-api';

export function SystemClient({
  initialData,
  initialError,
}: {
  initialData: AdminSystemHealthDTO | null;
  initialError: string | null;
}) {
  const [data, setData] = useState<AdminSystemHealthDTO | null>(initialData);
  const [error, setError] = useState<string | null>(initialError);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setBusy(true);
    setError(null);
    try {
      setData(await adminClient.getSystem());
    } catch (err) {
      setError(err instanceof AdminClientError ? err.message : 'Unable to refresh system health.');
    } finally {
      setBusy(false);
    }
  };

  if (error || !data) {
    return <p className="text-sm text-[var(--status-error-fg)]">{error || 'Unavailable'}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs text-[var(--text-muted)]">
          Last Checked: {new Date(data.lastSuccessfulHealthCheckAt).toLocaleString()} • Uptime {data.backend.uptimeSeconds}s
        </p>
        <button
          type="button"
          onClick={refresh}
          disabled={busy}
          className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
        >
          {busy ? 'Checking...' : 'Run Health Check'}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
          <p className="text-xs text-[var(--text-muted)]">Database Status</p>
          <p className="mt-2 font-mono text-lg font-semibold uppercase">{data.database.status}</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Latency: {data.database.latencyMs ?? 'N/A'} ms • {data.database.note}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
          <p className="text-xs text-[var(--text-muted)]">API Telemetry</p>
          <p className="mt-2 font-mono text-lg font-semibold tabular-nums">{data.backend.p95ResponseMs} ms p95</p>
          <p className="mt-1 font-mono text-xs text-[var(--text-secondary)]">
            Avg: {data.backend.avgResponseMs} ms • Error rate: {data.backend.errorRatePercent}%
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
          <p className="text-xs text-[var(--text-muted)]">Auth Errors (24h)</p>
          <p className="mt-2 font-mono text-lg font-semibold tabular-nums">{data.sync.authErrorsLast24h}</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">Source: {data.dataSource}</p>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
        <h2 className="text-sm font-semibold">Synchronization Queue Status</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
          <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] p-3">
            <p className="text-[var(--text-muted)]">Pending Sync Queue</p>
            <p className="mt-1 font-mono text-base font-semibold tabular-nums">{data.sync.pendingSyncCount ?? 0}</p>
          </div>
          <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] p-3">
            <p className="text-[var(--text-muted)]">Failed Sync Items</p>
            <p className="mt-1 font-mono text-base font-semibold tabular-nums">{data.sync.failedSyncCount ?? 0}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
