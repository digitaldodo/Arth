import React from 'react';
import type { AdminAccessOverviewResponse } from '@arth/contracts';
import { AdminShell } from '@/components/AdminShell';
import { OwnerDeniedNotice } from '@/components/OwnerDeniedNotice';
import { requireActiveAdminPage } from '@/lib/require-admin-page';
import { fetchBackendWithAdminSession } from '@/lib/admin-session';
import { AccessControlClient } from '@/components/AccessControlClient';

export const dynamic = 'force-dynamic';

export default async function AdminAccessControlPage() {
  const { identity, ownerDenied } = await requireActiveAdminPage({ ownerOnly: true });

  if (ownerDenied) {
    return (
      <AdminShell
        identity={identity}
        title="Administrator Access & Role Governance"
        subtitle="Primary Owner control over the five pre-authorized administrators."
      >
        <OwnerDeniedNotice section="Administrator Access & Role Governance" />
      </AdminShell>
    );
  }

  const res = await fetchBackendWithAdminSession<AdminAccessOverviewResponse>('/access');

  return (
    <AdminShell
      identity={identity}
      title="Administrator Access & Role Governance"
      subtitle="Enable/disable access, manage non-owner roles, approve verified emails, and inspect per-admin audit trails."
    >
      <AccessControlClient initialData={res.data} initialError={res.ok ? null : res.error || null} />
    </AdminShell>
  );
}
