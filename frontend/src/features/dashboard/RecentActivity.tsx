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
    <div className={`relative flex min-w-0 flex-col p-5 lg:h-full bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl ${latestTransactions.length === 3 ? 'lg:pb-2' : ''}`}>
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
        <div className={`mt-2 divide-y divide-[var(--border-hairline)] ${latestTransactions.length === 3 ? 'lg:mt-auto lg:pb-6' : ''}`}>
          {latestTransactions.map((tx) => {
            const isExpense = tx.type === 'expense';
            return (
              <div
                key={tx.id}
                className="py-1 lg:py-0.5 flex min-w-0 items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0 space-y-0">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 truncate text-[11px] leading-3 font-medium text-[var(--text-primary)]">
                      {tx.description || tx.category_name || 'Uncategorized'}
                    </span>
                    <span className="shrink-0 text-[9px] leading-3 font-mono text-[var(--text-muted)]">
                      {formatDateHuman(tx.transaction_date)}
                    </span>
                  </div>

                  {tx.description && tx.category_name && (
                    <p className="truncate text-[10px] leading-3 text-[var(--text-secondary)]">
                      {tx.category_name}
                    </p>
                  )}
                </div>

                <div className="text-right shrink-0">
                  <span
                    className={`font-mono text-[11px] leading-3 font-bold ${
                      isExpense
                        ? 'text-rose-700 dark:text-rose-400'
                        : 'text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    {isExpense ? `-${tx.formatted_inr}` : `+${tx.formatted_inr}`}
                  </span>
                  <div className="text-[9px] leading-3 text-[var(--text-muted)] capitalize">
                    {tx.payment_method}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {latestTransactions.length === 3 && (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 z-10 hidden h-14 rounded-b-xl bg-gradient-to-t from-[var(--bg-surface)] via-[var(--bg-surface)]/80 to-transparent lg:block"
          />
          <button
            type="button"
            onClick={onNavigateToLedger}
            className="mt-3 flex min-h-11 w-full items-center justify-center rounded-lg border-t border-[var(--border-hairline)] pt-3 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-surface)] active:opacity-70 motion-reduce:transition-none lg:absolute lg:inset-x-3 lg:bottom-2 lg:z-20 lg:mt-0 lg:min-h-9 lg:w-auto lg:rounded-lg lg:border lg:bg-[var(--bg-surface)]/85 lg:px-3 lg:py-2 lg:pt-2 lg:shadow-sm lg:backdrop-blur-md"
          >
            View more transactions &rarr;
          </button>
        </>
      )}

      {latestTransactions.length !== 3 && (
        <button
          type="button"
          onClick={onNavigateToLedger}
          className="mt-3 flex min-h-11 w-full items-center justify-center rounded-lg border-t border-[var(--border-hairline)] pt-3 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-surface)] active:opacity-70 motion-reduce:transition-none lg:mt-auto"
        >
          View more transactions &rarr;
        </button>
      )}
    </div>
  );
}
