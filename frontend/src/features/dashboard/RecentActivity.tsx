'use client';

import React from 'react';
import type { TransactionDTO } from '@arth/contracts';
import { formatDateHuman } from '@/lib/format';

interface RecentActivityProps {
  transactions: TransactionDTO[];
  onNavigateToLedger: () => void;
}

export function RecentActivity({
  transactions,
  onNavigateToLedger,
}: RecentActivityProps) {
  return (
    <div className="p-5 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-[var(--text-primary)]">
          Recent Activity
        </h3>
        <button
          type="button"
          onClick={onNavigateToLedger}
          className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          View all in Ledger &rarr;
        </button>
      </div>

      {transactions.length === 0 ? (
        <div className="py-6 text-center text-xs text-[var(--text-muted)]">
          No transactions recorded in this period.
        </div>
      ) : (
        <div className="divide-y divide-[var(--border-hairline)]">
          {transactions.map((tx) => {
            const isExpense = tx.type === 'expense';
            return (
              <div
                key={tx.id}
                className="py-2.5 flex items-center justify-between gap-3 text-xs"
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
    </div>
  );
}
