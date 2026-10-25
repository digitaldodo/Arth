import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
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
      <header className="w-full max-w-xl mx-auto px-4 py-6 flex items-center justify-between">
        <Link
          href="/"
          className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors inline-flex items-center gap-1.5 font-medium"
        >
          <span aria-hidden="true">&larr;</span> Back to Foundation
        </Link>
        <ThemeToggle />
      </header>

      {/* Main Form Container */}
      <main className="w-full max-w-xl mx-auto px-4 py-8 my-auto">
        <div className="p-6 sm:p-8 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-hairline)] shadow-xs space-y-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
                Arth
              </span>
              <span className="px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider rounded-xs bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                Recovery
              </span>
            </div>
            <h1 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
              Update Your Password
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
      <footer className="w-full max-w-xl mx-auto px-4 py-6 text-center text-[12px] text-[var(--text-muted)]">
        Arth Financial Platform &middot; Security Recovery
      </footer>
    </div>
  );
}
