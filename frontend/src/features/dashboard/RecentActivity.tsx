'use client';

import React from 'react';
import type { TransactionDTO } from '@arth/contracts';
import { formatDateHuman } from '@/lib/format';
import { getLatestRecentTransactions } from './recent-transactions';

interface RecentActivityProps {
  transactions: TransactionDTO[];
  expanded: boolean;
  onToggleExpanded: (expanded: boolean) => void;
}

export function RecentActivity({ transactions, expanded, onToggleExpanded }: RecentActivityProps) {
  const orderedTransactions = getLatestRecentTransactions(transactions, transactions.length);
  const visibleTransactions = orderedTransactions.slice(0, 3);
  const hasMore = orderedTransactions.length > 3;

  return (
    <section className="flex h-full min-w-0 flex-col rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
      <header className="flex min-h-5 items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-[var(--text-primary)]">Recent Activity</h3>
      </header>

      {visibleTransactions.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-6 text-center text-xs text-[var(--text-muted)]">
          No transactions recorded in this period.
        </div>
      ) : (
        <div className="mt-2 divide-y divide-[var(--border-hairline)]">
          {visibleTransactions.map((tx) => {
            const isExpense = tx.type === 'expense';
            const title = tx.description || tx.category_name || 'Uncategorized';
            return (
              <div key={tx.id} className="flex min-w-0 items-center justify-between gap-3 py-3 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="min-w-0 break-words font-medium leading-4 text-[var(--text-primary)]">{title}</span>
                    <span className="shrink-0 font-mono text-[10px] text-[var(--text-muted)]">{formatDateHuman(tx.transaction_date)}</span>
                  </div>
                  <div className="mt-1 flex min-w-0 flex-wrap gap-x-2 text-[10px] leading-4 text-[var(--text-secondary)]">
                    {tx.description && tx.category_name && <span className="truncate">{tx.category_name}</span>}
                    {tx.necessity && <span className="capitalize">{tx.necessity}</span>}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <span className={`whitespace-nowrap font-mono text-[11px] font-bold ${isExpense ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                    {isExpense ? '−' : '+'}{tx.formatted_inr}
                  </span>
                  <div className="mt-1 text-[10px] capitalize text-[var(--text-muted)]">{tx.payment_method || 'Payment method unavailable'}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {hasMore && (
        <button
          type="button"
          onClick={() => onToggleExpanded(!expanded)}
          aria-expanded={expanded}
          className="mt-auto min-h-10 cursor-pointer border-t border-[var(--border-hairline)] pt-3 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        >
          {expanded ? 'View less' : 'View more transactions'}
        </button>
      )}
    </section>
  );
}
