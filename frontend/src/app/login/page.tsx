import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { ArthLogo } from '@/components/brand/ArthLogo';
import { sanitizeRedirectPath, formatAuthError } from '@/lib/auth-config';
import { AuthForm } from './AuthForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    error_description?: string;
    message?: string;
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

  let resolvedMessage: string | undefined = undefined;
  if (params.message === 'account_deleted') {
    resolvedMessage =
      'Your account and all associated financial records have been permanently deleted.';
  } else if (params.message) {
    resolvedMessage = params.message;
  }

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] flex flex-col justify-between transition-colors">
      {/* Responsive Header Bar */}
      <header className="w-full max-w-5xl 2xl:max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6 flex items-center justify-between">
        <Link
          href="/"
          className="text-xs sm:text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors inline-flex items-center gap-2 font-medium cursor-pointer"
        >
          <span aria-hidden="true">&larr;</span> Back to Home
        </Link>
        <ThemeToggle />
      </header>

      {/* Main Authentication Section: 2-column on desktop, 1-column on mobile */}
      <main className="w-full max-w-5xl 2xl:max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 my-auto py-6 sm:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-center">
          {/* Left Column: Product Branding & Ledger Minimal Design Showcase (Visible on lg+) */}
          <div className="hidden lg:flex lg:col-span-6 flex-col justify-center space-y-8 pr-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <ArthLogo
                  variant="full"
                  className="h-8 sm:h-9 w-auto text-[var(--text-primary)]"
                />
                <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-[2px] bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] border border-[var(--border-hairline)]">
                  Ledger Minimal
                </span>
              </div>
              <h2 className="text-3xl xl:text-4xl font-bold tracking-tight text-[var(--text-primary)] leading-[1.15]">
                An intentional personal ledger designed for clarity and precision.
              </h2>
              <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed pt-1">
                Disciplined tracking without financial noise. Built for individuals who demand exact accounting, zero telemetry, and complete data privacy.
              </p>
            </div>

            {/* Architectural Highlights */}
            <div className="space-y-4 pt-2">
              <div className="flex items-start gap-3.5">
                <div className="w-6 h-6 rounded-xs bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] flex items-center justify-center text-xs font-mono text-[var(--text-primary)] shrink-0 mt-0.5">
                  ₹
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    Integer Accounting
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    Financial amounts stored strictly in whole paise to eliminate floating-point rounding errors.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <div className="w-6 h-6 rounded-xs bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] flex items-center justify-center text-xs font-mono text-[var(--text-primary)] shrink-0 mt-0.5">
                  ⚖
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    Cash Flow & People Ledger
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    Real-time categorization, necessity analysis, and debt tracking kept strictly separated.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <div className="w-6 h-6 rounded-xs bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] flex items-center justify-center text-xs font-mono text-[var(--text-primary)] shrink-0 mt-0.5">
                  🔒
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    Zero-Knowledge Privacy
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    Strict PostgreSQL row-level security and verified JWT tokens protect your ledger.
                  </p>
                </div>
              </div>
            </div>

            {/* Subtle Visual Ledger Preview */}
            <div className="p-4 rounded-[4px] bg-[var(--bg-surface)] border border-[var(--border-hairline)] space-y-2.5 font-mono text-xs">
              <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] border-b border-[var(--border-hairline)] pb-1.5 uppercase tracking-wider">
                <span>Date</span>
                <span>Category</span>
                <span className="text-right">Amount (INR)</span>
              </div>
              <div className="flex items-center justify-between text-xs text-[var(--text-primary)]">
                <span className="text-[var(--text-muted)]">2026-10-25</span>
                <span>Salary / Consulting</span>
                <span className="text-[var(--income-fg)] font-semibold tabular-nums">+₹1,25,000.00</span>
              </div>
              <div className="flex items-center justify-between text-xs text-[var(--text-primary)]">
                <span className="text-[var(--text-muted)]">2026-10-25</span>
                <span>Groceries & Kitchen</span>
                <span className="text-rose-700 dark:text-rose-400 font-semibold tabular-nums">-₹4,250.00</span>
              </div>
            </div>
          </div>

          {/* Right Column: Authentication Card Form */}
          <div className="w-full max-w-[440px] mx-auto lg:max-w-none lg:col-span-6">
            <div className="p-6 sm:p-8 rounded-[6px] bg-[var(--bg-surface)] border border-[var(--border-hairline)] shadow-xs">
              <AuthForm initialError={resolvedError} initialMessage={resolvedMessage} />
            </div>
          </div>
        </div>
      </main>

      {/* Subtle Minimal Footer */}
      <footer className="w-full max-w-5xl 2xl:max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-5 text-center text-xs font-mono text-[var(--text-muted)]">
        Arth &middot; Ledger Minimal &middot; Confidential &amp; Sovereign
      </footer>
    </div>
  );
}
