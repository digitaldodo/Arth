import React from 'react';
import { AdminShell } from '@/components/AdminShell';
import { OwnerDeniedNotice } from '@/components/OwnerDeniedNotice';
import { requireActiveAdminPage } from '@/lib/require-admin-page';
import { fetchBackendWithAdminSession } from '@/lib/admin-session';
import { AuditClient } from '@/components/AuditClient';
import type { AdminAuditListResponse } from '@/lib/admin-api';

export const dynamic = 'force-dynamic';

export default async function AdminAuditPage() {
  const { identity, ownerDenied } = await requireActiveAdminPage({ ownerOnly: true });

  if (ownerDenied) {
    return (
      <AdminShell
        identity={identity}
        title="Security Audit Logs"
        subtitle="Immutable chronological history of administrative authentication, approvals, access revocations, and RBAC changes."
      >
        <OwnerDeniedNotice section="Security Audit Logs" />
      </AdminShell>
    );
  }

  const res = await fetchBackendWithAdminSession<AdminAuditListResponse>('/audit?page=1&pageSize=30');

  return (
    <AdminShell
      identity={identity}
      title="Security Audit Logs"
      subtitle="Immutable append-only chronological log (accessible strictly to Primary Owner Ansh Gupta)."
    >
      <AuditClient initialData={res.data} initialError={res.ok ? null : res.error || null} />
    </AdminShell>
  );
}
