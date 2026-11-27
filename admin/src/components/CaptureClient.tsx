'use client';

import React, { useState } from 'react';
import type { AdminCaptureTelemetryDTO } from '@arth/contracts';
import { adminClient, AdminClientError } from '@/lib/admin-api';

export function CaptureClient({
  initialData,
  initialError,
}: {
  initialData: AdminCaptureTelemetryDTO | null;
  initialError: string | null;
}) {
  const [data, setData] = useState<AdminCaptureTelemetryDTO | null>(initialData);
  const [error, setError] = useState<string | null>(initialError);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setBusy(true);
    setError(null);
    try {
      setData(await adminClient.getCapture());
    } catch (err) {
      setError(err instanceof AdminClientError ? err.message : 'Unable to refresh capture telemetry.');
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
          Snapshot {new Date(data.generatedAt).toLocaleString()} • {data.dataSource}
        </p>
        <button
          type="button"
          onClick={refresh}
          disabled={busy}
          className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
        >
          {busy ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
          <p className="text-xs text-[var(--text-muted)]">Capture Events</p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">{data.totals.captureEvents}</p>
        </div>
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
          <p className="text-xs text-[var(--text-muted)]">Accepted / Rejected</p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">
            {data.totals.acceptedCandidates} / {data.totals.rejectedCandidates}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
          <p className="text-xs text-[var(--text-muted)]">Duplicates Suppressed</p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">{data.totals.duplicateDetections}</p>
        </div>
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
          <p className="text-xs text-[var(--text-muted)]">Parser Failures</p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">{data.totals.parserFailures}</p>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
        <h2 className="text-sm font-semibold">Capture Channels Breakdown</h2>
        <div className="mt-3 divide-y divide-[var(--border-hairline)]">
          {data.byChannel.map((ch) => (
            <div key={ch.channel} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs">
              <div>
                <span className="font-medium text-[var(--text-primary)]">{ch.label}</span>
                <span className="ml-2 font-mono text-[var(--text-muted)]">({ch.channel})</span>
              </div>
              <div className="font-mono text-[var(--text-secondary)]">
                Events: {ch.eventsCount} • Failures: {ch.failuresCount}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
        <h2 className="text-sm font-semibold">Supported Android Notification Source Categories</h2>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {data.supportedSourceCategories.map((src) => (
            <div
              key={src.category}
              className="flex items-center justify-between rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] px-3 py-2 text-xs"
            >
              <span>{src.category}</span>
              <span className="font-mono text-[var(--text-secondary)]">
                {src.packagesCount} pkg • {src.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] p-4 text-xs text-[var(--text-secondary)]">
        <strong className="text-[var(--text-primary)]">Strict Privacy Guarantee: </strong>
        {data.privacyNotice}
      </div>
    </div>
  );
}
