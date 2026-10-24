import { createClient } from '@/lib/supabase/server';
import { TransactionAppShell } from '@/features/transactions/TransactionAppShell';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  let authenticatedUser: { id: string; email?: string } | null = null;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      authenticatedUser = {
        id: user.id,
        email: user.email,
      };
    }
  } catch {
    authenticatedUser = null;
  }

  return <TransactionAppShell user={authenticatedUser} />;
}
