import { createClient } from '@/lib/supabase/server';
import { TransactionAppShell } from '@/features/transactions/TransactionAppShell';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  let authenticatedUser: {
    id: string;
    email?: string;
    displayName?: string;
  } | null = null;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      let displayName: string | undefined =
        user.user_metadata?.username ||
        user.user_metadata?.display_name ||
        user.user_metadata?.full_name;

      if (!displayName) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', user.id)
          .maybeSingle();

        if (profile?.display_name) {
          displayName = profile.display_name;
        }
      }

      authenticatedUser = {
        id: user.id,
        email: user.email,
        displayName: displayName || undefined,
      };
    }
  } catch {
    authenticatedUser = null;
  }

  return <TransactionAppShell user={authenticatedUser} />;
}
