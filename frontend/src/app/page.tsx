import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { TransactionAppShell } from '@/features/transactions/TransactionAppShell';
import { sanitizeRedirectPath, formatAuthError } from '@/lib/auth-config';

export const dynamic = 'force-dynamic';

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<{
    code?: string;
    error?: string;
    error_description?: string;
    next?: string;
  }>;
}) {
  const params = searchParams ? await searchParams : {};

  // If authorization code landed on the root page (e.g. from default Site URL fallback),
  // forward immediately to the dedicated callback handler for PKCE session exchange
  if (params.code) {
    const nextPath = sanitizeRedirectPath(params.next, '/');
    redirect(
      `/auth/callback?code=${encodeURIComponent(params.code)}&next=${encodeURIComponent(nextPath)}`
    );
  }

  // If OAuth error landed on root page, forward to login with informative message
  if (params.error) {
    const errorMsg = formatAuthError(params.error, params.error_description);
    redirect(`/login?error=${encodeURIComponent(errorMsg)}`);
  }

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
