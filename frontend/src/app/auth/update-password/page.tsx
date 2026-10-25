import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { ArthLogo } from '@/components/brand/ArthLogo';
import { UpdatePasswordForm } from './UpdatePasswordForm';

export const dynamic = 'force-dynamic';

export default async function UpdatePasswordPage() {
  let user = null;

  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    user = null;
  }

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] flex flex-col justify-between transition-colors">
      {/* Top Header Bar */}
      <header className="w-full max-w-[420px] mx-auto px-4 py-5 flex items-center justify-between">
        <Link
          href="/"
          className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors inline-flex items-center gap-1.5 font-medium"
        >
          <span aria-hidden="true">&larr;</span> Back
        </Link>
        <ThemeToggle />
      </header>

      {/* Main Form Container */}
      <main className="w-full max-w-[420px] mx-auto px-4 my-auto py-6">
        <div className="p-6 sm:p-7 rounded-[4px] bg-[var(--bg-surface)] border border-[var(--border-hairline)] shadow-xs space-y-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-1.5">
              <ArthLogo
                variant="full"
                className="h-6 sm:h-7 w-auto text-[var(--text-primary)]"
              />
              <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-[2px] bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] border border-[var(--border-hairline)]">
                Ledger
              </span>
            </div>
            <h1 className="text-[18px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
              Update password
            </h1>
            <p className="text-[12px] text-[var(--text-secondary)]">
              {user
                ? `Enter a new secure password for ${user.email}.`
                : 'Session verification in progress.'}
            </p>
          </div>

          {user ? (
            <UpdatePasswordForm userEmail={user.email || ''} />
          ) : (
            <div className="space-y-4">
              <div
                role="alert"
                className="p-4 rounded-md bg-[var(--status-error-bg)] border border-[var(--expense-border)] text-[var(--status-error-fg)] text-[12px] space-y-2"
              >
                <div className="font-semibold text-[13px]">
                  Recovery Session Expired or Invalid
                </div>
                <p className="opacity-90 leading-relaxed">
                  The password recovery link you used is either invalid, has expired, or has
                  already been used. For your security, please request a new recovery link.
                </p>
              </div>

              <div className="pt-2">
                <Link
                  href="/login"
                  className="w-full py-2.5 px-4 rounded-md bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] text-[13px] font-medium hover:bg-[var(--action-primary-hover)] transition-colors flex items-center justify-center gap-2"
                >
                  Return to Sign In &rarr;
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer Notes */}
      <footer className="w-full max-w-[420px] mx-auto px-4 py-5 text-center text-[11px] font-mono text-[var(--text-muted)]">
        Arth &middot; Ledger Minimal
      </footer>
    </div>
  );
}
