import React from 'react';
import type { AdminSystemHealthDTO } from '@arth/contracts';
import { AdminShell } from '@/components/AdminShell';
import { requireActiveAdminPage } from '@/lib/require-admin-page';
import { fetchBackendWithAdminSession } from '@/lib/admin-session';
import { SystemClient } from '@/components/SystemClient';

export const dynamic = 'force-dynamic';

export default async function AdminSystemPage() {
  const { identity } = await requireActiveAdminPage();
  const res = await fetchBackendWithAdminSession<AdminSystemHealthDTO>('/system');

  return (
    <AdminShell
      identity={identity}
      title="API, Database & Sync Health"
      subtitle="Live Fastify telemetry, PostgreSQL/Supabase connectivity, offline sync failure metrics, and push readiness."
    >
      <SystemClient initialData={res.data} initialError={res.ok ? null : res.error || null} />
    </AdminShell>
  );
}
