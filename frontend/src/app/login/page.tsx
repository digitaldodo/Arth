import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { AuthForm } from './AuthForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

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

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] flex flex-col justify-between transition-colors">
      {/* Top Header Bar */}
      <header className="w-full max-w-5xl mx-auto px-4 py-6 flex items-center justify-between">
        <Link
          href="/"
          className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors inline-flex items-center gap-1.5 font-medium"
        >
          <span aria-hidden="true">&larr;</span> Back to Foundation
        </Link>
        <ThemeToggle />
      </header>

      {/* Main Centered Content Grid */}
      <main className="w-full max-w-5xl mx-auto px-4 py-4 md:py-8 my-auto">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Left Panel: Branding & Restrained CSS Ledger Mockup (hidden on small mobile) */}
          <div className="hidden md:flex md:col-span-6 lg:col-span-7 flex-col justify-between space-y-8 pr-0 lg:pr-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                  Arth
                </span>
                <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-xs bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                  Ledger Minimal
                </span>
              </div>
              <h1 className="text-xl lg:text-2xl font-semibold tracking-tight text-[var(--text-primary)] leading-snug">
                Disciplined personal finance engineered with mathematical rigor.
              </h1>
              <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed max-w-lg">
                Built on exact integer-paise calculations, PostgreSQL authoritative storage,
                and Swiss ledger clarity. Track cash flow, debts, and obligations without
                algorithmic clutter.
              </p>
            </div>

            {/* CSS Financial Ledger Illustration */}
            <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-lg p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--border-hairline)]">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-secondary)] font-semibold">
                    Live Ledger Snapshot
                  </span>
                </div>
                <span className="text-[11px] font-mono text-[var(--text-muted)]">
                  IST (Asia/Kolkata)
                </span>
              </div>

              {/* Sample Ledger Rows */}
              <div className="space-y-2.5 font-mono text-[12px]">
                <div className="flex items-center justify-between p-2 rounded-xs bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)]">
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-[10px] px-1.5 py-0.5 rounded-xs bg-[var(--income-bg)] text-[var(--income-fg)] border border-[var(--income-border)] uppercase tracking-wider font-sans font-semibold">
                      Income
                    </span>
                    <span className="truncate text-[var(--text-primary)]">
                      Client Retainer
                    </span>
                  </div>
                  <span className="font-semibold text-[var(--income-fg)] ml-2 shrink-0">
                    +₹85,000.00
                  </span>
                </div>

                <div className="flex items-center justify-between p-2 rounded-xs bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)]">
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-[10px] px-1.5 py-0.5 rounded-xs bg-[var(--expense-bg)] text-[var(--expense-fg)] border border-[var(--expense-border)] uppercase tracking-wider font-sans font-semibold">
                      Expense
                    </span>
                    <span className="truncate text-[var(--text-primary)]">
                      Cloud Infrastructure
                    </span>
                  </div>
                  <span className="font-semibold text-[var(--expense-fg)] ml-2 shrink-0">
                    -₹1,450.00
                  </span>
                </div>

                <div className="flex items-center justify-between p-2 rounded-xs bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)]">
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-[10px] px-1.5 py-0.5 rounded-xs bg-[var(--expense-bg)] text-[var(--expense-fg)] border border-[var(--expense-border)] uppercase tracking-wider font-sans font-semibold">
                      Expense
                    </span>
                    <span className="truncate text-[var(--text-primary)]">
                      Studio Rent
                    </span>
                  </div>
                  <span className="font-semibold text-[var(--expense-fg)] ml-2 shrink-0">
                    -₹24,000.00
                  </span>
                </div>
              </div>

              {/* Double-ruled Summary Row */}
              <div className="pt-2 border-t-2 border-double border-[var(--border-subtle)] flex items-center justify-between text-[12px] font-mono">
                <span className="text-[var(--text-secondary)] font-semibold uppercase tracking-wider text-[11px] font-sans">
                  Net Cash Flow
                </span>
                <span className="font-bold text-[var(--income-fg)]">
                  +₹59,550.00
                </span>
              </div>
            </div>

            {/* Architecture Protocol Badges */}
            <div className="pt-2 flex flex-wrap items-center gap-4 text-[11px] font-mono text-[var(--text-muted)]">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--border-strong)]" />
                <span>OAuth 2.0 PKCE</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--border-strong)]" />
                <span>HTTP-Only Cookies</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--border-strong)]" />
                <span>PostgreSQL RLS</span>
              </div>
            </div>
          </div>

          {/* Right Panel: Compact Form Card */}
          <div className="w-full md:col-span-6 lg:col-span-5">
            <div className="p-6 sm:p-8 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-hairline)] shadow-xs">
              <div className="mb-6 space-y-1">
                {/* Mobile-only branding display */}
                <div className="flex md:hidden items-center gap-2 mb-3">
                  <span className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
                    Arth
                  </span>
                  <span className="px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider rounded-xs bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                    Ledger Minimal
                  </span>
                </div>
                <h2 className="text-[17px] font-semibold tracking-tight text-[var(--text-primary)]">
                  Authentication
                </h2>
                <p className="text-[12px] text-[var(--text-secondary)]">
                  Sign in or create an account to access your personal ledger.
                </p>
              </div>

              {/* Interactive Auth Form */}
              <AuthForm initialError={error} />
            </div>
          </div>
        </div>
      </main>

      {/* Footer Notes */}
      <footer className="w-full max-w-5xl mx-auto px-4 py-6 text-center text-[12px] text-[var(--text-muted)]">
        Arth Financial Platform &middot; Phase 01O Production &middot; Swiss Ledger Minimal
      </footer>
    </div>
  );
}
