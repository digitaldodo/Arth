import React from 'react';
import { redirect } from 'next/navigation';
import { getServerAdminSession } from '@/lib/admin-session';
import { ActivateClient } from '@/components/ActivateClient';

export const dynamic = 'force-dynamic';

export default async function AdminActivatePage() {
  const session = await getServerAdminSession();

  if (!session.identity) {
    redirect('/login');
  }

  if (session.identity.status === 'DISABLED') {
    redirect('/login?reason=disabled');
  }

  if (session.identity.status === 'ENABLED' && session.identity.activationState === 'ACTIVE') {
    redirect('/');
  }

  return <ActivateClient initialIdentity={session.identity} />;
}
