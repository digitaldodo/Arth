import React from 'react';
import { AdminShell } from '@/components/AdminShell';
import { requireActiveAdminPage } from '@/lib/require-admin-page';
import { AccountClient } from '@/components/AccountClient';

export const dynamic = 'force-dynamic';

export default async function AdminAccountPage() {
  const { identity } = await requireActiveAdminPage();

  return (
    <AdminShell
      identity={identity}
      title="Administrator Account Security"
      subtitle="Rotate your permanent password or initiate verified email reassignment."
    >
      <AccountClient identity={identity} />
    </AdminShell>
  );
}
