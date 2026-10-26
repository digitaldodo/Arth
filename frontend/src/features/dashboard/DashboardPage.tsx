'use client';

import React, { useState, useEffect } from 'react';
import {
  type DashboardDateRangePreset,
  type DashboardSummaryResponse,
  type AccountBalancesDTO,
  resolveDateRangePreset,
} from '@arth/contracts';
import { fetchDashboardSummary, fetchBalances } from '@/lib/api-client';
import { getCachedBalances, setCachedBalances, getCachedDashboardSummary, setCachedDashboardSummary } from '@/lib/offline-db';
import { DateRangeSelector } from './DateRangeSelector';
import { BalanceCard } from './BalanceCard';
import { SummaryCards } from './SummaryCards';
import { SpendingComposition } from './SpendingComposition';
import { SpendingByNecessity } from './SpendingByNecessity';
import { RecentActivity } from './RecentActivity';
import { DashboardSkeleton } from './DashboardSkeleton';

interface DashboardPageProps {
  onOpenQuickAdd: () => void;
  onNavigateToLedger: () => void;
  refreshTrigger?: number;
  onInitialReady?: (error?: string) => void;
  initialBalances?: AccountBalancesDTO | null;
  onBalancesLoaded?: (balances: AccountBalancesDTO) => void;
}

interface DashboardError {
  message: string;
  statusCode?: number;
}

export function DashboardPage({
  onOpenQuickAdd,
  onNavigateToLedger,
  refreshTrigger = 0,
  onInitialReady,
  initialBalances = null,
  onBalancesLoaded,
}: DashboardPageProps) {
  const [preset, setPreset] = useState<DashboardDateRangePreset>('this_month');
  const [dateRange, setDateRange] = useState(() =>
    resolveDateRangePreset('this_month')
  );

  const [balances, setBalances] = useState<AccountBalancesDTO | null>(initialBalances);
  const [balancesLoading, setBalancesLoading] = useState(!initialBalances);
  const rangeKey = `${dateRange.start_date}_${dateRange.end_date}`;

  const [summary, setSummary] = useState<DashboardSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<DashboardError | null>(null);

  // Fetch balances (cached + revalidated)
  useEffect(() => {
    let isMounted = true;

    if (!initialBalances) {
      getCachedBalances().then((cached) => {
        if (cached && isMounted) {
          setBalances(cached);
          setBalancesLoading(false);
        }
      }).catch(() => {});
    }

    fetchBalances()
      .then((data) => {
        if (!isMounted) return;
        setBalances(data);
        setBalancesLoading(false);
        setCachedBalances(data);
        onBalancesLoaded?.(data);
      })
      .catch(() => {
        if (isMounted) setBalancesLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [refreshTrigger, initialBalances, onBalancesLoaded]);

  // Fetch dashboard summary (cached + revalidated)
  useEffect(() => {
    let isMounted = true;

    // Check local cache first for instant render
    getCachedDashboardSummary(rangeKey)
      .then((cached) => {
        if (cached && isMounted) {
          setSummary(cached);
          setLoading(false);
        }
      })
      .catch(() => {});

    fetchDashboardSummary(dateRange)
      .then((data) => {
        if (!isMounted) return;
        setSummary(data);
        setError(null);
        setLoading(false);
        setCachedDashboardSummary(rangeKey, data).catch(() => {});
        onInitialReady?.();
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
        onInitialReady?.(message);
      });

    return () => {
      isMounted = false;
    };
  }, [dateRange, refreshTrigger, onInitialReady, rangeKey]);

  const handleRetry = () => {
    setLoading(true);
    setError(null);
    setBalancesLoading(true);

    fetchBalances()
      .then((b) => {
        setBalances(b);
        setBalancesLoading(false);
        setCachedBalances(b);
      })
      .catch(() => setBalancesLoading(false));

    fetchDashboardSummary(dateRange)
      .then((data) => {
        setSummary(data);
        setError(null);
        setLoading(false);
        onInitialReady?.();
      })
      .catch((err: unknown) => {
        const message =
          err instanceof Error
            ? err.message
            : 'Failed to load dashboard summary';
        const statusCode = (err as { statusCode?: number })?.statusCode;
        setError({ message, statusCode });
        setLoading(false);
        onInitialReady?.(message);
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
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-[var(--text-primary)]">
            Dashboard
          </h1>
          <p className="text-sm sm:text-base text-[var(--text-secondary)] mt-1">
            Account balances and cash flow overview
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenQuickAdd}
          className="hidden sm:inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-md hover:bg-[var(--action-primary-hover)] transition-colors shadow-xs cursor-pointer shrink-0"
        >
          <span>+</span>
          <span>Quick Add</span>
        </button>
      </div>

      {/* Account Balances Card (Live Available, Cash, and Online Balances) */}
      <BalanceCard
        balances={balances}
        loading={balancesLoading}
        onBalancesUpdated={(updated) => {
          setBalances(updated);
          setCachedBalances(updated);
        }}
      />

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

      {/* Non-blocking Offline Banner when cached data is displayed */}
      {error && !isAuthError && summary && (
        <div className="flex items-center justify-between p-3.5 bg-amber-500/10 border border-amber-500/25 rounded-xl text-xs text-amber-200">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
            <span className="font-medium">
              Showing cached ledger data. Unable to refresh from server ({error.message}).
            </span>
          </div>
          <button
            type="button"
            onClick={handleRetry}
            className="text-xs font-semibold text-amber-300 hover:text-white underline ml-3 shrink-0 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Backend / Gateway Error State (when NO summary is available) */}
      {error && !isAuthError && !summary && (
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
            <div className="p-6 sm:p-8 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono uppercase tracking-wider font-semibold px-2 py-0.5 rounded-sm bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/60">
                      Welcome to Arth
                    </span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                    Your financial journey starts here
                  </h2>
                  <p className="text-sm sm:text-base text-[var(--text-secondary)] max-w-2xl leading-relaxed">
                    Add your first transaction to see your cash flow and spending patterns. Category breakdowns, spending trends, and insights will appear automatically as you record your transactions.
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={onOpenQuickAdd}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-md hover:bg-[var(--action-primary-hover)] transition-colors shadow-xs cursor-pointer"
                  >
                    <span>+</span>
                    <span>Add your first transaction</span>
                  </button>
                  <button
                    type="button"
                    onClick={onNavigateToLedger}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-primary)] rounded-md hover:bg-[var(--bg-surface-subtle)] transition-colors cursor-pointer"
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
            <div className="p-5 bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] rounded-xl text-center space-y-1.5">
              <p className="text-sm font-medium text-[var(--text-secondary)]">
                No transactions recorded during this period
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                Switch to a different date range or select &quot;This Year&quot; to view activity from other periods.
              </p>
            </div>
          )}

          {/* Spending Composition and Recent Activity in a balanced wide multi-column layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
            <div className="lg:col-span-5 space-y-6">
              <SpendingComposition
                categories={summary.spending_composition}
                totalExpensesPaise={summary.expenses_paise}
              />
              <SpendingByNecessity
                items={summary.spending_by_necessity}
                totalExpensesPaise={summary.expenses_paise}
              />
            </div>

            <div className="lg:col-span-7 space-y-6">
              <RecentActivity
                transactions={summary.recent_transactions}
                onNavigateToLedger={onNavigateToLedger}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
