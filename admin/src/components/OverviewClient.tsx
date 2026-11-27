'use client';

import React, { useState } from 'react';
import type { AdminOverviewDTO } from '@arth/contracts';
import { adminClient, AdminClientError } from '@/lib/admin-api';

function MetricCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
      <p className="text-xs font-medium text-[var(--text-muted)]">{label}</p>
      <p className="mt-2 font-mono text-2xl font-semibold tracking-tight tabular-nums text-[var(--text-primary)]">
        {value}
      </p>
      {hint && <p className="mt-1 text-[11px] text-[var(--text-secondary)]">{hint}</p>}
    </div>
  );
}

export function OverviewClient({
  initialData,
  initialError,
}: {
  initialData: AdminOverviewDTO | null;
  initialError: string | null;
}) {
  const [data, setData] = useState<AdminOverviewDTO | null>(initialData);
  const [error, setError] = useState<string | null>(initialError);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      setData(await adminClient.getOverview());
    } catch (err) {
      setError(err instanceof AdminClientError ? err.message : 'Unable to load telemetry.');
    } finally {
      setRefreshing(false);
    }
  };

  if (error || !data) {
    return (
      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6">
        <p className="text-sm text-[var(--status-error-fg)]">{error || 'Telemetry unavailable'}</p>
        <button
          type="button"
          onClick={handleRefresh}
          className="mt-3 rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-xs text-[var(--text-muted)]">
          Updated {new Date(data.generatedAt).toLocaleString()} • Source: {data.dataSource}
        </p>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--bg-surface-subtle)] disabled:opacity-60 cursor-pointer"
        >
          {refreshing ? 'Refreshing...' : 'Refresh Telemetry'}
        </button>
      </div>

      <section aria-label="User metrics">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Accounts & Onboarding (Metadata Only)
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Registered Users"
            value={data.users.registeredUsers ?? 'N/A'}
            hint={data.users.availabilityNote}
          />
          <MetricCard
            label="Active Users (30d)"
            value={data.users.activeUsersLast30Days ?? 'N/A'}
            hint={`Daily active: ${data.users.dailyActiveUsers ?? 'N/A'}`}
          />
          <MetricCard
            label="Platform Split"
            value={`${data.users.webUsersCount ?? 0} Web`}
            hint={`Android devices: ${data.users.androidUsersCount ?? 0}`}
          />
          <MetricCard
            label="App Builds"
            value={data.versions.webAppVersion}
            hint={`Android: ${data.versions.androidStandardVersion}`}
          />
        </div>
      </section>

      <section aria-label="Operations telemetry">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Capture, Sync & API Telemetry
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Capture Events (24h)"
            value={data.capture.totalEventsLast24h}
            hint={`Accepted ${data.capture.acceptedCandidates} • Rejected ${data.capture.rejectedCandidates}`}
          />
          <MetricCard
            label="Sync Queue Backlog"
            value={data.sync.pendingQueueCount ?? 0}
            hint={`Failed syncs: ${data.sync.failedSyncCount ?? 0}`}
          />
          <MetricCard
            label="Backend p95 Latency"
            value={`${data.backend.p95ResponseMs} ms`}
            hint={`5xx rate: ${data.backend.apiErrorRatePercent}% • Uptime ${data.backend.uptimeSeconds}s`}
          />
          <MetricCard
            label="Backend Status"
            value={data.backend.status.toUpperCase()}
            hint={`PWA Build: ${data.versions.pwaBuildId}`}
          />
        </div>
      </section>

      <section className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
        <h2 className="text-sm font-semibold">Recent Service Incidents & Operational Signals</h2>
        {data.recentIncidents.length === 0 ? (
          <p className="mt-2 text-xs text-[var(--text-muted)]">No degraded operational signals reported.</p>
        ) : (
          <div className="mt-3 divide-y divide-[var(--border-hairline)]">
            {data.recentIncidents.map((inc) => (
              <div key={inc.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs">
                <div>
                  <span className="font-mono font-semibold uppercase text-[var(--text-primary)]">
                    [{inc.severity}] {inc.service}
                  </span>
                  <span className="ml-2 text-[var(--text-secondary)]">{inc.message}</span>
                </div>
                <span className="font-mono text-[var(--text-muted)]">
                  {new Date(inc.timestamp).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
