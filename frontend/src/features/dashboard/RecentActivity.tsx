'use client';

import React from 'react';
import type { TransactionDTO } from '@arth/contracts';
import { formatDateHuman } from '@/lib/format';
import { getLatestRecentTransactions } from './recent-transactions';

interface RecentActivityProps {
  transactions: TransactionDTO[];
  onNavigateToLedger: () => void;
}

export function RecentActivity({
  transactions,
  onNavigateToLedger,
}: RecentActivityProps) {
  const latestTransactions = getLatestRecentTransactions(transactions);

  return (
    <div className="flex min-w-0 flex-col p-5 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-[var(--text-primary)]">
          Recent Activity
        </h3>
      </div>

      {latestTransactions.length === 0 ? (
        <div className="py-6 text-center text-xs text-[var(--text-muted)]">
          No transactions recorded in this period.
        </div>
      ) : (
        <div className="mt-3 divide-y divide-[var(--border-hairline)]">
          {latestTransactions.map((tx) => {
            const isExpense = tx.type === 'expense';
            return (
              <div
                key={tx.id}
                className="py-2.5 flex min-w-0 items-center justify-between gap-2.5 text-xs"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[var(--text-primary)] truncate">
                      {tx.description || tx.category_name || 'Uncategorized'}
                    </span>
                    <span className="text-[10px] font-mono text-[var(--text-muted)] shrink-0">
                      {formatDateHuman(tx.transaction_date)}
                    </span>
                  </div>

                  {tx.description && tx.category_name && (
                    <p className="text-[11px] text-[var(--text-secondary)] truncate">
                      {tx.category_name}
                    </p>
                  )}
                </div>

                <div className="text-right shrink-0">
                  <span
                    className={`font-mono font-bold ${
                      isExpense
                        ? 'text-rose-700 dark:text-rose-400'
                        : 'text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    {isExpense ? `-${tx.formatted_inr}` : `+${tx.formatted_inr}`}
                  </span>
                  <div className="text-[10px] text-[var(--text-muted)] capitalize">
                    {tx.payment_method}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={onNavigateToLedger}
        className="mt-3 flex min-h-11 w-full items-center justify-center rounded-lg border-t border-[var(--border-hairline)] pt-3 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-surface)] active:opacity-70"
      >
        View more transactions &rarr;
      </button>
    </div>
  );
}
