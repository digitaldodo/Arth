import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  async function handleGoogleSignIn() {
    'use server';

    let redirectUrl: string | undefined;

    try {
      const supabase = await createClient();
      const headersList = await headers();
      const host = headersList.get('host') || 'localhost:3000';
      const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
      const origin = `${protocol}://${host}`;

      const { data, error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${origin}/auth/callback?next=/`,
        },
      });

      if (authError) {
        redirectUrl = `/login?error=${encodeURIComponent(authError.message)}`;
      } else if (data.url) {
        redirectUrl = data.url;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown OAuth error';
      redirectUrl = `/login?error=${encodeURIComponent(message)}`;
    }

    if (redirectUrl) {
      redirect(redirectUrl);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] px-4 py-12 flex flex-col justify-between transition-colors">
      {/* Header bar */}
      <div className="max-w-[420px] w-full mx-auto flex items-center justify-between pb-6">
        <Link
          href="/"
          className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors inline-flex items-center gap-1.5"
        >
          <span aria-hidden="true">&larr;</span> Back to Foundation
        </Link>
        <ThemeToggle />
      </div>

      {/* Main card */}
      <div className="max-w-[420px] w-full mx-auto p-6 md:p-8 rounded-[4px] bg-[var(--bg-surface)] border border-[var(--border-hairline)] space-y-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
              Arth
            </h1>
            <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] rounded-[2px] bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
              Ledger Minimal
            </span>
          </div>
          <p className="text-[13px] text-[var(--text-secondary)]">
            Sign in to access your ledger and synchronized financial records.
          </p>
        </div>

        {/* Error notification banner */}
        {error && (
          <div
            role="alert"
            className="p-3 rounded-[3px] bg-[var(--status-error-bg)] border border-[var(--expense-border)] text-[var(--status-error-fg)] text-[12px] space-y-1"
          >
            <div className="font-medium">Authentication Notice</div>
            <p className="opacity-90">{decodeURIComponent(error)}</p>
          </div>
        )}

        {/* OAuth Action */}
        <form action={handleGoogleSignIn} className="space-y-3">
          <button
            type="submit"
            className="w-full py-2.5 px-4 rounded-[3px] bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] text-[13px] font-medium hover:bg-[var(--action-primary-hover)] transition-colors flex items-center justify-center gap-2.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2"
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                fill="#EA4335"
              />
            </svg>
            <span>Continue with Google</span>
          </button>
        </form>

        <div className="pt-2 border-t border-[var(--border-hairline)] space-y-2 text-[11px] text-[var(--text-muted)]">
          <div className="flex items-center justify-between">
            <span>Protocol</span>
            <span className="font-mono">OAuth 2.0 PKCE</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Session Storage</span>
            <span className="font-mono">HTTP-only Secure Cookies</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Identity Provider</span>
            <span className="font-mono">Supabase Auth</span>
          </div>
        </div>
      </div>

      {/* Footer notes */}
      <footer className="max-w-[420px] w-full mx-auto pt-6 text-center text-[12px] text-[var(--text-muted)]">
        Arth Financial Platform &middot; Phase 01H
      </footer>
    </main>
  );
}
