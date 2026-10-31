'use client';

import React from 'react';
import type { CategorySpendingDTO } from '@arth/contracts';

interface SpendingCompositionProps {
  categories: CategorySpendingDTO[];
  totalExpensesPaise: number;
  expanded: boolean;
  onSelectCategory: (category: CategorySpendingDTO) => void;
  onToggleExpanded: (expanded: boolean) => void;
}

const FALLBACK_PALETTE = [
  '#0284c7', '#0d9488', '#16a34a', '#d97706',
  '#ea580c', '#e11d48', '#9333ea', '#64748b',
];

export function SpendingComposition({
  categories,
  totalExpensesPaise,
  expanded,
  onSelectCategory,
  onToggleExpanded,
}: SpendingCompositionProps) {
  const visibleCategories = categories.slice(0, 3);
  const hasMore = categories.length > 3;

  const toggleExpanded = () => {
    onToggleExpanded(!expanded);
  };

  return (
    <section className="flex h-full min-w-0 flex-col rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
      <header className="flex min-h-5 items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-[var(--text-primary)]">Spending Composition</h3>
        <span className="shrink-0 text-[11px] font-mono text-[var(--text-muted)]">
          {categories.length} {categories.length === 1 ? 'category' : 'categories'}
        </span>
      </header>

      {totalExpensesPaise <= 0 || categories.length === 0 ? (
        <div className="flex flex-1 flex-col justify-center py-6 text-center">
          <p className="text-xs font-medium text-[var(--text-secondary)]">No expense activity in this period</p>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            When you record expenses, your category spending breakdown will appear here.
          </p>
        </div>
      ) : (
        <>
          <div
            role="progressbar"
            aria-label="Expense distribution across categories"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={100}
            className="mt-4 flex h-3 w-full overflow-hidden rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)]"
          >
            {categories.map((cat, idx) => (
              <div
                key={cat.category_id}
                style={{ width: `${Math.max(cat.share_percentage, 0)}%`, backgroundColor: cat.category_color || FALLBACK_PALETTE[idx % FALLBACK_PALETTE.length] }}
                title={`${cat.category_name}: ${cat.share_percentage}% (${cat.formatted_inr})`}
                className="h-full transition-[width] duration-300 motion-reduce:transition-none"
              />
            ))}
          </div>

          <div className="mt-2 divide-y divide-[var(--border-hairline)]">
            {visibleCategories.map((cat, idx) => {
              const color = cat.category_color || FALLBACK_PALETTE[idx % FALLBACK_PALETTE.length];
              return (
                <button
                  key={cat.category_id}
                  type="button"
                  onClick={() => onSelectCategory(cat)}
                  aria-label={`View ${cat.category_name} transactions, ${cat.formatted_inr}, ${cat.share_percentage}% of expenses`}
                  className="flex w-full min-w-0 cursor-pointer items-center justify-between gap-3 py-2.5 text-left text-xs hover:bg-[var(--bg-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] motion-reduce:transition-none"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span aria-hidden="true" style={{ backgroundColor: color }} className="h-2.5 w-2.5 shrink-0 rounded-full" />
                    <span className="truncate font-medium text-[var(--text-primary)]">
                      {cat.category_icon ? `${cat.category_icon} ` : ''}{cat.category_name}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-[var(--text-muted)]">{cat.share_percentage}%</span>
                  </span>
                  <span className="shrink-0 text-right font-mono font-semibold text-[var(--text-primary)]">{cat.formatted_inr}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {hasMore && (
        <button
          type="button"
          onClick={toggleExpanded}
          aria-expanded={expanded}
          className="mt-auto min-h-10 cursor-pointer border-t border-[var(--border-hairline)] pt-3 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        >
          {expanded ? 'View less' : 'View more'}
        </button>
      )}
    </section>
  );
}
