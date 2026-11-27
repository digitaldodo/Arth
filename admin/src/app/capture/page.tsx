import React from 'react';
import type { AdminCaptureTelemetryDTO } from '@arth/contracts';
import { AdminShell } from '@/components/AdminShell';
import { requireActiveAdminPage } from '@/lib/require-admin-page';
import { fetchBackendWithAdminSession } from '@/lib/admin-session';
import { CaptureClient } from '@/components/CaptureClient';

export const dynamic = 'force-dynamic';

export default async function AdminCapturePage() {
  const { identity } = await requireActiveAdminPage();
  const res = await fetchBackendWithAdminSession<AdminCaptureTelemetryDTO>('/capture');

  return (
    <AdminShell
      identity={identity}
      title="Transaction Capture Monitoring"
      subtitle="Operational parser health, notification listener vs SMS source breakdown, deduplication metrics, and failure signals."
    >
      <CaptureClient initialData={res.data} initialError={res.ok ? null : res.error || null} />
    </AdminShell>
  );
}
