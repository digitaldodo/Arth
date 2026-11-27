import React from 'react';
import { ArthLogo } from '@/components/brand/ArthLogo';
import { DashboardSkeleton } from '@/features/dashboard/DashboardSkeleton';

/**
 * Non-blocking App Shell skeleton displayed during Next.js initial document streaming or page transitions.
 * Matches the two-row mobile header and bottom bar structure to eliminate layout shift.
 */
export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading SpendSense"
      className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] pb-[max(6rem,calc(5rem+env(safe-area-inset-bottom)))] lg:pb-12 transition-colors select-none"
    >
      {/* Top Application Header Skeleton */}
      <header className="sticky top-0 z-30 glass-nav border-b border-[var(--border-hairline)]">
        <div className="max-w-7xl 2xl:max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-2.5 sm:py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            <ArthLogo
              variant="full"
              className="h-6 sm:h-7 w-auto text-[var(--text-primary)] opacity-90"
            />
            <span className="hidden min-[350px]:inline-flex text-[10px] sm:text-[11px] uppercase tracking-wider font-semibold px-1.5 sm:px-2 py-0.5 rounded-xs bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] border border-[var(--border-subtle)] shrink-0">
              Ledger
            </span>
          </div>
          <div className="h-[34px] w-20 rounded-full bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)]" />
        </div>
        {/* Row 2 Mobile/Tablet Navigation Rail Placeholder */}
        <div className="lg:hidden border-t border-[var(--border-hairline)]/70 px-4 sm:px-6 py-1.5">
          <div className="flex items-center gap-2">
            <div className="h-7 w-16 rounded-md bg-[var(--bg-surface-subtle)]" />
            <div className="h-7 w-24 rounded-md bg-[var(--bg-surface-subtle)]" />
            <div className="h-7 w-20 rounded-md bg-[var(--bg-surface-subtle)]" />
          </div>
        </div>
      </header>

      {/* Main Dashboard Skeleton */}
      <main className="max-w-7xl 2xl:max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 pt-5 sm:pt-7">
        <DashboardSkeleton />
      </main>

      {/* Bottom Mobile Navigation Bar Skeleton */}
      <nav
        aria-hidden="true"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 glass-bottom-nav border-t border-[var(--border-hairline)] px-3 pt-1.5 pb-[max(0.6rem,env(safe-area-inset-bottom))] flex justify-around items-center"
      >
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1 py-1 px-3">
            <div className="w-5 h-5 rounded-md bg-[var(--bg-surface-subtle)]" />
            <div className="w-8 h-2 rounded-xs bg-[var(--bg-surface-subtle)]" />
          </div>
        ))}
      </nav>
    </div>
  );
}
