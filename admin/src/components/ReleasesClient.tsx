'use client';

import React, { useState } from 'react';
import type { AdminReleaseMonitorDTO } from '@arth/contracts';
import { adminClient, AdminClientError } from '@/lib/admin-api';

export function ReleasesClient({
  initialData,
  initialError,
}: {
  initialData: AdminReleaseMonitorDTO | null;
  initialError: string | null;
}) {
  const [data, setData] = useState<AdminReleaseMonitorDTO | null>(initialData);
  const [error, setError] = useState<string | null>(initialError);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setBusy(true);
    setError(null);
    try {
      setData(await adminClient.getReleases());
    } catch (err) {
      setError(err instanceof AdminClientError ? err.message : 'Unable to refresh releases.');
    } finally {
      setBusy(false);
    }
  };

  if (error || !data) {
    return <p className="text-sm text-[var(--status-error-fg)]">{error || 'Release metadata unavailable'}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-xs text-[var(--text-muted)]">
          Read-only artifact monitor • Checked {new Date(data.generatedAt).toLocaleString()}
        </p>
        <button
          type="button"
          onClick={refresh}
          disabled={busy}
          className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
        >
          {busy ? 'Refreshing...' : 'Refresh Metadata'}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
          <p className="text-xs text-[var(--text-muted)]">SpendSense Web & PWA</p>
          <p className="mt-2 font-mono text-sm font-semibold">{data.webVersion}</p>
          <p className="mt-1 font-mono text-xs text-[var(--text-secondary)]">PWA: {data.pwaVersion}</p>
        </div>
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
          <p className="text-xs text-[var(--text-muted)]">Android Target Compatibility</p>
          <p className="mt-2 font-mono text-sm font-semibold">
            {data.androidStandard.minAndroidVersion} – {data.androidStandard.targetAndroidVersion}
          </p>
          <p className="mt-1 font-mono text-xs text-[var(--text-secondary)]">
            Version: {data.androidStandard.version || 'Pending remote publish'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Standard Android Build (Play-Aligned)</h2>
            <span className="font-mono text-[11px] text-[var(--text-muted)]">
              {data.androidStandard.published ? 'PUBLISHED' : 'NOT PUBLISHED'}
            </span>
          </div>
          <p className="text-[var(--text-secondary)]">
            Artifact: <code className="font-mono">{data.androidStandard.apkFileName || 'SpendSense.apk'}</code> ({data.androidStandard.apkSize || '—'})
          </p>
          <p className="font-mono text-[11px] break-all text-[var(--text-muted)]">
            SHA-256: {data.androidStandard.sha256 || 'Unavailable locally'}
          </p>
        </div>

        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Direct SMS Edition & Installer APK</h2>
            <span className="font-mono text-[11px] text-[var(--text-muted)]">
              {data.androidDirectSms.published ? 'PUBLISHED' : 'NOT PUBLISHED'}
            </span>
          </div>
          <p className="text-[var(--text-secondary)]">
            Direct SMS: <code className="font-mono">{data.androidDirectSms.apkFileName || 'SpendSense-SMS.apk'}</code> ({data.androidDirectSms.apkSize || '—'})
          </p>
          <p className="text-[var(--text-secondary)]">
            Installer: <code className="font-mono">{data.androidDirectSms.installerFileName || 'SpendSense-Installer.apk'}</code> ({data.androidDirectSms.installerSize || '—'})
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] p-4 text-xs text-[var(--text-secondary)]">
        {data.availabilityNote}
      </div>
    </div>
  );
}
