'use client';

import React, { useState, useEffect } from 'react';
import {
  type DashboardDateRangePreset,
  type DashboardSummaryResponse,
  resolveDateRangePreset,
} from '@arth/contracts';
import { fetchDashboardSummary } from '@/lib/api-client';
import { DateRangeSelector } from './DateRangeSelector';
import { SummaryCards } from './SummaryCards';
import { SpendingComposition } from './SpendingComposition';
import { RecentActivity } from './RecentActivity';
import { DashboardSkeleton } from './DashboardSkeleton';

interface DashboardPageProps {
  onOpenQuickAdd: () => void;
  onNavigateToLedger: () => void;
  refreshTrigger?: number;
}

export function DashboardPage({
  onOpenQuickAdd,
  onNavigateToLedger,
  refreshTrigger = 0,
}: DashboardPageProps) {
  const [preset, setPreset] = useState<DashboardDateRangePreset>('this_month');
  const [dateRange, setDateRange] = useState(() =>
    resolveDateRangePreset('this_month')
  );

  const [summary, setSummary] = useState<DashboardSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    fetchDashboardSummary(dateRange)
      .then((data) => {
        if (!isMounted) return;
        setSummary(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        const message =
          err instanceof Error
            ? err.message
            : 'Failed to load dashboard summary';
        setError(message);
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [dateRange, refreshTrigger]);

  const handleRetry = () => {
    setLoading(true);
    setError(null);
    fetchDashboardSummary(dateRange)
      .then((data) => {
        setSummary(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        const message =
          err instanceof Error
            ? err.message
            : 'Failed to load dashboard summary';
        setError(message);
        setLoading(false);
      });
  };

  const handleSelectPreset = (newPreset: DashboardDateRangePreset) => {
    setPreset(newPreset);
    if (newPreset !== 'custom') {
      const resolved = resolveDateRangePreset(newPreset);
      setLoading(true);
      setDateRange(resolved);
    }
  };

  const handleApplyCustomRange = (startDate: string, endDate: string) => {
    setPreset('custom');
    setLoading(true);
    setDateRange({ start_date: startDate, end_date: endDate });
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
            Dashboard
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Cash flow overview and category composition
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenQuickAdd}
          className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-md hover:bg-[var(--action-primary-hover)] transition-colors shadow-xs"
        >
          <span>+</span>
          <span>Quick Add</span>
        </button>
      </div>

      {/* Date Range Controls */}
      <DateRangeSelector
        currentPreset={preset}
        startDate={dateRange.start_date}
        endDate={dateRange.end_date}
        onSelectPreset={handleSelectPreset}
        onApplyCustomRange={handleApplyCustomRange}
      />

      {/* Error State */}
      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-800 dark:text-rose-200">
              Failed to load financial summary
            </span>
            <button
              type="button"
              onClick={handleRetry}
              className="text-xs font-semibold text-rose-700 dark:text-rose-400 underline hover:no-underline"
            >
              Retry
            </button>
          </div>
          <p className="text-xs text-rose-600 dark:text-rose-300">{error}</p>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && !summary && <DashboardSkeleton />}

      {/* Populated Content */}
      {summary && (
        <>
          {/* Entire Ledger Empty State */}
          {summary.total_active_transaction_count === 0 ? (
            <div className="p-8 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl text-center space-y-4">
              <div className="w-12 h-12 mx-auto rounded-full bg-[var(--bg-surface-subtle)] flex items-center justify-center text-xl">
                💳
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-[var(--text-primary)]">
                  Welcome to Arth
                </h3>
                <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto">
                  You haven&apos;t recorded any transactions yet. Start capturing your income and expenses to see your cash flow analytics.
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenQuickAdd}
                className="px-4 py-2 text-xs font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-md hover:bg-[var(--action-primary-hover)] transition-colors shadow-xs"
              >
                + Record First Transaction
              </button>
            </div>
          ) : (
            <>
              {/* Financial Summary Cards */}
              <SummaryCards
                incomePaise={summary.income_paise}
                expensesPaise={summary.expenses_paise}
                netCashFlowPaise={summary.net_cash_flow_paise}
                formattedIncome={summary.formatted_income}
                formattedExpenses={summary.formatted_expenses}
                formattedNetCashFlow={summary.formatted_net_cash_flow}
              />

              {/* Empty Range Notice if user has transactions elsewhere but none in this period */}
              {!summary.has_activity_in_range && (
                <div className="p-4 bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] rounded-xl text-center space-y-1">
                  <p className="text-xs font-medium text-[var(--text-secondary)]">
                    No transactions recorded during this period
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Switch to a different date range or select &quot;This Year&quot; to view activity from other periods.
                  </p>
                </div>
              )}

              {/* Spending Composition */}
              <SpendingComposition
                categories={summary.spending_composition}
                totalExpensesPaise={summary.expenses_paise}
              />

              {/* Recent Activity Preview */}
              <RecentActivity
                transactions={summary.recent_transactions}
                onNavigateToLedger={onNavigateToLedger}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
