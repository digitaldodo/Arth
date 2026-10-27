'use client';

import React from 'react';
import { Badge } from '@/components/ui/Badge';

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
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
      {/* 1. Income Card */}
      <div className="p-5 sm:p-6 lg:p-7 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs sm:text-sm uppercase tracking-wider font-semibold text-[var(--text-muted)]">
            Total Income
          </span>
          <Badge variant="income" size="xs">Money In</Badge>
        </div>
        <div className="text-2xl sm:text-3xl lg:text-4xl font-bold font-mono tracking-tight text-[var(--income-fg)] truncate tabular-nums">
          {incomePaise > 0 ? `+${formattedIncome}` : formattedIncome}
        </div>
        <p className="text-xs sm:text-sm text-[var(--text-muted)]">
          Active income transactions in period
        </p>
      </div>

      {/* 2. Expenses Card */}
      <div className="p-5 sm:p-6 lg:p-7 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs sm:text-sm uppercase tracking-wider font-semibold text-[var(--text-muted)]">
            Total Expenses
          </span>
          <Badge variant="expense" size="xs">Money Out</Badge>
        </div>
        <div className="text-2xl sm:text-3xl lg:text-4xl font-bold font-mono tracking-tight text-[var(--expense-fg)] truncate tabular-nums">
          {expensesPaise > 0 ? `-${formattedExpenses}` : formattedExpenses}
        </div>
        <p className="text-xs sm:text-sm text-[var(--text-muted)]">
          Active expense transactions in period
        </p>
      </div>

      {/* 3. Net Cash Flow Card */}
      <div className="p-5 sm:p-6 lg:p-7 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs sm:text-sm uppercase tracking-wider font-semibold text-[var(--text-muted)]">
            Net Cash Flow
          </span>
          <Badge variant={isNetPositive ? 'income' : isNetNegative ? 'expense' : 'neutral'} size="xs">
            {isNetPositive ? 'Surplus' : isNetNegative ? 'Deficit' : 'Neutral'}
          </Badge>
        </div>
        <div
          className={`text-2xl sm:text-3xl lg:text-4xl font-bold font-mono tracking-tight truncate tabular-nums ${
            isNetPositive
              ? 'text-[var(--income-fg)]'
              : isNetNegative
              ? 'text-[var(--expense-fg)]'
              : 'text-[var(--text-primary)]'
          }`}
        >
          {isNetPositive ? `+${formattedNetCashFlow}` : formattedNetCashFlow}
        </div>
        <p className="text-xs sm:text-sm text-[var(--text-muted)]">
          Income minus expenses in period
        </p>
      </div>
    </div>
  );
}
