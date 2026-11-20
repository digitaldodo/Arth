import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { TransactionAppShell } from '@/features/transactions/TransactionAppShell';
import { UnauthenticatedHome } from '@/app/UnauthenticatedHome';
import { sanitizeRedirectPath, formatAuthError } from '@/lib/auth-config';
import { getPasswordStatus } from '@/lib/auth/password-status';

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
    username?: string;
    providers?: string[];
    passwordStatus?: 'configured' | 'not_configured' | 'unknown';
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
      let username: string | undefined = user.user_metadata?.username;

      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, username')
        .eq('id', user.id)
        .maybeSingle();

      if (profile?.username) {
        username = profile.username;
      } else {
        // Use the database repair function so the displayed handle is persisted,
        // normalized, and checked against the same unique index as signup.
        const { data: recoveredProfile, error: recoveryError } = await supabase.rpc(
          'fn_recover_user_profile',
          { p_user_id: user.id }
        );
        const recoveredUsername =
          recoveredProfile && typeof recoveredProfile === 'object'
            ? (recoveredProfile as { username?: unknown }).username
            : undefined;
        if (!recoveryError && typeof recoveredUsername === 'string') {
          username = recoveredUsername;
        }
      }

      if (profile?.display_name) {
        displayName = profile.display_name;
      } else if (!displayName && username) {
        displayName = username;
      }

      const providers: string[] = Array.isArray(user.app_metadata?.providers)
        ? (user.app_metadata.providers as string[])
        : user.app_metadata?.provider
          ? [user.app_metadata.provider as string]
          : [];

      const passwordStatus = getPasswordStatus(user.user_metadata);

      authenticatedUser = {
        id: user.id,
        email: user.email,
        displayName: displayName || undefined,
        username: username || undefined,
        providers,
        passwordStatus,
      };
    }
  } catch {
    authenticatedUser = null;
  }

  if (!authenticatedUser) {
    return <UnauthenticatedHome />;
  }

  return <TransactionAppShell user={authenticatedUser} />;
}
