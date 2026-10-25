import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { sanitizeRedirectPath, formatAuthError } from '@/lib/auth-config';
import { AuthForm } from './AuthForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    error_description?: string;
    code?: string;
    next?: string;
  }>;
}) {
  const params = await searchParams;

  // If authorization code landed on login page, forward immediately to callback handler
  if (params.code) {
    const nextPath = sanitizeRedirectPath(params.next, '/');
    redirect(
      `/auth/callback?code=${encodeURIComponent(params.code)}&next=${encodeURIComponent(nextPath)}`
    );
  }

  // If user is already authenticated with active session, redirect to home
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      redirect('/');
    }
  } catch {
    // Continue rendering login form if auth check fails or no session
  }

  const resolvedError = params.error
    ? formatAuthError(params.error, params.error_description)
    : undefined;

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] flex flex-col justify-between transition-colors">
      {/* Slim Header Bar */}
      <header className="w-full max-w-[420px] mx-auto px-4 py-5 flex items-center justify-between">
        <Link
          href="/"
          className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors inline-flex items-center gap-1.5 font-medium"
        >
          <span aria-hidden="true">&larr;</span> Back
        </Link>
        <ThemeToggle />
      </header>

      {/* Main Single Centered Authentication Panel */}
      <main className="w-full max-w-[420px] mx-auto px-4 my-auto py-6">
        <div className="p-6 sm:p-7 rounded-[4px] bg-[var(--bg-surface)] border border-[var(--border-hairline)] shadow-xs">
          <AuthForm initialError={resolvedError} />
        </div>
      </main>

      {/* Subtle Minimal Footer */}
      <footer className="w-full max-w-[420px] mx-auto px-4 py-5 text-center text-[11px] font-mono text-[var(--text-muted)]">
        Arth &middot; Ledger Minimal
      </footer>
    </div>
  );
}
