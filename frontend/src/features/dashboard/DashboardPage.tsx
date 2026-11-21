'use client';

import React, { useState, useEffect } from 'react';
import {
  type NecessityClass,
  type DashboardDateRangePreset,
  type DashboardSummaryResponse,
  type AccountBalancesDTO,
  resolveDateRangePreset,
} from '@arth/contracts';
import { getCachedBalances, getCachedTransactions, getCachedCategories, getSyncMeta, setCachedBalances, clearCachedPwaUserContext } from '@/lib/offline-db';
import { DateRangeSelector } from './DateRangeSelector';
import { BalanceCard } from './BalanceCard';
import { SummaryCards } from './SummaryCards';
import { SpendingComposition } from './SpendingComposition';
import { SpendingByNecessity } from './SpendingByNecessity';
import { RecentActivity } from './RecentActivity';
import { DashboardSkeleton } from './DashboardSkeleton';
import { getLatestRecentTransactions } from './recent-transactions';
import { formatDateHuman } from '@/lib/format';
import { formatPaiseToINR } from '@/lib/format';
import { sanitizeUserFacingError } from '@/lib/error-utils';
import { fetchDashboardSummary, fetchBalances } from '@/lib/api-client';
import { useStandalonePwa } from '@/features/pwa/useStandalonePwa';
import { useOptionalAuth } from '@/features/auth/AuthContext';

interface DashboardPageProps {
  userId: string;
  onOpenQuickAdd: () => void;
  onOpenStatementImport?: () => void;
  onNavigateToLedger: () => void;
  onOpenFilteredLedger: (filter: {
    categoryId?: string;
    necessity?: NecessityClass;
    startDate: string;
    endDate: string;
    label: string;
    amountPaise: number;
  }) => void;
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
  userId,
  onOpenQuickAdd,
  onOpenStatementImport,
  onNavigateToLedger,
  onOpenFilteredLedger,
  refreshTrigger = 0,
  onInitialReady,
  initialBalances = null,
  onBalancesLoaded,
}: DashboardPageProps) {
  const isPwa = useStandalonePwa();
  const authContext = useOptionalAuth();
  const [preset, setPreset] = useState<DashboardDateRangePreset>('lifetime');
  const [dateRange, setDateRange] = useState<{ start_date?: string; end_date?: string }>(() =>
    resolveDateRangePreset('lifetime')
  );

  const [balances, setBalances] = useState<AccountBalancesDTO | null>(initialBalances);
  const [balancesLoading, setBalancesLoading] = useState(!initialBalances);
  const [balancesError, setBalancesError] = useState<string | null>(null);
  const [balancesCachedAt, setBalancesCachedAt] = useState<number | null>(null);

  const [summary, setSummary] = useState<DashboardSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<DashboardError | null>(null);
  const [expandedList, setExpandedList] = useState<'categories' | 'transactions' | null>(null);
  const [offlineCopyUnavailable, setOfflineCopyUnavailable] = useState(false);

  // Use the same user-scoped local records as the ledger. The sync engine refreshes in the background.
  useEffect(() => {
    let isMounted = true;
    if (!isPwa) {
      const summaryPromise = fetchDashboardSummary(dateRange);
      const balancesPromise = fetchBalances();

      void Promise.allSettled([summaryPromise, balancesPromise]).then(([summaryResult, balancesResult]) => {
        if (!isMounted) return;

        let hasAnySuccess = false;
        let firstErrorMessage: string | undefined;

        if (summaryResult.status === 'fulfilled') {
          setSummary(summaryResult.value);
          setError(null);
          hasAnySuccess = true;
        } else {
          const message =
            summaryResult.reason instanceof Error
              ? summaryResult.reason.message
              : 'Could not load dashboard summary. Check your connection.';
          const statusCode = (summaryResult.reason as { statusCode?: number })?.statusCode;
          setError({ message, statusCode });
          firstErrorMessage = message;
        }

        if (balancesResult.status === 'fulfilled') {
          setBalances(balancesResult.value);
          setBalancesError(null);
          setBalancesCachedAt(Date.now());
          onBalancesLoaded?.(balancesResult.value);
          if (userId) void setCachedBalances(balancesResult.value, userId);
          hasAnySuccess = true;
        } else {
          const message =
            balancesResult.reason instanceof Error
              ? balancesResult.reason.message
              : 'Could not calculate account balances.';
          setBalancesError(message);
          if (!firstErrorMessage) {
            firstErrorMessage = message;
          }
          // Attempt graceful fallback to local cached balances
          if (userId) {
            void Promise.all([getCachedBalances(userId), getSyncMeta(userId)])
              .then(([cached, meta]) => {
                if (cached && isMounted) {
                  setBalances(cached);
                  setBalancesCachedAt(meta.balancesCachedAt);
                } else if (isMounted) {
                  setBalances(null);
                }
              })
              .catch(() => {
                if (isMounted) setBalances(null);
              });
          } else {
            setBalances(null);
          }
        }

        setLoading(false);
        setBalancesLoading(false);
        setIsRefreshing(false);

        if (hasAnySuccess) {
          onInitialReady?.();
        } else {
          onInitialReady?.(firstErrorMessage);
        }
      });
      return () => {
        isMounted = false;
      };
    }

    Promise.all([
      getCachedTransactions(userId),
      getCachedCategories(userId),
      initialBalances ? Promise.resolve(initialBalances) : getCachedBalances(userId),
      getSyncMeta(userId),
    ])
      .then(([transactions, categories, cachedBalances, syncMeta]) => {
        if (!isMounted) return;
        if (!transactions.length && !syncMeta.transactionsSnapshotComplete) {
          setSummary(null);
          setOfflineCopyUnavailable(typeof navigator !== 'undefined' && !navigator.onLine);
          setLoading(false);
          setBalancesLoading(false);
          onInitialReady?.();
          return;
        }
        setOfflineCopyUnavailable(false);

        // Date filtering: when start_date and end_date are undefined (Lifetime), include all transactions
        const inRange = (!dateRange.start_date && !dateRange.end_date)
          ? transactions
          : transactions.filter((t) => (
              (!dateRange.start_date || t.transaction_date >= dateRange.start_date) &&
              (!dateRange.end_date || t.transaction_date <= dateRange.end_date)
            ));

        const expenses = inRange.filter((t) => t.type === 'expense');
        const incomes = inRange.filter((t) => t.type === 'income');
        const expenseTotal = expenses.reduce((sum, t) => sum + t.amount_paise, 0);
        const incomeTotal = incomes.reduce((sum, t) => sum + t.amount_paise, 0);
        const composition = new Map<string, number>();
        const necessity = new Map<string, number>();

        for (const t of expenses) {
          composition.set(t.category_id, (composition.get(t.category_id) || 0) + t.amount_paise);
          if (t.necessity) necessity.set(t.necessity, (necessity.get(t.necessity) || 0) + t.amount_paise);
        }

        setSummary({
          start_date: dateRange.start_date ?? null,
          end_date: dateRange.end_date ?? null,
          income_paise: incomeTotal,
          expenses_paise: expenseTotal,
          net_cash_flow_paise: incomeTotal - expenseTotal,
          formatted_income: formatPaiseToINR(incomeTotal),
          formatted_expenses: formatPaiseToINR(expenseTotal),
          formatted_net_cash_flow: formatPaiseToINR(incomeTotal - expenseTotal),
          spending_composition: [...composition].map(([id, amount]) => {
            const category = categories.find((item) => item.id === id);
            return {
              category_id: id,
              category_name: category?.name || expenses.find((t) => t.category_id === id)?.category_name || 'Uncategorized',
              category_color: category?.color || null,
              category_icon: category?.icon || null,
              amount_paise: amount,
              formatted_inr: formatPaiseToINR(amount),
              share_percentage: expenseTotal ? Math.round((amount / expenseTotal) * 1000) / 10 : 0,
            };
          }).sort((a, b) => b.amount_paise - a.amount_paise),
          spending_by_necessity: (['essential', 'optional', 'luxury'] as const).map((tier) => {
            const amount = necessity.get(tier) || 0;
            return {
              necessity: tier,
              label: tier[0].toUpperCase() + tier.slice(1),
              amount_paise: amount,
              formatted_inr: formatPaiseToINR(amount),
              share_percentage: expenseTotal ? Math.round((amount / expenseTotal) * 1000) / 10 : 0,
            };
          }),
          recent_transactions: getLatestRecentTransactions(inRange, 10),
          has_activity_in_range: inRange.length > 0,
          // Total active count is strictly all cached active transactions across the account's lifetime
          total_active_transaction_count: transactions.length,
        });

        setLoading(false);
        setIsRefreshing(false);
        setError(null);
        if (cachedBalances) {
          setBalances(cachedBalances);
          onBalancesLoaded?.(cachedBalances);
        }
        setBalancesLoading(false);
        onInitialReady?.();
      })
      .catch(() => {
        if (isMounted) {
          setLoading(false);
          setBalancesLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [userId, dateRange, refreshTrigger, initialBalances, onBalancesLoaded, onInitialReady, isPwa]);

  const handleRetry = () => {
    setLoading(true);
    setError(null);
    setBalancesLoading(true);
    setBalancesError(null);
    setDateRange({ ...dateRange });
  };

  const handleRetryBalances = () => {
    setBalancesLoading(true);
    setBalancesError(null);
    void fetchBalances()
      .then((currentBalances) => {
        setBalances(currentBalances);
        setBalancesError(null);
        setBalancesCachedAt(Date.now());
        onBalancesLoaded?.(currentBalances);
        if (userId) void setCachedBalances(currentBalances, userId);
      })
      .catch((err: unknown) => {
        setBalancesError(sanitizeUserFacingError(err, 'Failed to calculate account balances.'));
      })
      .finally(() => {
        setBalancesLoading(false);
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

  const isAuthError = Boolean(
    (error &&
      (error.statusCode === 401 ||
        error.statusCode === 403 ||
        /token|session|unauthorized/i.test(error.message))) ||
    authContext?.status === 'SESSION_EXPIRED'
  );

  useEffect(() => {
    if (isAuthError && authContext) {
      authContext.notifySessionExpired();
    }
  }, [isAuthError, authContext]);

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

        <div className="flex items-center gap-2.5 shrink-0">
          {onOpenStatementImport && (
            <button
              type="button"
              onClick={onOpenStatementImport}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] rounded-md transition-colors cursor-pointer shadow-2xs shrink-0"
              title="Import PDF, CSV, or spreadsheet statement"
            >
              <span className="text-xs" aria-hidden="true">📄</span>
              <span>Import Bank Statement</span>
            </button>
          )}
          <button
            type="button"
            onClick={onOpenQuickAdd}
            className="hidden sm:inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-md hover:bg-[var(--action-primary-hover)] transition-colors shadow-xs cursor-pointer shrink-0"
          >
            <span>+</span>
            <span>Quick Add</span>
          </button>
        </div>
      </div>

      {/* Account Balances Card (Live Available, Cash, and Online Balances - Independent of analytics filter) */}
      <BalanceCard
        userId={userId}
        balances={balances}
        loading={balancesLoading}
        error={balancesError}
        isOffline={typeof navigator !== 'undefined' && !navigator.onLine}
        cachedAt={balancesCachedAt}
        onRetry={handleRetryBalances}
        onBalancesUpdated={(updated) => {
          setBalances(updated);
          setBalancesError(null);
          setBalancesCachedAt(Date.now());
          if (userId) void setCachedBalances(updated, userId);
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
                Session Expired
              </span>
            </div>
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
            <button
              type="button"
              onClick={() => {
                if (authContext) {
                  void authContext.recoverSession();
                } else {
                  void clearCachedPwaUserContext().then(() => {
                    window.location.replace('/login?error=expired_session');
                  });
                }
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-md hover:bg-[var(--action-primary-hover)] transition-colors shadow-xs cursor-pointer"
            >
              Sign In Again &rarr;
            </button>
            <button
              type="button"
              onClick={() => {
                if (authContext) {
                  void authContext.signOut();
                } else {
                  void clearCachedPwaUserContext().then(() => {
                    window.location.replace('/login');
                  });
                }
              }}
              className="inline-flex items-center px-3 py-2 text-xs font-medium border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-md hover:bg-[var(--bg-surface-subtle)] transition-colors cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>
      )}

      {error && !isAuthError && !summary && !isPwa && (
        <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
          Dashboard could not be loaded: {sanitizeUserFacingError(error.message, 'Unable to load dashboard data. Please try again.')}
          <button type="button" onClick={handleRetry} className="ml-3 underline">Retry</button>
        </div>
      )}

      {/* Loading Skeleton (Only shown when no cached or existing summary data is available) */}
      {loading && !summary && <DashboardSkeleton />}

      {/* Offline copy status */}
      {offlineCopyUnavailable && !summary && (
        <div role="status" className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 text-sm text-[var(--text-secondary)]">
          No offline copy of this account’s dashboard has been downloaded on this device yet. Reconnect to synchronize your data.
        </div>
      )}

      {summary && (
        <div
          className={`space-y-6 transition-opacity duration-150 ${
            isRefreshing ? 'opacity-75' : 'opacity-100'
          }`}
        >
          {/* Case A: Brand New Account (0 lifetime transactions across entire account) */}
          {summary.total_active_transaction_count === 0 && (
            <div className="p-6 sm:p-8 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono uppercase tracking-wider font-semibold px-2 py-0.5 rounded-sm bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/60">
                      Welcome to SpendSense
                    </span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                    Your financial journey starts here
                  </h2>
                  <p className="text-sm sm:text-base text-[var(--text-secondary)] max-w-2xl leading-relaxed">
                    Add your first transaction to see your cash flow and spending patterns. Category breakdowns, spending trends, and insights will appear automatically as you record your transactions.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={onOpenQuickAdd}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-md hover:bg-[var(--action-primary-hover)] transition-colors shadow-xs cursor-pointer"
                  >
                    <span>+</span>
                    <span>Add your first transaction</span>
                  </button>
                  {onOpenStatementImport && (
                    <button
                      type="button"
                      onClick={onOpenStatementImport}
                      className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-primary)] rounded-md hover:bg-[var(--bg-surface-subtle)] transition-colors cursor-pointer"
                    >
                      <span aria-hidden="true">📄</span>
                      <span>Import Bank Statement</span>
                    </button>
                  )}
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

          {/* Case B: Existing Account with 0 transactions in the selected period */}
          {summary.total_active_transaction_count > 0 && !summary.has_activity_in_range && (
            <div className="p-6 sm:p-8 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono uppercase tracking-wider font-semibold px-2 py-0.5 rounded-sm bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                      Period Overview
                    </span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                    {preset === 'this_month' ? 'No transactions this month' : 'No transactions in this period'}
                  </h2>
                  <p className="text-sm sm:text-base text-[var(--text-secondary)] max-w-2xl leading-relaxed">
                    You recorded transactions previously, but none fall within the selected period. Choose another date range or record a new transaction.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleSelectPreset('lifetime')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-md hover:bg-[var(--action-primary-hover)] transition-colors shadow-xs cursor-pointer"
                  >
                    View Lifetime Activity
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectPreset('this_year')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-primary)] rounded-md hover:bg-[var(--bg-surface-subtle)] transition-colors cursor-pointer"
                  >
                    Change Date Range
                  </button>
                  <button
                    type="button"
                    onClick={onOpenQuickAdd}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-primary)] rounded-md hover:bg-[var(--bg-surface-subtle)] transition-colors cursor-pointer"
                  >
                    + Add Transaction
                  </button>
                  {onOpenStatementImport && (
                    <button
                      type="button"
                      onClick={onOpenStatementImport}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-primary)] rounded-md hover:bg-[var(--bg-surface-subtle)] transition-colors cursor-pointer"
                    >
                      <span aria-hidden="true">📄</span>
                      <span>Import Statement</span>
                    </button>
                  )}
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

          {/* Spending Composition, Spending by Necessity, and Recent Activity */}
          <div className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-2 lg:grid-cols-3">
            <div className="w-full min-w-0">
              <SpendingComposition
                categories={summary.spending_composition}
                totalExpensesPaise={summary.expenses_paise}
                expanded={expandedList === 'categories'}
                onSelectCategory={(category) => onOpenFilteredLedger({
                  categoryId: category.category_id,
                  startDate: dateRange.start_date || '',
                  endDate: dateRange.end_date || '',
                  label: category.category_name,
                  amountPaise: category.amount_paise,
                })}
                onToggleExpanded={(expanded) => setExpandedList(expanded ? 'categories' : null)}
              />
            </div>

            <div className="w-full min-w-0">
              <SpendingByNecessity
                items={summary.spending_by_necessity}
                totalExpensesPaise={summary.expenses_paise}
                onSelectNecessity={(necessity, label, amountPaise) => onOpenFilteredLedger({
                  necessity,
                  startDate: dateRange.start_date || '',
                  endDate: dateRange.end_date || '',
                  label,
                  amountPaise,
                })}
              />
            </div>

            <div className="w-full min-w-0 md:col-span-2 lg:col-span-1">
              <RecentActivity
                transactions={summary.recent_transactions}
                expanded={expandedList === 'transactions'}
                onToggleExpanded={(expanded) => setExpandedList(expanded ? 'transactions' : null)}
              />
            </div>
          </div>

          {expandedList && (
            <section className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5" aria-live="polite">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  {expandedList === 'categories' ? 'All spending categories' : 'More recent transactions'}
                </h3>
                <button
                  type="button"
                  onClick={() => setExpandedList(null)}
                  className="min-h-10 rounded-md px-3 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-surface-subtle)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                >
                  View less
                </button>
              </div>
              {expandedList === 'categories' ? (
                <div className="divide-y divide-[var(--border-hairline)]">
                  {summary.spending_composition.slice(3).map((category) => (
                    <button
                      key={category.category_id}
                      type="button"
                      onClick={() => onOpenFilteredLedger({
                        categoryId: category.category_id,
                        startDate: dateRange.start_date || '',
                        endDate: dateRange.end_date || '',
                        label: category.category_name,
                        amountPaise: category.amount_paise,
                      })}
                      className="flex w-full min-h-11 items-center justify-between gap-3 py-2.5 text-left text-xs hover:bg-[var(--bg-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]"
                    >
                      <span className="truncate font-medium text-[var(--text-primary)]">
                        {category.category_icon ? `${category.category_icon} ` : ''}
                        {category.category_name} <span className="font-mono text-[var(--text-muted)]">{category.share_percentage}%</span>
                      </span>
                      <span className="shrink-0 font-mono font-semibold text-[var(--text-primary)]">
                        {category.formatted_inr}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="divide-y divide-[var(--border-hairline)]">
                  {getLatestRecentTransactions(summary.recent_transactions, summary.recent_transactions.length).slice(3).map((transaction) => (
                    <div key={transaction.id} className="flex min-w-0 items-center justify-between gap-3 py-3 text-xs">
                      <div className="min-w-0">
                        <p className="break-words font-medium text-[var(--text-primary)]">
                          {transaction.description || transaction.category_name || 'Uncategorized'}
                        </p>
                        <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                          {formatDateHuman(transaction.transaction_date)} · {transaction.category_name || 'Uncategorized'} · {transaction.payment_method}
                        </p>
                      </div>
                      <span className={`shrink-0 whitespace-nowrap font-mono font-semibold ${transaction.type === 'expense' ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                        {transaction.type === 'expense' ? '−' : '+'}{transaction.formatted_inr}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
