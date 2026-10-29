'use client';

import React from 'react';
import type { CategorySpendingDTO } from '@arth/contracts';

interface SpendingCompositionProps {
  categories: CategorySpendingDTO[];
  totalExpensesPaise: number;
}

// Fallback palette of restrained editorial hues matching Ledger Minimal
const FALLBACK_PALETTE = [
  '#0284c7', // Sky
  '#0d9488', // Teal
  '#16a34a', // Emerald
  '#d97706', // Amber
  '#ea580c', // Orange
  '#e11d48', // Rose
  '#9333ea', // Purple
  '#64748b', // Slate
];

export function SpendingComposition({
  categories,
  totalExpensesPaise,
}: SpendingCompositionProps) {
  if (totalExpensesPaise <= 0 || categories.length === 0) {
    return (
      <div className="p-5 lg:h-full bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl space-y-2">
        <h3 className="text-sm font-bold text-[var(--text-primary)]">
          Spending Composition
        </h3>
        <div className="py-8 text-center space-y-1">
          <p className="text-xs font-medium text-[var(--text-secondary)]">
            No expense activity in this period
          </p>
          <p className="text-[11px] text-[var(--text-muted)]">
            When you record expenses, your category spending breakdown will appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 lg:h-full bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-[var(--text-primary)]">
          Spending Composition
        </h3>
        <span className="text-[11px] font-mono text-[var(--text-muted)]">
          {categories.length} {categories.length === 1 ? 'category' : 'categories'}
        </span>
      </div>

      {/* Proportional Segmented Bar */}
      <div
        role="progressbar"
        aria-label="Expense distribution across categories"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={100}
        className="w-full h-3 rounded-md overflow-hidden flex bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)]"
      >
        {categories.map((cat, idx) => {
          const color =
            cat.category_color ||
            FALLBACK_PALETTE[idx % FALLBACK_PALETTE.length];
          return (
            <div
              key={cat.category_id}
              style={{
                width: `${Math.max(cat.share_percentage, 1)}%`,
                backgroundColor: color,
              }}
              title={`${cat.category_name}: ${cat.share_percentage}% (${cat.formatted_inr})`}
              className="h-full transition-all duration-300 first:rounded-l-sm last:rounded-r-sm"
            />
          );
        })}
      </div>

      {/* Category Breakdown List */}
      <div className="divide-y divide-[var(--border-hairline)] pt-1">
        {categories.map((cat, idx) => {
          const color =
            cat.category_color ||
            FALLBACK_PALETTE[idx % FALLBACK_PALETTE.length];
          return (
            <div
              key={cat.category_id}
              className="py-2.5 flex items-center justify-between gap-3 text-xs"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  style={{ backgroundColor: color }}
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                />
                <span className="font-medium text-[var(--text-primary)] truncate">
                  {cat.category_icon ? `${cat.category_icon} ` : ''}
                  {cat.category_name}
                </span>
                <span className="text-[11px] font-mono text-[var(--text-muted)] shrink-0">
                  {cat.share_percentage}%
                </span>
              </div>

              <div className="text-right shrink-0">
                <span className="font-mono font-semibold text-[var(--text-primary)]">
                  {cat.formatted_inr}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
