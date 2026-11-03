'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArthLogo } from '@/components/brand/ArthLogo';
import { getCachedPwaUser, type CachedPwaUser } from '@/lib/offline-db';
import { TransactionAppShell } from '@/features/transactions/TransactionAppShell';

export function UnauthenticatedHome() {
  const [cachedUser, setCachedUser] = useState<CachedPwaUser | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const user = await getCachedPwaUser();
        if (!cancelled && user) {
          setCachedUser(user);
        }
      } catch {
        // Continue to unauthenticated landing page
      } finally {
        if (!cancelled) {
          setIsChecking(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (cachedUser) {
    return <TransactionAppShell user={cachedUser} />;
  }

  if (isChecking) {
    return (
      <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] flex items-center justify-center">
        <div className="text-center space-y-3">
          <ArthLogo variant="full" className="h-7 w-auto mx-auto text-[var(--text-primary)] opacity-80" />
          <p className="text-xs font-mono text-[var(--text-muted)]">Restoring session…</p>
        </div>
      </div>
    );
  }

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
            href="/download"
            className="text-[13px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors px-2.5 py-1.5 rounded-[3px] flex items-center gap-1.5"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Download App</span>
          </Link>
          <Link
            href="/login"
            className="text-[13px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors px-2.5 py-1.5 rounded-[3px]"
          >
            Sign In
          </Link>
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
      <footer className="w-full max-w-4xl mx-auto px-6 py-5 border-t border-[var(--border-hairline)] flex flex-wrap items-center justify-between gap-4 text-[11px] font-mono text-[var(--text-muted)]">
        <div className="flex items-center gap-4">
          <span>Arth &middot; Ledger Minimal</span>
          <Link
            href="/download"
            className="hover:text-[var(--text-primary)] underline-offset-4 hover:underline transition-colors"
          >
            Android App
          </Link>
        </div>
        <span>IST (Asia/Kolkata)</span>
      </footer>
    </div>
  );
}
