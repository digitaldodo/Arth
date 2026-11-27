import React from 'react';
import type { AdminUsersResponse } from '@arth/contracts';
import { AdminShell } from '@/components/AdminShell';
import { requireActiveAdminPage } from '@/lib/require-admin-page';
import { fetchBackendWithAdminSession } from '@/lib/admin-session';
import { UsersClient } from '@/components/UsersClient';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const { identity } = await requireActiveAdminPage();
  const res = await fetchBackendWithAdminSession<AdminUsersResponse>('/users?page=1&pageSize=25');

  return (
    <AdminShell
      identity={identity}
      title="User Diagnostics"
      subtitle="Search registered SpendSense user accounts via account metadata only (zero financial ledger inspection)."
    >
      <UsersClient initialData={res.data} initialError={res.ok ? null : res.error || null} />
    </AdminShell>
  );
}
