import React from 'react';
import type { AdminReleaseMonitorDTO } from '@arth/contracts';
import { AdminShell } from '@/components/AdminShell';
import { requireActiveAdminPage } from '@/lib/require-admin-page';
import { fetchBackendWithAdminSession } from '@/lib/admin-session';
import { ReleasesClient } from '@/components/ReleasesClient';

export const dynamic = 'force-dynamic';

export default async function AdminReleasesPage() {
  const { identity } = await requireActiveAdminPage();
  const res = await fetchBackendWithAdminSession<AdminReleaseMonitorDTO>('/releases');

  return (
    <AdminShell
      identity={identity}
      title="Application & Android Releases"
      subtitle="Read-only release integrity monitor for SpendSense Web, PWA Service Worker, and Android APK channels."
    >
      <ReleasesClient initialData={res.data} initialError={res.ok ? null : res.error || null} />
    </AdminShell>
  );
}
