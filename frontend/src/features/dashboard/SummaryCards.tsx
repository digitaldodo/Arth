'use client';

import React from 'react';

interface SummaryCardsProps {
  incomePaise: number;
  expensesPaise: number;
  netCashFlowPaise: number;
  formattedIncome: string;
  formattedExpenses: string;
  formattedNetCashFlow: string;
}

export function SummaryCards({
  incomePaise,
  expensesPaise,
  netCashFlowPaise,
  formattedIncome,
  formattedExpenses,
  formattedNetCashFlow,
}: SummaryCardsProps) {
  const isNetPositive = netCashFlowPaise > 0;
  const isNetNegative = netCashFlowPaise < 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {/* 1. Income Card */}
      <div className="p-4 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wider font-semibold text-[var(--text-muted)]">
            Total Income
          </span>
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-sm bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/60">
            Money In
          </span>
        </div>
        <div className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-emerald-700 dark:text-emerald-400 truncate">
          {incomePaise > 0 ? `+${formattedIncome}` : formattedIncome}
        </div>
        <p className="text-[11px] text-[var(--text-muted)]">
          Active income transactions in period
        </p>
      </div>

      {/* 2. Expenses Card */}
      <div className="p-4 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wider font-semibold text-[var(--text-muted)]">
            Total Expenses
          </span>
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-sm bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60">
            Money Out
          </span>
        </div>
        <div className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-rose-700 dark:text-rose-400 truncate">
          {expensesPaise > 0 ? `-${formattedExpenses}` : formattedExpenses}
        </div>
        <p className="text-[11px] text-[var(--text-muted)]">
          Active expense transactions in period
        </p>
      </div>

      {/* 3. Net Cash Flow Card */}
      <div className="p-4 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wider font-semibold text-[var(--text-muted)]">
            Net Cash Flow
          </span>
          <span
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded-sm border ${
              isNetPositive
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/60'
                : isNetNegative
                ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-900/60'
                : 'bg-[var(--bg-surface-subtle)] text-[var(--text-muted)] border-[var(--border-subtle)]'
            }`}
          >
            {isNetPositive ? 'Surplus' : isNetNegative ? 'Deficit' : 'Neutral'}
          </span>
        </div>
        <div
          className={`text-xl sm:text-2xl font-bold font-mono tracking-tight truncate ${
            isNetPositive
              ? 'text-emerald-700 dark:text-emerald-400'
              : isNetNegative
              ? 'text-rose-700 dark:text-rose-400'
              : 'text-[var(--text-primary)]'
          }`}
        >
          {isNetPositive ? `+${formattedNetCashFlow}` : formattedNetCashFlow}
        </div>
        <p className="text-[11px] text-[var(--text-muted)]">
          Income minus expenses in period
        </p>
      </div>
    </div>
  );
}
