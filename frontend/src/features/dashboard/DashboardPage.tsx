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

interface DashboardError {
  message: string;
  statusCode?: number;
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
  const [error, setError] = useState<DashboardError | null>(null);

  useEffect(() => {
    let isMounted = true;

    fetchDashboardSummary(dateRange)
      .then((data) => {
        if (!isMounted) return;
        setSummary(data);
        setError(null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        const message =
          err instanceof Error
            ? err.message
            : 'Failed to load dashboard summary';
        const statusCode = (err as { statusCode?: number })?.statusCode;
        setError({ message, statusCode });
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
        setError(null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        const message =
          err instanceof Error
            ? err.message
            : 'Failed to load dashboard summary';
        const statusCode = (err as { statusCode?: number })?.statusCode;
        setError({ message, statusCode });
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

  const isAuthError =
    error &&
    (error.statusCode === 401 ||
      error.statusCode === 403 ||
      /token|session|unauthorized/i.test(error.message));

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

      {/* Authentication / Session Expired State */}
      {isAuthError && (
        <div className="p-5 sm:p-6 bg-[var(--bg-surface)] border border-amber-300 dark:border-amber-800/60 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
              <span className="text-[10px] font-mono font-semibold text-amber-900 dark:text-amber-200 uppercase tracking-wider">
                Authentication Required
              </span>
            </div>
            <button
              type="button"
              onClick={handleRetry}
              className="text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline"
            >
              Retry
            </button>
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">
              Authentication session expired
            </h3>
            <p className="text-xs text-[var(--text-secondary)] max-w-lg leading-relaxed">
              Your session has ended or the authentication token could not be verified. Please sign in again to access your financial dashboard.
            </p>
          </div>
          <div className="pt-1 flex items-center gap-2.5">
            <a
              href="/login"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-md hover:bg-[var(--action-primary-hover)] transition-colors shadow-xs"
            >
              Sign In Again &rarr;
            </a>
            <button
              type="button"
              onClick={handleRetry}
              className="inline-flex items-center px-3 py-2 text-xs font-medium border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-primary)] rounded-md hover:bg-[var(--bg-surface-subtle)] transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Backend / Gateway Error State */}
      {error && !isAuthError && (
        <div className="p-5 sm:p-6 bg-rose-50/60 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
              <span className="text-[10px] font-mono font-semibold text-rose-800 dark:text-rose-200 uppercase tracking-wider">
                Service Error
              </span>
            </div>
            <button
              type="button"
              onClick={handleRetry}
              className="text-xs font-semibold text-rose-700 dark:text-rose-400 underline hover:no-underline"
            >
              Retry
            </button>
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-rose-900 dark:text-rose-100">
              Failed to load financial summary
            </h3>
            <p className="text-xs text-rose-700 dark:text-rose-300 max-w-lg leading-relaxed">
              {error.message}
            </p>
          </div>
          <div className="pt-1">
            <button
              type="button"
              onClick={handleRetry}
              className="inline-flex items-center px-3.5 py-1.5 text-xs font-semibold bg-rose-700 text-white rounded-md hover:bg-rose-800 transition-colors shadow-xs"
            >
              Retry Request
            </button>
          </div>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && !summary && <DashboardSkeleton />}

      {/* Populated Content */}
      {summary && (
        <div className="space-y-6">
          {/* Entire Ledger Empty State (First-time user onboarding banner) */}
          {summary.total_active_transaction_count === 0 && (
            <div className="p-6 sm:p-7 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-wider font-semibold px-2 py-0.5 rounded-sm bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/60">
                      Welcome to Arth
                    </span>
                  </div>
                  <h2 className="text-base sm:text-lg font-bold tracking-tight text-[var(--text-primary)]">
                    Your ledger is ready
                  </h2>
                  <p className="text-xs text-[var(--text-secondary)] max-w-lg leading-relaxed">
                    Add your first transaction to start tracking your income, expenses, and cash flow.
                  </p>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={onOpenQuickAdd}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-md hover:bg-[var(--action-primary-hover)] transition-colors shadow-xs"
                  >
                    <span>+</span>
                    <span>Add your first transaction</span>
                  </button>
                  <button
                    type="button"
                    onClick={onNavigateToLedger}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-primary)] rounded-md hover:bg-[var(--bg-surface-subtle)] transition-colors"
                  >
                    <span>View Ledger</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Financial Summary Cards (Always visible: displays ₹0.00 for empty state or aggregated values) */}
          <SummaryCards
            incomePaise={summary.income_paise}
            expensesPaise={summary.expenses_paise}
            netCashFlowPaise={summary.net_cash_flow_paise}
            formattedIncome={summary.formatted_income}
            formattedExpenses={summary.formatted_expenses}
            formattedNetCashFlow={summary.formatted_net_cash_flow}
          />

          {/* Empty Range Notice if user has transactions elsewhere in their ledger, but none in this period */}
          {summary.total_active_transaction_count > 0 && !summary.has_activity_in_range && (
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
        </div>
      )}
    </div>
  );
}
