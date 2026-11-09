'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArthLogo } from '@/components/brand/ArthLogo';
import { getCachedPwaUser, clearCachedPwaUserContext, type CachedPwaUser } from '@/lib/offline-db';
import { TransactionAppShell } from '@/features/transactions/TransactionAppShell';
import { isAndroidPhone } from '@/lib/device';

export function UnauthenticatedHome() {
  const [cachedUser, setCachedUser] = useState<CachedPwaUser | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    setIsAndroid(isAndroidPhone());
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
        const user = await getCachedPwaUser();
        if (!cancelled && user) {
          if (isOffline) {
            // In offline PWA mode, hydrate local session so ledger operations remain accessible
            setCachedUser(user);
          } else {
            // Online landing reached without active server session: clear stale context to prevent false session restoration
            void clearCachedPwaUserContext();
          }
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
      {/* Header: Crisp, aligned layout on desktop, conditional touch row for Android phones */}
      <header className="w-full max-w-7xl 2xl:max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-4 sm:py-5 border-b border-[var(--border-hairline)] space-y-3 sm:space-y-0">
        {/* Row 1: Brand Logo & Desktop Navigation */}
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <ArthLogo
              variant="full"
              className="h-6 sm:h-7 w-auto text-[var(--text-primary)] group-hover:opacity-90 transition-opacity"
            />
            <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-[2px] bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] border border-[var(--border-hairline)] select-none">
              Ledger
            </span>
          </Link>

          {/* Desktop & Standard Actions */}
          <div className={`${isAndroid ? 'hidden md:flex' : 'flex'} items-center gap-3`}>
            <Link
              href="/login"
              className="text-[13px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors px-3 py-1.5 rounded-[3px] whitespace-nowrap cursor-pointer"
            >
              Log In
            </Link>
            <Link
              href="/login?mode=signup"
              className="text-[13px] font-medium text-[var(--action-primary-fg)] bg-[var(--action-primary-bg)] hover:bg-[var(--action-primary-hover)] transition-colors px-3.5 py-1.5 rounded-[3px] shadow-2xs whitespace-nowrap cursor-pointer"
            >
              Sign Up
            </Link>
          </div>
        </div>

        {/* Row 2: Android Phone Actions (rendered ONLY on Android smartphones on mobile viewports) */}
        {isAndroid && (
          <div className="md:hidden grid grid-cols-3 gap-2 pt-2 border-t border-[var(--border-hairline)]">
            <a
              href="/api/android/download"
              download="Arth.apk"
              className="h-9 px-2 text-[11px] sm:text-xs font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-[4px] hover:bg-[var(--action-primary-hover)] transition-all flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer whitespace-nowrap min-w-0"
              title="Download Arth Android APK directly"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="shrink-0"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span className="truncate">Download App</span>
            </a>

            <Link
              href="/login?mode=signup"
              className="h-9 px-2 text-[11px] sm:text-xs font-medium bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-[4px] hover:bg-[var(--bg-surface-subtle)] transition-all flex items-center justify-center shadow-2xs cursor-pointer whitespace-nowrap min-w-0"
            >
              <span className="truncate">Sign Up</span>
            </Link>

            <Link
              href="/login"
              className="h-9 px-2 text-[11px] sm:text-xs font-medium bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-hairline)] rounded-[4px] hover:bg-[var(--bg-surface-subtle)] transition-all flex items-center justify-center cursor-pointer whitespace-nowrap min-w-0"
            >
              <span className="truncate">Log In</span>
            </Link>
          </div>
        )}
      </header>

      {/* Main Content: Wide, Balanced 2-Column Hero Grid + Value Pillars */}
      <main className="w-full max-w-7xl 2xl:max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 my-auto py-10 sm:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 xl:gap-16 items-center">
          {/* Left Column: Hero Copy & Actions */}
          <div className="lg:col-span-7 space-y-6 sm:space-y-8">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-[2px] bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] text-[11px] font-mono uppercase tracking-wider text-[var(--text-secondary)]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span>Personal Financial Ledger</span>
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-[44px] xl:text-[48px] font-semibold tracking-[-0.03em] text-[var(--text-primary)] leading-[1.14]">
                Track personal finances with clarity and precision.
              </h1>

              <p className="text-base sm:text-lg text-[var(--text-secondary)] leading-relaxed max-w-2xl pt-1">
                An intentional personal ledger for recording transactions, understanding spending and maintaining accurate financial records.
              </p>
            </div>

            {/* Primary Registration and Sign In Actions */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
              <Link
                href="/login?mode=signup"
                className="inline-flex items-center justify-center h-11 px-6 rounded-[3px] bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] text-[14px] font-semibold hover:bg-[var(--action-primary-hover)] transition-colors shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 cursor-pointer"
              >
                Get Started &rarr;
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center h-11 px-5 rounded-[3px] bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-[14px] font-medium hover:bg-[var(--bg-surface-subtle)] transition-colors cursor-pointer"
              >
                Log In
              </Link>
            </div>

            {/* Architectural Highlights / Ledger Specification */}
            <div className="pt-6 border-t border-[var(--border-hairline)] grid grid-cols-2 sm:grid-cols-4 gap-4 text-[12px] font-mono text-[var(--text-muted)]">
              <div>
                <span className="block text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-sans font-medium mb-1">
                  Method
                </span>
                <span className="text-[var(--text-primary)] font-medium">Manual Capture</span>
              </div>
              <div>
                <span className="block text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-sans font-medium mb-1">
                  Precision
                </span>
                <span className="text-[var(--text-primary)] font-medium">Integer Paise</span>
              </div>
              <div>
                <span className="block text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-sans font-medium mb-1">
                  Storage
                </span>
                <span className="text-[var(--text-primary)] font-medium">PostgreSQL RLS</span>
              </div>
              <div>
                <span className="block text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-sans font-medium mb-1">
                  Privacy
                </span>
                <span className="text-[var(--text-primary)] font-medium">Zero Scrapers</span>
              </div>
            </div>
          </div>

          {/* Right Column: Genuine Ledger Minimal Interface Preview (Zero fake numbers, authentic structure) */}
          <div className="lg:col-span-5">
            <div className="rounded-[8px] bg-[var(--bg-surface)] border border-[var(--border-hairline)] shadow-xs overflow-hidden">
              {/* Preview Window Top Header */}
              <div className="px-4 py-3 bg-[var(--bg-surface-subtle)] border-b border-[var(--border-hairline)] flex items-center justify-between text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-[11px] font-semibold text-[var(--text-primary)] uppercase tracking-wider">
                    Ledger Architecture
                  </span>
                </div>
                <span className="text-[11px] text-[var(--text-muted)]">Asia/Kolkata (IST)</span>
              </div>

              {/* Account Balances Preview */}
              <div className="p-4 sm:p-5 border-b border-[var(--border-hairline)] space-y-3">
                <div className="flex items-center justify-between text-[11px] font-mono text-[var(--text-muted)] uppercase tracking-wider">
                  <span>Balance Segregation</span>
                  <span className="text-[var(--income-fg)] font-semibold">Active Book</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-[4px] bg-[var(--bg-canvas)] border border-[var(--border-hairline)] space-y-1">
                    <span className="text-[10px] font-sans font-semibold text-[var(--text-muted)] uppercase tracking-wider block">
                      Cash Account
                    </span>
                    <span className="text-sm font-mono font-semibold text-[var(--text-primary)] block">
                      Physical Wallet
                    </span>
                    <span className="text-[10px] font-mono text-[var(--text-muted)]">
                      Instant reconciliation
                    </span>
                  </div>
                  <div className="p-3 rounded-[4px] bg-[var(--bg-canvas)] border border-[var(--border-hairline)] space-y-1">
                    <span className="text-[10px] font-sans font-semibold text-[var(--text-muted)] uppercase tracking-wider block">
                      Online Account
                    </span>
                    <span className="text-sm font-mono font-semibold text-[var(--text-primary)] block">
                      Digital &amp; UPI
                    </span>
                    <span className="text-[10px] font-mono text-[var(--text-muted)]">
                      Dual-entry tracking
                    </span>
                  </div>
                </div>
              </div>

              {/* Necessity Classification Breakdown Bar */}
              <div className="p-4 sm:p-5 border-b border-[var(--border-hairline)] space-y-2">
                <div className="flex items-center justify-between text-[11px] font-mono text-[var(--text-muted)] uppercase tracking-wider">
                  <span>Necessity Tiers</span>
                  <span>100% Classified</span>
                </div>
                <div className="h-2 rounded-full bg-[var(--bg-canvas)] overflow-hidden flex">
                  <div className="bg-blue-600 h-full w-[60%]" title="Essential" />
                  <div className="bg-amber-500 h-full w-[25%]" title="Optional" />
                  <div className="bg-purple-600 h-full w-[15%]" title="Luxury" />
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-secondary)] pt-0.5">
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600" /> Essential
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Optional
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-600" /> Luxury
                  </span>
                </div>
              </div>

              {/* Sample Tabular Ledger Rows (Structure representation) */}
              <div className="p-4 sm:p-5 space-y-2.5 font-mono text-xs">
                <div className="grid grid-cols-12 text-[10px] text-[var(--text-muted)] uppercase tracking-wider pb-1 border-b border-[var(--border-hairline)]">
                  <span className="col-span-4">Category</span>
                  <span className="col-span-3">Tier</span>
                  <span className="col-span-2">Mode</span>
                  <span className="col-span-3 text-right">Accounting</span>
                </div>

                <div className="grid grid-cols-12 items-center text-[11px] py-1">
                  <span className="col-span-4 text-[var(--text-primary)] font-sans font-medium truncate">Groceries &amp; Food</span>
                  <span className="col-span-3 text-blue-700 dark:text-blue-400 text-[10px]">Essential</span>
                  <span className="col-span-2 text-[var(--text-muted)] text-[10px]">Cash</span>
                  <span className="col-span-3 text-right text-[var(--text-secondary)] font-mono tabular-nums">Exact Paise</span>
                </div>

                <div className="grid grid-cols-12 items-center text-[11px] py-1">
                  <span className="col-span-4 text-[var(--text-primary)] font-sans font-medium truncate">Electricity &amp; Power</span>
                  <span className="col-span-3 text-blue-700 dark:text-blue-400 text-[10px]">Essential</span>
                  <span className="col-span-2 text-[var(--text-muted)] text-[10px]">Online</span>
                  <span className="col-span-3 text-right text-[var(--text-secondary)] font-mono tabular-nums">Exact Paise</span>
                </div>

                <div className="grid grid-cols-12 items-center text-[11px] py-1">
                  <span className="col-span-4 text-[var(--text-primary)] font-sans font-medium truncate">Books &amp; Tools</span>
                  <span className="col-span-3 text-amber-700 dark:text-amber-400 text-[10px]">Optional</span>
                  <span className="col-span-2 text-[var(--text-muted)] text-[10px]">Online</span>
                  <span className="col-span-3 text-right text-[var(--text-secondary)] font-mono tabular-nums">Exact Paise</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Core Value Pillars: 4-Column Responsive Grid */}
        <div className="mt-16 pt-12 border-t border-[var(--border-hairline)]">
          <div className="text-[11px] font-mono uppercase tracking-widest text-[var(--text-muted)] mb-8">
            Core Ledger System
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="space-y-2.5">
              <div className="w-7 h-7 rounded-[3px] bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] flex items-center justify-center text-xs font-mono text-[var(--text-primary)]">
                01
              </div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Intentional Manual Capture
              </h3>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Log transactions directly at the point of spend. Cultivates authentic mindfulness without brittle screen scrapers or banking API lock-in.
              </p>
            </div>

            <div className="space-y-2.5">
              <div className="w-7 h-7 rounded-[3px] bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] flex items-center justify-center text-xs font-mono text-[var(--text-primary)]">
                02
              </div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Strict Integer Arithmetic
              </h3>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Financial balances and transactions stored strictly in whole paise in PostgreSQL. Floating-point rounding errors are architecturally eliminated.
              </p>
            </div>

            <div className="space-y-2.5">
              <div className="w-7 h-7 rounded-[3px] bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] flex items-center justify-center text-xs font-mono text-[var(--text-primary)]">
                03
              </div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Three-Tier Necessity
              </h3>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Classify expenses into Essential, Optional, or Luxury tiers. Immediately understand your true baseline cost of living versus discretionary lifestyle.
              </p>
            </div>

            <div className="space-y-2.5">
              <div className="w-7 h-7 rounded-[3px] bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] flex items-center justify-center text-xs font-mono text-[var(--text-primary)]">
                04
              </div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Sovereignty &amp; Privacy
              </h3>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Your financial records belong exclusively to you. Secured by PostgreSQL Row-Level Security, client-side biometrics, and zero third-party telemetry.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Slim Minimal Aligned Footer */}
      <footer className="w-full max-w-7xl 2xl:max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-5 border-t border-[var(--border-hairline)] flex flex-wrap items-center justify-between gap-4 text-[11px] font-mono text-[var(--text-muted)]">
        <div className="flex items-center gap-4">
          <span>Arth &middot; Ledger Minimal</span>
          <Link
            href="/download"
            className="hover:text-[var(--text-primary)] underline-offset-4 hover:underline transition-colors"
          >
            Android App
          </Link>
        </div>
        <span>Confidential &amp; Sovereign</span>
        <span>IST (Asia/Kolkata)</span>
      </footer>
    </div>
  );
}
