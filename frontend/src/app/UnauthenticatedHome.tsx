import Link from 'next/link';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { ArthLogo } from '@/components/brand/ArthLogo';

export function UnauthenticatedHome() {
  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] flex flex-col justify-between transition-colors">
      {/* Slim Header */}
      <header className="w-full max-w-4xl mx-auto px-6 py-5 flex items-center justify-between border-b border-[var(--border-hairline)]">
        <Link href="/" className="flex items-center gap-2 group">
          <ArthLogo
            variant="full"
            className="h-6 w-auto text-[var(--text-primary)] group-hover:opacity-90 transition-opacity"
          />
          <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-[2px] bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] border border-[var(--border-hairline)]">
            Ledger
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-[13px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors px-2.5 py-1.5 rounded-[3px]"
          >
            Sign In
          </Link>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content Area */}
      <main className="w-full max-w-2xl mx-auto px-6 my-auto py-12 sm:py-16">
        <div className="space-y-6">
          <div className="text-[11px] font-mono uppercase tracking-widest text-[var(--text-muted)]">
            Personal Financial Ledger
          </div>

          <h1 className="text-2xl sm:text-3xl lg:text-[34px] font-semibold tracking-[-0.02em] text-[var(--text-primary)] leading-[1.25]">
            Track personal finances with clarity and precision.
          </h1>

          <p className="text-[14px] sm:text-[15px] text-[var(--text-secondary)] leading-relaxed max-w-lg">
            An intentional, disciplined system engineered for manual transaction capture,
            authoritative record-keeping, and exact integer-paise calculations.
          </p>

          <div className="pt-2">
            <Link
              href="/login"
              className="w-full sm:w-auto inline-flex items-center justify-center h-10 sm:h-9 px-6 rounded-[3px] bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] text-[13px] font-medium hover:bg-[var(--action-primary-hover)] transition-colors shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2"
            >
              Sign In &rarr;
            </Link>
          </div>

          {/* Subtle ledger-inspired visual treatment using typography and hairline rules */}
          <div className="pt-8 mt-8 border-t border-[var(--border-hairline)] hidden sm:grid grid-cols-3 gap-6 text-[12px] font-mono text-[var(--text-muted)]">
            <div>
              <span className="block text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-sans font-medium mb-1">
                Method
              </span>
              <span>Manual Capture</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-sans font-medium mb-1">
                Precision
              </span>
              <span>Exact Integer Paise</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-sans font-medium mb-1">
                Storage
              </span>
              <span>Authoritative Ledger</span>
            </div>
          </div>
        </div>
      </main>

      {/* Slim Minimal Footer */}
      <footer className="w-full max-w-4xl mx-auto px-6 py-5 border-t border-[var(--border-hairline)] flex items-center justify-between text-[11px] font-mono text-[var(--text-muted)]">
        <span>Arth &middot; Ledger Minimal</span>
        <span>IST (Asia/Kolkata)</span>
      </footer>
    </div>
  );
}
