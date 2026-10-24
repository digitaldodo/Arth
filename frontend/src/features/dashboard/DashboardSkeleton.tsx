'use client';

import React from 'react';

export function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Date Range Selector Skeleton */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="h-7 w-18 bg-[var(--bg-surface-subtle)] rounded-md shrink-0"
          />
        ))}
      </div>

      {/* Summary Cards Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="p-4 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl space-y-3"
          >
            <div className="flex justify-between items-center">
              <div className="h-3 w-20 bg-[var(--bg-surface-subtle)] rounded-sm" />
              <div className="h-4 w-14 bg-[var(--bg-surface-subtle)] rounded-sm" />
            </div>
            <div className="h-7 w-32 bg-[var(--bg-surface-subtle)] rounded-sm" />
            <div className="h-2.5 w-24 bg-[var(--bg-surface-subtle)] rounded-sm" />
          </div>
        ))}
      </div>

      {/* Spending Composition Skeleton */}
      <div className="p-5 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl space-y-4">
        <div className="h-4 w-36 bg-[var(--bg-surface-subtle)] rounded-sm" />
        <div className="h-3 w-full bg-[var(--bg-surface-subtle)] rounded-md" />
        <div className="space-y-2 pt-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex justify-between py-2">
              <div className="h-3 w-28 bg-[var(--bg-surface-subtle)] rounded-sm" />
              <div className="h-3 w-16 bg-[var(--bg-surface-subtle)] rounded-sm" />
            </div>
          ))}
        </div>
      </div>

      {/* Recent Activity Skeleton */}
      <div className="p-5 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl space-y-3">
        <div className="flex justify-between">
          <div className="h-4 w-28 bg-[var(--bg-surface-subtle)] rounded-sm" />
          <div className="h-3 w-20 bg-[var(--bg-surface-subtle)] rounded-sm" />
        </div>
        <div className="space-y-2 pt-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex justify-between py-2">
              <div className="h-3 w-32 bg-[var(--bg-surface-subtle)] rounded-sm" />
              <div className="h-3 w-14 bg-[var(--bg-surface-subtle)] rounded-sm" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
