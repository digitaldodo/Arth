import { redirect } from 'next/navigation';
import type { AdminIdentityDTO } from '@arth/contracts';
import { getServerAdminSession } from '@/lib/admin-session';

export interface AdminPageGateResult {
  identity: AdminIdentityDTO;
  ownerDenied: boolean;
}

export async function requireActiveAdminPage(options?: {
  ownerOnly?: boolean;
}): Promise<AdminPageGateResult> {
  const session = await getServerAdminSession();

  if (!session.identity) {
    redirect('/login');
  }

  if (session.identity.status === 'DISABLED') {
    redirect('/login?reason=disabled');
  }

  if (
    session.identity.status !== 'ENABLED' ||
    session.identity.activationState !== 'ACTIVE'
  ) {
    redirect('/activate');
  }

  const ownerDenied = Boolean(
    options?.ownerOnly && (!session.identity.isOwner || session.identity.role !== 'OWNER_ADMIN'),
  );

  return {
    identity: session.identity,
    ownerDenied,
  };
}
