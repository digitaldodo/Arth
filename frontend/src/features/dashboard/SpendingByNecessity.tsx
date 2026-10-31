'use client';

import React from 'react';
import type { NecessitySpendingDTO, NecessityClass } from '@arth/contracts';
import { formatPaiseToINR } from '@/lib/format';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';

interface SpendingByNecessityProps {
  items?: NecessitySpendingDTO[];
  totalExpensesPaise: number;
  onSelectNecessity: (necessity: NecessityClass, label: string, amountPaise: number) => void;
}

const NECESSITY_TIERS: { necessity: NecessityClass; label: string; color: string; description: string }[] = [
  { necessity: 'essential', label: 'Essential', color: '#3b82f6', description: 'Needs & living expenses' },
  { necessity: 'optional', label: 'Optional', color: '#f59e0b', description: 'Discretionary & comforts' },
  { necessity: 'luxury', label: 'Luxury', color: '#a855f7', description: 'Upgrades & splurges' },
];

export function SpendingByNecessity({ items = [], totalExpensesPaise, onSelectNecessity }: SpendingByNecessityProps) {
  const tierData = NECESSITY_TIERS.map((tier) => {
    const found = items.find((item) => item.necessity === tier.necessity);
    const amountPaise = Number(found?.amount_paise || 0);
    return {
      ...tier,
      amountPaise,
      formattedInr: found?.formatted_inr || formatPaiseToINR(amountPaise),
      sharePercentage: totalExpensesPaise > 0 ? Math.round((amountPaise / totalExpensesPaise) * 1000) / 10 : 0,
    };
  });

  return (
    <section className="flex h-full min-w-0 flex-col rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
      <header className="flex min-h-5 items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-[var(--text-primary)]">Spending by Necessity</h3>
        <span className="shrink-0 text-[11px] font-mono text-[var(--text-muted)]">3 tiers</span>
      </header>

      {totalExpensesPaise <= 0 ? (
        <div className="flex flex-1 flex-col justify-center py-6 text-center">
          <p className="text-xs font-medium text-[var(--text-secondary)]">No expense activity in this period</p>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">Essential, Optional, and Luxury breakdowns will appear when you record expenses.</p>
        </div>
      ) : (
        <>
          <div
            role="progressbar"
            aria-label="Expense distribution across necessity classifications"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={100}
            className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)]"
          >
            {tierData.map((tier) => tier.amountPaise > 0 && (
              <div key={tier.necessity} style={{ width: `${tier.sharePercentage}%`, backgroundColor: tier.color }} title={`${tier.label}: ${tier.sharePercentage}% (${tier.formattedInr})`} className="h-full transition-[width] duration-300 motion-reduce:transition-none" />
            ))}
          </div>
          <div className="mt-2 divide-y divide-[var(--border-hairline)]">
            {tierData.map((tier) => (
              <button
                key={tier.necessity}
                type="button"
                onClick={() => onSelectNecessity(tier.necessity, tier.label, tier.amountPaise)}
                aria-label={`View ${tier.label} transactions, ${tier.formattedInr}, ${tier.sharePercentage}% of expenses`}
                className="flex w-full min-w-0 cursor-pointer items-center justify-between gap-3 py-2.5 text-left text-xs hover:bg-[var(--bg-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <Badge variant={tier.necessity as BadgeVariant} size="xs" dot>{tier.label}</Badge>
                  <span className="hidden truncate text-[10px] text-[var(--text-muted)] sm:inline">{tier.description}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-right font-mono">
                  <span className="font-semibold text-[var(--text-primary)]">{tier.formattedInr}</span>
                  <span className="text-[10px] text-[var(--text-muted)]">·</span>
                  <span className="w-10 text-right text-[11px] text-[var(--text-secondary)]">{tier.sharePercentage}%</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
