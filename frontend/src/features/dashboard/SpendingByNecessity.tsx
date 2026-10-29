'use client';

import React from 'react';
import type { NecessitySpendingDTO, NecessityClass } from '@arth/contracts';
import { formatPaiseToINR } from '@/lib/format';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';

interface SpendingByNecessityProps {
  items?: NecessitySpendingDTO[];
  totalExpensesPaise: number;
}

interface TierConfig {
  necessity: NecessityClass;
  label: string;
  color: string;
  dotClass: string;
  description: string;
}

const NECESSITY_TIERS: TierConfig[] = [
  {
    necessity: 'essential',
    label: 'Essential',
    color: '#3b82f6', // Tailwind blue-500
    dotClass: 'bg-blue-500',
    description: 'Needs & living expenses',
  },
  {
    necessity: 'optional',
    label: 'Optional',
    color: '#f59e0b', // Tailwind amber-500
    dotClass: 'bg-amber-500',
    description: 'Discretionary & comforts',
  },
  {
    necessity: 'luxury',
    label: 'Luxury',
    color: '#a855f7', // Tailwind purple-500
    dotClass: 'bg-purple-500',
    description: 'Upgrades & splurges',
  },
];

export function SpendingByNecessity({
  items = [],
  totalExpensesPaise,
}: SpendingByNecessityProps) {
  // Normalize items to ensure all three tiers exist deterministically and match case-insensitively
  const tierData = NECESSITY_TIERS.map((tier) => {
    const found = items.find(
      (i) => String(i.necessity || '').toLowerCase().trim() === tier.necessity
    );
    const amountPaise = found ? Number(found.amount_paise || 0) : 0;
    const sharePercentage =
      totalExpensesPaise > 0
        ? Math.round((amountPaise / totalExpensesPaise) * 1000) / 10
        : 0;

    return {
      ...tier,
      amountPaise,
      formattedInr: found?.formatted_inr || formatPaiseToINR(amountPaise),
      sharePercentage,
    };
  });

  const hasExpenses = totalExpensesPaise > 0;

  if (!hasExpenses) {
    return (
      <div className="p-5 lg:h-full bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl space-y-2">
        <h3 className="text-sm font-bold text-[var(--text-primary)]">
          Spending by Necessity
        </h3>
        <div className="py-8 text-center space-y-1">
          <p className="text-xs font-medium text-[var(--text-secondary)]">
            No expense activity in this period
          </p>
          <p className="text-[11px] text-[var(--text-muted)]">
            Essential, Optional, and Luxury breakdowns will appear when you record expenses.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 lg:h-full bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-[var(--text-primary)]">
          Spending by Necessity
        </h3>
        <span className="text-[11px] font-mono text-[var(--text-muted)]">
          3 tiers
        </span>
      </div>

      {/* Subtle Segmented Horizontal Contribution Bar */}
      <div
        role="progressbar"
        aria-label="Expense distribution across necessity classifications"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={100}
        className="w-full h-2.5 rounded-full overflow-hidden flex bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)]"
      >
        {tierData.map((tier) => {
          if (tier.amountPaise <= 0) return null;
          return (
            <div
              key={tier.necessity}
              style={{
                width: `${Math.max(tier.sharePercentage, 1)}%`,
                backgroundColor: tier.color,
              }}
              title={`${tier.label}: ${tier.sharePercentage}% (${tier.formattedInr})`}
              className="h-full transition-all duration-300 first:rounded-l-full last:rounded-r-full"
            />
          );
        })}
      </div>

      {/* Compact Category Rows with Progress Indicator */}
      <div className="divide-y divide-[var(--border-hairline)] pt-0.5">
        {tierData.map((tier) => (
          <div
            key={tier.necessity}
            className="py-2.5 flex items-center justify-between gap-3 text-xs"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Badge variant={tier.necessity as BadgeVariant} size="xs" dot={true}>
                {tier.label}
              </Badge>
              <span className="hidden sm:inline text-[10px] text-[var(--text-muted)] truncate">
                {tier.description}
              </span>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {/* Mini row progress bar */}
              <div className="w-12 sm:w-16 h-1.5 rounded-full bg-[var(--bg-surface-subtle)] overflow-hidden shrink-0 hidden xs:block">
                <div
                  style={{
                    width: `${tier.sharePercentage}%`,
                    backgroundColor: tier.color,
                  }}
                  className="h-full rounded-full transition-all duration-300"
                />
              </div>

              {/* Amount and percentage right-aligned */}
              <div className="text-right flex items-center gap-1.5 shrink-0 font-mono">
                <span className="font-semibold text-[var(--text-primary)]">
                  {tier.formattedInr}
                </span>
                <span className="text-[10px] text-[var(--text-muted)]">
                  ·
                </span>
                <span className="text-[11px] text-[var(--text-secondary)] w-10 text-right">
                  {tier.sharePercentage}%
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
