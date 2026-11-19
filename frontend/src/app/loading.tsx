import React from 'react';
import { ArthLogo } from '@/components/brand/ArthLogo';
import { DashboardSkeleton } from '@/features/dashboard/DashboardSkeleton';

/**
 * Non-blocking App Shell skeleton displayed during Next.js initial document streaming or page transitions.
 * Eliminates full-screen blocking splash screens and renders the application skeleton immediately.
 */
export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading SpendSense"
      className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] pb-[max(6rem,calc(5rem+env(safe-area-inset-bottom)))] md:pb-12 transition-colors select-none"
    >
      {/* Top Application Header Skeleton */}
      <header className="sticky top-0 z-30 bg-[var(--bg-canvas)]/90 backdrop-blur-xs border-b border-[var(--border-hairline)] px-4 sm:px-6 lg:px-8 py-3 sm:py-3.5">
        <div className="max-w-7xl 2xl:max-w-[1440px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="flex items-center gap-2 sm:gap-2.5">
              <ArthLogo
                variant="full"
                className="h-6 sm:h-7 w-auto max-w-[110px] sm:max-w-[130px] text-[var(--text-primary)] opacity-85"
              />
              <span className="text-[10px] sm:text-[11px] uppercase tracking-wider font-semibold px-1.5 sm:px-2 py-0.5 rounded-xs bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] border border-[var(--border-subtle)] shrink-0">
                Ledger
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Dashboard Skeleton */}
      <main className="max-w-7xl 2xl:max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6">
        <DashboardSkeleton />
      </main>

      {/* Bottom Mobile Navigation Bar Skeleton */}
      <nav
        aria-hidden="true"
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-[var(--bg-canvas)]/95 backdrop-blur-md border-t border-[var(--border-hairline)] px-3 py-2 flex justify-around items-center"
      >
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5 py-1 px-3">
            <div className="w-5 h-5 rounded-md bg-[var(--bg-surface-subtle)] animate-pulse" />
            <div className="w-8 h-2 rounded-xs bg-[var(--bg-surface-subtle)] animate-pulse" />
          </div>
        ))}
      </nav>
    </div>
  );
}
