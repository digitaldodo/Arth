'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  type DashboardDateRangePreset,
  type DashboardSummaryResponse,
  type AccountBalancesDTO,
  resolveDateRangePreset,
} from '@arth/contracts';
import { formatPaiseToINR } from '@/lib/format';
import { fetchDashboardSummary, fetchBalances } from '@/lib/api-client';
import {
  getCachedBalances,
  setCachedBalances,
  getCachedDashboardSummary,
  setCachedDashboardSummary,
} from '@/lib/offline-db';
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
  onNavigateToFinancialTools?: (mode: 'safe' | 'emi') => void;
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
  onNavigateToFinancialTools,
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<DashboardError | null>(null);

  const summarySeqRef = useRef<number>(0);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch balances (cached + revalidated)
  useEffect(() => {
    let isMounted = true;

    if (!initialBalances) {
      getCachedBalances()
        .then((cached) => {
          if (cached && isMounted) {
            setBalances(cached);
            setBalancesLoading(false);
          }
        })
        .catch(() => {});
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

  // Fetch dashboard summary (cached + revalidated with sequence tracking & debounced refresh indicator)
  useEffect(() => {
    let isMounted = true;
    summarySeqRef.current += 1;
    const currentSeq = summarySeqRef.current;

    // Trigger subtle refreshing indicator after 90ms if request is still pending
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      if (summarySeqRef.current === currentSeq) {
        setIsRefreshing(true);
      }
    }, 90);

    // Check local cache first for instant render
    getCachedDashboardSummary(rangeKey)
      .then((cached) => {
        if (cached && isMounted && summarySeqRef.current === currentSeq) {
          setSummary(cached);
          setLoading(false);
        }
      })
      .catch(() => {});

    fetchDashboardSummary(dateRange)
      .then((data) => {
        if (!isMounted || summarySeqRef.current !== currentSeq) return;
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        setSummary(data);
        setError(null);
        setLoading(false);
        setIsRefreshing(false);
        setCachedDashboardSummary(rangeKey, data).catch(() => {});
        onInitialReady?.();
      })
      .catch((err: unknown) => {
        if (!isMounted || summarySeqRef.current !== currentSeq) return;
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        setIsRefreshing(false);
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
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
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
        setIsRefreshing(false);
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
        setIsRefreshing(false);
        onInitialReady?.(message);
      });
  };

  const handleSelectPreset = (newPreset: DashboardDateRangePreset) => {
    setPreset(newPreset);
    if (newPreset !== 'custom') {
      const resolved = resolveDateRangePreset(newPreset);
      setDateRange(resolved);
    }
  };

  const handleApplyCustomRange = (startDate: string, endDate: string) => {
    setPreset('custom');
    setDateRange({ start_date: startDate, end_date: endDate });
  };

  // Authoritative spending by necessity fallback reconciliation
  const effectiveNecessityItems = React.useMemo(() => {
    if (!summary) return [];
    const items = summary.spending_by_necessity || [];
    const sumPaise = items.reduce((acc, curr) => acc + (curr.amount_paise || 0), 0);
    if (sumPaise > 0 || summary.expenses_paise <= 0) {
      return items;
    }

    const txs = summary.recent_transactions || [];
    let essential = 0;
    let optional = 0;
    let luxury = 0;

    for (const t of txs) {
      if (t.type === 'expense') {
        const nec = String(t.necessity || '').toLowerCase().trim();
        const amt = Number(t.amount_paise || 0);
        if (nec === 'essential') essential += amt;
        else if (nec === 'optional') optional += amt;
        else if (nec === 'luxury') luxury += amt;
      }
    }

    const calcTotal = essential + optional + luxury;
    if (calcTotal > 0) {
      return [
        {
          necessity: 'essential' as const,
          label: 'Essential',
          amount_paise: essential,
          formatted_inr: formatPaiseToINR(essential),
          share_percentage:
            summary.expenses_paise > 0
              ? Math.round((essential / summary.expenses_paise) * 1000) / 10
              : 0,
        },
        {
          necessity: 'optional' as const,
          label: 'Optional',
          amount_paise: optional,
          formatted_inr: formatPaiseToINR(optional),
          share_percentage:
            summary.expenses_paise > 0
              ? Math.round((optional / summary.expenses_paise) * 1000) / 10
              : 0,
        },
        {
          necessity: 'luxury' as const,
          label: 'Luxury',
          amount_paise: luxury,
          formatted_inr: formatPaiseToINR(luxury),
          share_percentage:
            summary.expenses_paise > 0
              ? Math.round((luxury / summary.expenses_paise) * 1000) / 10
              : 0,
        },
      ];
    }

    return items;
  }, [summary]);

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

      {/* Non-disruptive Indeterminate Progress Bar */}
      <div className="h-0.5 w-full overflow-hidden rounded-full transition-opacity duration-150">
        {isRefreshing ? (
          <div
            role="progressbar"
            aria-label="Updating dashboard metrics"
            aria-busy="true"
            className="h-full w-full bg-[var(--action-primary-bg)] animate-indeterminate"
          />
        ) : (
          <div className="h-full w-full bg-transparent" />
        )}
      </div>

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
        <div className="flex items-center justify-between p-3.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-xl text-xs text-amber-900 dark:text-amber-200">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-amber-600 dark:bg-amber-400 shrink-0" />
            <span className="font-medium">
              Showing cached ledger data. Unable to refresh from server ({error.message}).
            </span>
          </div>
          <button
            type="button"
            onClick={handleRetry}
            className="text-xs font-semibold text-amber-800 dark:text-amber-300 hover:underline ml-3 shrink-0 cursor-pointer"
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

      {/* Loading Skeleton (Only shown when no cached or existing summary data is available) */}
      {loading && !summary && <DashboardSkeleton />}

      {/* Populated Content with smooth transition */}
      {summary && (
        <div
          className={`space-y-6 transition-opacity duration-150 ${
            isRefreshing ? 'opacity-75' : 'opacity-100'
          }`}
        >
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

          {/* Financial Summary Cards */}
          <SummaryCards
            incomePaise={summary.income_paise}
            expensesPaise={summary.expenses_paise}
            netCashFlowPaise={summary.net_cash_flow_paise}
            formattedIncome={summary.formatted_income}
            formattedExpenses={summary.formatted_expenses}
            formattedNetCashFlow={summary.formatted_net_cash_flow}
          />

          {onNavigateToFinancialTools && (
            <section className="grid gap-4 sm:grid-cols-2" aria-label="Financial planning tools">
              <button type="button" onClick={() => onNavigateToFinancialTools('safe')} className="flex min-h-24 items-center justify-between gap-4 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4 text-left transition-colors hover:bg-[var(--bg-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                <span><span className="block text-sm font-semibold text-[var(--text-primary)]">Safe to Spend</span><span className="mt-1 block text-xs text-[var(--text-secondary)]">Estimate discretionary capacity from your recorded balances and spending.</span></span><span aria-hidden="true" className="text-lg text-[var(--text-muted)]">→</span>
              </button>
              <button type="button" onClick={() => onNavigateToFinancialTools('emi')} className="flex min-h-24 items-center justify-between gap-4 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4 text-left transition-colors hover:bg-[var(--bg-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                <span><span className="block text-sm font-semibold text-[var(--text-primary)]">EMI stress test</span><span className="mt-1 block text-xs text-[var(--text-secondary)]">Explore a loan payment and test different cash-flow assumptions.</span></span><span aria-hidden="true" className="text-lg text-[var(--text-muted)]">→</span>
              </button>
            </section>
          )}

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

          {/* Spending Composition, Spending by Necessity, and Recent Activity */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="w-full min-w-0">
              <SpendingComposition
                categories={summary.spending_composition}
                totalExpensesPaise={summary.expenses_paise}
              />
            </div>

            <div className="w-full min-w-0">
              <SpendingByNecessity
                items={effectiveNecessityItems}
                totalExpensesPaise={summary.expenses_paise}
              />
            </div>

            <div className="w-full min-w-0 md:col-span-2 lg:col-span-1">
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
