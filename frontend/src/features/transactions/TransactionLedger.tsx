'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  type TransactionDTO,
  type CategoryDTO,
  type TransactionType,
  type NecessityClass,
} from '@arth/contracts';
import {
  fetchTransactions,
  fetchCategories,
  deleteTransaction,
  restoreTransaction,
} from '@/lib/api-client';
import { formatDateHuman, formatPaiseToINR } from '@/lib/format';
import { computePresetDateRange } from './date-range-utils';
import { ExportPdfDialog } from './ExportPdfDialog';
import { type UserProfileSummary } from './ledger-pdf-exporter';
import { TransactionDetailDrawer } from './TransactionDetailDrawer';
import { DeleteTransactionModal } from './DeleteTransactionModal';
import { QuickAddModal } from './QuickAddModal';

export type LedgerDatePreset = 'all' | 'this_month' | 'last_month' | 'this_year';
export type LedgerSortOption = 'date_desc' | 'amount_desc' | 'amount_asc';

export interface TransactionLedgerProps {
  userProfile?: UserProfileSummary;
  onOpenQuickAdd: () => void;
  refreshTrigger: number;
  onTransactionMutated?: () => void;
}

// In-memory query cache for recent filter queries to make back-and-forth filtering instantaneous
const ledgerQueryCache = new Map<string, TransactionDTO[]>();

export function clearLedgerQueryCache(): void {
  ledgerQueryCache.clear();
}

export function TransactionLedger({
  userProfile,
  onOpenQuickAdd,
  refreshTrigger,
  onTransactionMutated,
}: TransactionLedgerProps) {
  const [transactions, setTransactions] = useState<TransactionDTO[]>([]);
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedType, setSelectedType] = useState<TransactionType | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedNecessity, setSelectedNecessity] = useState<NecessityClass | 'all'>('all');
  const [selectedDatePreset, setSelectedDatePreset] = useState<LedgerDatePreset>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<LedgerSortOption>('date_desc');

  // Interactive transaction details & mutations state
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionDTO | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<TransactionDTO | null>(null);
  const [deletingTransaction, setDeletingTransaction] = useState<TransactionDTO | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Undo soft-delete state
  const [undoTxn, setUndoTxn] = useState<TransactionDTO | null>(null);
  const [isUndoing, setIsUndoing] = useState<boolean>(false);
  const undoTimerRef = useRef<NodeJS.Timeout | null>(null);

  // PDF Export Dialog State
  const [isExportDialogOpen, setIsExportDialogOpen] = useState<boolean>(false);

  // Sequence ref and AbortController to cancel obsolete in-flight requests and prevent race conditions
  const querySeqRef = useRef<number>(0);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Fetch Categories once on mount or when refreshTrigger fires (not on every filter selection)
  useEffect(() => {
    let isMounted = true;
    fetchCategories()
      .then((catRes) => {
        if (isMounted) {
          setCategories(catRes.categories || []);
        }
      })
      .catch((err) => {
        console.warn('[Ledger] Non-fatal category loading error:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [refreshTrigger]);

  // Compute active date range based on preset
  const activeDateRange = useMemo(() => {
    if (selectedDatePreset === 'all') return { startDate: undefined, endDate: undefined };
    const range = computePresetDateRange(selectedDatePreset);
    return { startDate: range.startDate, endDate: range.endDate };
  }, [selectedDatePreset]);

  // 2. Fetch Transactions with Debounced Loading Indicator & Sequence Tracking
  const loadTransactions = useCallback(() => {
    querySeqRef.current += 1;
    const currentSeq = querySeqRef.current;

    // Invalidate cache if refreshTrigger changed
    const cacheKey = `${selectedType}_${selectedCategory}_${selectedNecessity}_${activeDateRange.startDate || 'all'}_${activeDateRange.endDate || 'all'}`;

    // Fast-path: check in-memory cache for instant render without network delay
    if (ledgerQueryCache.has(cacheKey)) {
      const cached = ledgerQueryCache.get(cacheKey)!;
      Promise.resolve().then(() => {
        if (querySeqRef.current === currentSeq) {
          setTransactions(cached);
          setIsInitialLoading(false);
          setIsRefreshing(false);
          setError(null);
        }
      });
      return;
    }

    // Set a subtle 90ms debounce timer before displaying the loading bar.
    // If the request completes in under 90ms, the loading indicator never flashes!
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      if (querySeqRef.current === currentSeq) {
        setIsRefreshing(true);
      }
    }, 90);

    const queryParams = {
      type: selectedType === 'all' ? undefined : selectedType,
      category_id: selectedCategory === 'all' ? undefined : selectedCategory,
      necessity:
        selectedType !== 'income' && selectedNecessity !== 'all' ? selectedNecessity : undefined,
      start_date: activeDateRange.startDate,
      end_date: activeDateRange.endDate,
      page_size: 50,
    };

    fetchTransactions(queryParams)
      .then((txnRes) => {
        if (querySeqRef.current !== currentSeq) return; // Stale response discarded

        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        const items = txnRes.items || [];
        ledgerQueryCache.set(cacheKey, items);
        setTransactions(items);
        setError(null);
        setIsInitialLoading(false);
        setIsRefreshing(false);
      })
      .catch((err: unknown) => {
        if (querySeqRef.current !== currentSeq) return;

        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        const msg = err instanceof Error ? err.message : 'Failed to load ledger data';
        setError(msg);
        setIsInitialLoading(false);
        setIsRefreshing(false);
      });
  }, [selectedType, selectedCategory, selectedNecessity, activeDateRange]);

  // Clear query cache on external data mutations
  useEffect(() => {
    clearLedgerQueryCache();
  }, [refreshTrigger]);

  useEffect(() => {
    loadTransactions();

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [loadTransactions, refreshTrigger]);

  // Clean up undo timer on unmount
  useEffect(() => {
    return () => {
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
      }
    };
  }, []);

  // 3. Local Search & Sorting (Computed instantly without server trips)
  const filteredTransactions = useMemo(() => {
    let result = transactions;

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((t) => {
        const desc = (t.description || '').toLowerCase();
        const cat = (t.category_name || '').toLowerCase();
        const notes = (t.notes || '').toLowerCase();
        const date = t.transaction_date.toLowerCase();
        const inr = t.formatted_inr.toLowerCase();
        return (
          desc.includes(q) ||
          cat.includes(q) ||
          notes.includes(q) ||
          date.includes(q) ||
          inr.includes(q)
        );
      });
    }

    if (sortBy === 'amount_desc') {
      result = [...result].sort((a, b) => b.amount_paise - a.amount_paise);
    } else if (sortBy === 'amount_asc') {
      result = [...result].sort((a, b) => a.amount_paise - b.amount_paise);
    }

    return result;
  }, [transactions, searchQuery, sortBy]);

  // Compute Net Cash Flow strictly from visible / filtered transactions
  const { totalIncomePaise, totalExpensePaise, netCashFlowPaise } = useMemo(() => {
    let income = BigInt(0);
    let expense = BigInt(0);

    for (const t of filteredTransactions) {
      const p = BigInt(t.amount_paise);
      if (t.type === 'income') {
        income += p;
      } else {
        expense += p;
      }
    }

    return {
      totalIncomePaise: income,
      totalExpensePaise: expense,
      netCashFlowPaise: income - expense,
    };
  }, [filteredTransactions]);

  const netFormatted = useMemo(() => {
    const isNeg = netCashFlowPaise < BigInt(0);
    const abs = isNeg ? -netCashFlowPaise : netCashFlowPaise;
    const whole = abs / BigInt(100);
    const frac = abs % BigInt(100);
    const formatted = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(whole);

    return `${isNeg ? '-' : '+'}${formatted}.${frac.toString().padStart(2, '0')}`;
  }, [netCashFlowPaise]);

  // Handler: Open edit modal from details drawer
  const handleOpenEdit = (txn: TransactionDTO) => {
    setSelectedTransaction(null);
    setEditingTransaction(txn);
  };

  // Handler: Open delete modal from details drawer
  const handleOpenDelete = (txn: TransactionDTO) => {
    setSelectedTransaction(null);
    setDeleteError(null);
    setDeletingTransaction(txn);
  };

  // Handler: Confirm delete
  const handleConfirmDelete = async () => {
    if (!deletingTransaction) return;

    setIsDeleting(true);
    setDeleteError(null);

    try {
      await deleteTransaction(deletingTransaction.id);

      // Successfully soft-deleted: remove from visible transactions list
      const target = deletingTransaction;
      clearLedgerQueryCache();
      setTransactions((prev) => prev.filter((t) => t.id !== target.id));
      setDeletingTransaction(null);

      // Offer Undo notification
      setUndoTxn(target);
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      undoTimerRef.current = setTimeout(() => {
        setUndoTxn(null);
      }, 7000);

      // Notify parent to refresh dashboard totals and stats
      onTransactionMutated?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete transaction';
      setDeleteError(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  // Handler: Undo soft-delete
  const handleUndo = async () => {
    if (!undoTxn || isUndoing) return;

    setIsUndoing(true);
    try {
      const res = await restoreTransaction(undoTxn.id);
      setUndoTxn(null);
      clearLedgerQueryCache();

      // Prepend or reinsert restored transaction
      setTransactions((prev) => {
        if (prev.some((t) => t.id === res.transaction.id)) return prev;
        return [res.transaction, ...prev];
      });

      // Notify parent to refresh dashboard totals
      onTransactionMutated?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to restore transaction';
      setError(msg);
    } finally {
      setIsUndoing(false);
    }
  };

  // Handler: Edit saved successfully
  const handleEditSuccess = () => {
    clearLedgerQueryCache();
    setEditingTransaction(null);
    onTransactionMutated?.();
  };

  // Clear all filters handler
  const handleResetFilters = () => {
    setSelectedType('all');
    setSelectedCategory('all');
    setSelectedNecessity('all');
    setSelectedDatePreset('all');
    setSearchQuery('');
    setSortBy('date_desc');
  };

  const isAnyFilterActive =
    selectedType !== 'all' ||
    selectedCategory !== 'all' ||
    selectedNecessity !== 'all' ||
    selectedDatePreset !== 'all' ||
    searchQuery.trim().length > 0;

  return (
    <div className="space-y-5">
      {/* 1. Net Cash Flow & Summary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl shadow-xs transition-colors">
        <div>
          <span className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-medium">
            Net Cash Flow
          </span>
          <div
            className={`text-2xl font-mono tracking-tight font-semibold mt-0.5 ${
              netCashFlowPaise > BigInt(0)
                ? 'text-emerald-600 dark:text-emerald-400'
                : netCashFlowPaise < BigInt(0)
                ? 'text-red-600 dark:text-red-400'
                : 'text-[var(--text-primary)]'
            }`}
          >
            {netFormatted}
          </div>
          <span className="text-[10px] text-[var(--text-muted)]">
            Computed from current view
          </span>
        </div>

        <div className="border-t md:border-t-0 md:border-l border-[var(--border-hairline)] pt-2 md:pt-0 md:pl-4">
          <span className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-medium">
            Total Income
          </span>
          <div className="text-lg font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
            +{formatPaiseToINR(totalIncomePaise)}
          </div>
        </div>

        <div className="border-t md:border-t-0 md:border-l border-[var(--border-hairline)] pt-2 md:pt-0 md:pl-4">
          <span className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-medium">
            Total Expense
          </span>
          <div className="text-lg font-mono text-red-600 dark:text-red-400 mt-0.5">
            -{formatPaiseToINR(totalExpensePaise)}
          </div>
        </div>
      </div>

      {/* Undo Notification Banner */}
      {undoTxn && (
        <div className="p-3 bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] rounded-lg shadow-sm flex items-center justify-between transition-all">
          <div className="flex items-center gap-2">
            <span>🗑️</span>
            <span>
              Removed <strong>{undoTxn.description || undoTxn.category_name || 'transaction'}</strong> ({undoTxn.formatted_inr}) from active ledger.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleUndo}
              disabled={isUndoing}
              className="px-2.5 py-1 text-xs font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-md hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
            >
              {isUndoing ? 'Restoring...' : 'Undo'}
            </button>
            <button
              type="button"
              onClick={() => setUndoTxn(null)}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] px-1"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* 2. Filter Bar & Action Triggers */}
      <div className="space-y-3 pb-3 border-b border-[var(--border-hairline)]">
        {/* Row A: Primary Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Type Segmented Filter */}
          <div className="flex p-0.5 bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] rounded-lg text-xs font-medium shrink-0">
            {(['all', 'expense', 'income'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setSelectedType(t)}
                className={`px-3 py-1 rounded-md capitalize transition-colors cursor-pointer ${
                  selectedType === t
                    ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs font-semibold'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Category Dropdown */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="text-xs bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-lg px-2.5 py-1.5 text-[var(--text-secondary)] focus:outline-hidden cursor-pointer"
          >
            <option value="all">All Categories</option>
            {categories
              .filter((c) => selectedType === 'all' || c.type === selectedType)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {selectedType === 'all' ? `(${c.type})` : ''}
                </option>
              ))}
          </select>

          {/* Necessity Dropdown */}
          <select
            value={selectedNecessity}
            onChange={(e) => setSelectedNecessity(e.target.value as NecessityClass | 'all')}
            disabled={selectedType === 'income'}
            className="text-xs bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-lg px-2.5 py-1.5 text-[var(--text-secondary)] focus:outline-hidden cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title={selectedType === 'income' ? 'Necessity applies to expenses only' : 'Filter by necessity tier'}
          >
            <option value="all">All Necessities</option>
            <option value="essential">Essential</option>
            <option value="optional">Optional</option>
            <option value="luxury">Luxury</option>
          </select>

          {/* Date Range Preset Dropdown */}
          <select
            value={selectedDatePreset}
            onChange={(e) => setSelectedDatePreset(e.target.value as LedgerDatePreset)}
            className="text-xs bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-lg px-2.5 py-1.5 text-[var(--text-secondary)] focus:outline-hidden cursor-pointer"
            title="Filter by statement date period"
          >
            <option value="all">All Time</option>
            <option value="this_month">This Month</option>
            <option value="last_month">Last Month</option>
            <option value="this_year">This Year</option>
          </select>

          {/* Sort By Dropdown */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as LedgerSortOption)}
            className="text-xs bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-lg px-2.5 py-1.5 text-[var(--text-secondary)] focus:outline-hidden cursor-pointer"
            title="Sort transaction ordering"
          >
            <option value="date_desc">Newest First</option>
            <option value="amount_desc">Amount: High to Low</option>
            <option value="amount_asc">Amount: Low to High</option>
          </select>
        </div>

        {/* Row B: Search Input & Action Buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          {/* Real-time local search */}
          <div className="relative flex-1 max-w-md">
            <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-xs text-[var(--text-muted)]">
              🔍
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search description, category, notes, or amount..."
              className="w-full pl-8 pr-7 py-1.5 text-xs bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-hidden focus:border-[var(--focus-ring)] transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="absolute inset-y-0 right-0 pr-2 flex items-center text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* Counter, Updating Status & Actions */}
          <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0">
            {/* Status indicator */}
            <div className="text-[11px] text-[var(--text-muted)] min-w-[70px]">
              {isRefreshing ? (
                <span className="inline-flex items-center gap-1.5 text-[var(--text-primary)] font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                  Updating…
                </span>
              ) : (
                <span>
                  {filteredTransactions.length}{' '}
                  {filteredTransactions.length === 1 ? 'record' : 'records'}
                </span>
              )}
            </div>

            {/* Download PDF Trigger Button - Opens Export Dialog */}
            <button
              type="button"
              onClick={() => setIsExportDialogOpen(true)}
              title="Configure and download transaction statement PDF"
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-subtle)] rounded-lg transition-colors cursor-pointer shadow-2xs"
            >
              <span className="text-xs" aria-hidden="true">📄</span>
              <span className="hidden sm:inline">Download</span> PDF
            </button>

            <button
              type="button"
              onClick={onOpenQuickAdd}
              className="inline-flex items-center justify-center gap-1 px-3.5 py-1.5 text-xs font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-lg hover:bg-[var(--action-primary-hover)] transition-colors shadow-xs cursor-pointer shrink-0"
            >
              <span>+ Record Entry</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. Non-disruptive Indeterminate Progress Bar */}
      <div className="h-0.5 w-full overflow-hidden rounded-full transition-opacity duration-150">
        {isRefreshing ? (
          <div
            role="progressbar"
            aria-label="Updating ledger"
            aria-busy="true"
            className="h-full w-full bg-[var(--action-primary-bg)] animate-indeterminate"
          />
        ) : (
          <div className="h-full w-full bg-transparent" />
        )}
      </div>

      {/* 4. Transaction Items / Table View */}
      {error && (
        <div className="p-3 text-xs bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 rounded-md flex items-center justify-between gap-2">
          <span>{error}</span>
          <button
            type="button"
            onClick={loadTransactions}
            className="text-xs font-semibold underline hover:no-underline cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {isInitialLoading && transactions.length === 0 ? (
        <div className="space-y-2 py-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-14 bg-[var(--bg-surface-subtle)] animate-pulse rounded-xl border border-[var(--border-hairline)]"
            />
          ))}
        </div>
      ) : filteredTransactions.length === 0 ? (
        <div className="text-center py-12 px-4 border border-dashed border-[var(--border-subtle)] rounded-xl bg-[var(--bg-surface)]">
          <div className="text-2xl mb-2">📋</div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
            {isAnyFilterActive ? 'No matching transactions found' : 'No transactions recorded yet'}
          </h3>
          <p className="text-xs text-[var(--text-muted)] max-w-sm mx-auto mb-4">
            {isAnyFilterActive
              ? 'Try modifying your search term or adjusting filters to view other transactions.'
              : 'Start logging your daily income and expense transactions with instant categorization.'}
          </p>
          {isAnyFilterActive ? (
            <button
              type="button"
              onClick={handleResetFilters}
              className="px-3.5 py-1.5 text-xs font-medium border border-[var(--border-subtle)] rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] transition-colors cursor-pointer"
            >
              Clear all filters
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenQuickAdd}
              className="px-4 py-2 text-xs font-medium bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-lg hover:bg-[var(--action-primary-hover)] transition-colors cursor-pointer"
            >
              + Record First Transaction
            </button>
          )}
        </div>
      ) : (
        <div
          className={`space-y-2 min-h-[160px] transition-opacity duration-150 ${
            isRefreshing ? 'opacity-65' : 'opacity-100'
          }`}
        >
          {filteredTransactions.map((txn) => {
            const isIncome = txn.type === 'income';
            return (
              <div
                key={txn.id}
                role="button"
                tabIndex={0}
                aria-label={`Transaction ${txn.description || txn.category_name || 'entry'}, ${isIncome ? 'plus' : 'minus'} ${txn.formatted_inr}`}
                onClick={() => setSelectedTransaction(txn)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedTransaction(txn);
                  }
                }}
                className="flex items-center justify-between p-3.5 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-subtle)] active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:outline-hidden transition-all cursor-pointer group"
              >
                {/* Left: Category, Date, Badges */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[var(--text-primary)] group-hover:underline underline-offset-2">
                      {txn.description || txn.category_name || 'Uncategorized'}
                    </span>
                    {txn.description && txn.category_name && (
                      <span className="text-xs text-[var(--text-secondary)] truncate max-w-[160px] md:max-w-xs">
                        • {txn.category_name}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
                    <span>{formatDateHuman(txn.transaction_date)}</span>
                    <span>•</span>
                    <span className="capitalize">{txn.payment_method}</span>
                    {txn.necessity && (
                      <>
                        <span>•</span>
                        <span
                          className={`capitalize px-1.5 py-0.5 rounded text-[9px] font-medium ${
                            txn.necessity === 'essential'
                              ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                              : txn.necessity === 'optional'
                              ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                              : 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300'
                          }`}
                        >
                          {txn.necessity}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Right: Amount & Note Marker */}
                <div className="text-right">
                  <div
                    className={`font-mono text-sm md:text-base font-semibold tracking-tight ${
                      isIncome
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-[var(--text-primary)]'
                    }`}
                  >
                    {isIncome ? `+${txn.formatted_inr}` : `-${txn.formatted_inr}`}
                  </div>
                  {txn.notes && (
                    <span className="text-[10px] text-[var(--text-muted)]" title={txn.notes}>
                      note 📝
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Interactive Transaction Details Drawer */}
      <TransactionDetailDrawer
        transaction={selectedTransaction}
        isOpen={Boolean(selectedTransaction)}
        onClose={() => setSelectedTransaction(null)}
        onEdit={handleOpenEdit}
        onDelete={handleOpenDelete}
      />

      {/* Edit Transaction Modal (Reuses QuickAddModal) */}
      {editingTransaction && (
        <QuickAddModal
          isOpen={true}
          onClose={() => setEditingTransaction(null)}
          onSuccess={handleEditSuccess}
          editingTransaction={editingTransaction}
        />
      )}

      {/* Delete Transaction Confirmation Dialog */}
      <DeleteTransactionModal
        transaction={deletingTransaction}
        isOpen={Boolean(deletingTransaction)}
        isDeleting={isDeleting}
        onClose={() => {
          if (!isDeleting) setDeletingTransaction(null);
        }}
        onConfirm={handleConfirmDelete}
        errorMessage={deleteError}
      />

      {/* Flexible Ledger PDF Export Dialog */}
      <ExportPdfDialog
        isOpen={isExportDialogOpen}
        onClose={() => setIsExportDialogOpen(false)}
        categories={categories}
        initialType={selectedType}
        initialCategoryId={selectedCategory}
        initialNecessity={selectedNecessity}
        userProfile={userProfile}
      />
    </div>
  );
}
