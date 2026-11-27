'use client';

import React from 'react';

/**
 * Calm, non-pulsing structural skeleton used only when no cached dashboard snapshot exists.
 * Avoids large glowing/shimmering blocks while preserving exact layout dimensions to minimize CLS.
 */
export function DashboardSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Preparing dashboard overview">
      {/* Date Range Selector Placeholder */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="h-7 w-16 bg-[var(--bg-surface-subtle)]/75 rounded-md shrink-0 border border-[var(--border-hairline)]/60"
          />
        ))}
      </div>

      {/* Summary Cards Placeholder */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-5">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="p-4 sm:p-5 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl space-y-2.5"
          >
            <div className="flex justify-between items-center">
              <div className="h-3 w-20 bg-[var(--bg-surface-subtle)] rounded-xs" />
              <div className="h-4 w-14 bg-[var(--bg-surface-subtle)] rounded-xs" />
            </div>
            <div className="h-6 w-28 bg-[var(--bg-surface-subtle)] rounded-xs" />
            <div className="h-2.5 w-24 bg-[var(--bg-surface-subtle)]/70 rounded-xs" />
          </div>
        ))}
      </div>

      {/* Breakdown & Recent Activity Placeholders */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        <div className="p-4 sm:p-5 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl space-y-3">
          <div className="h-4 w-32 bg-[var(--bg-surface-subtle)] rounded-xs" />
          <div className="h-2.5 w-full bg-[var(--bg-surface-subtle)] rounded-sm" />
          <div className="space-y-2 pt-1">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex justify-between py-1.5">
                <div className="h-3 w-24 bg-[var(--bg-surface-subtle)]/75 rounded-xs" />
                <div className="h-3 w-14 bg-[var(--bg-surface-subtle)]/75 rounded-xs" />
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 sm:p-5 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl space-y-3">
          <div className="h-4 w-32 bg-[var(--bg-surface-subtle)] rounded-xs" />
          <div className="h-2.5 w-full bg-[var(--bg-surface-subtle)] rounded-sm" />
          <div className="space-y-2 pt-1">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex justify-between py-1.5">
                <div className="h-3 w-20 bg-[var(--bg-surface-subtle)]/75 rounded-xs" />
                <div className="h-3 w-14 bg-[var(--bg-surface-subtle)]/75 rounded-xs" />
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 sm:p-5 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl space-y-3 md:col-span-2 lg:col-span-1">
          <div className="h-4 w-28 bg-[var(--bg-surface-subtle)] rounded-xs" />
          <div className="space-y-2 pt-1">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex justify-between py-1.5">
                <div className="h-3 w-28 bg-[var(--bg-surface-subtle)]/75 rounded-xs" />
                <div className="h-3 w-14 bg-[var(--bg-surface-subtle)]/75 rounded-xs" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
