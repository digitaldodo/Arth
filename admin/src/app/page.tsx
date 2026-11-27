import React from 'react';
import type { AdminOverviewDTO } from '@arth/contracts';
import { AdminShell } from '@/components/AdminShell';
import { requireActiveAdminPage } from '@/lib/require-admin-page';
import { fetchBackendWithAdminSession } from '@/lib/admin-session';
import { OverviewClient } from '@/components/OverviewClient';

export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage() {
  const { identity } = await requireActiveAdminPage();
  const res = await fetchBackendWithAdminSession<AdminOverviewDTO>('/overview');

  return (
    <AdminShell
      identity={identity}
      title="Operations Overview"
      subtitle="Platform health, anonymized telemetry, and governance readiness across SpendSense Web, PWA, Backend, and Android."
    >
      <OverviewClient initialData={res.data} initialError={res.ok ? null : res.error || null} />
    </AdminShell>
  );
}
