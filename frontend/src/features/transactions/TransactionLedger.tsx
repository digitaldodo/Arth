'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Badge } from '@/components/ui/Badge';
import {
  type TransactionDTO,
  type CategoryDTO,
  type TransactionType,
  type NecessityClass,
  type PaymentMethod,
} from '@arth/contracts';
import { fetchCategories, fetchTransactions, restoreTransaction } from '@/lib/api-client';
import { formatDateHuman, formatPaiseToINR } from '@/lib/format';
import { computePresetDateRange } from './date-range-utils';
import { ExportPdfDialog } from './ExportPdfDialog';
import { type UserProfileSummary } from './ledger-pdf-exporter';
import { TransactionDetailDrawer } from './TransactionDetailDrawer';
import { DeleteTransactionModal } from './DeleteTransactionModal';
import { QuickAddModal } from './QuickAddModal';
import { useCriticalOperation } from '@/features/pwa/critical-operation';
import { getCachedTransactions, getCachedCategories, setCachedCategories, getSyncMeta } from '@/lib/offline-db';
import { syncEngine } from '@/features/sync/sync-engine';
import { useStandalonePwa } from '@/features/pwa/useStandalonePwa';

export type LedgerDatePreset = 'all' | 'this_month' | 'last_month' | 'this_year' | 'custom';
export type LedgerSortOption = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';

export const LEDGER_SORT_STORAGE_KEY = 'arth_ledger_sort_preference';

export function getInitialLedgerSortPreference(): LedgerSortOption {
  if (typeof window === 'undefined') return 'date_desc';
  try {
    const saved = localStorage.getItem(LEDGER_SORT_STORAGE_KEY);
    if (saved === 'date_desc' || saved === 'date_asc' || saved === 'amount_desc' || saved === 'amount_asc') {
      return saved;
    }
  } catch {
    // Ignore storage errors in restricted environments
  }
  return 'date_desc';
}

export function sortLedgerTransactions(
  transactions: TransactionDTO[],
  sortBy: LedgerSortOption
): TransactionDTO[] {
  return [...transactions].sort((a, b) => {
    if (sortBy === 'amount_desc') {
      if (b.amount_paise !== a.amount_paise) {
        return b.amount_paise - a.amount_paise;
      }
      if (a.transaction_date !== b.transaction_date) {
        return b.transaction_date.localeCompare(a.transaction_date);
      }
      const recA = a.recorded_at || a.created_at || '';
      const recB = b.recorded_at || b.created_at || '';
      if (recA !== recB) return recB.localeCompare(recA);
      const crA = a.created_at || '';
      const crB = b.created_at || '';
      if (crA !== crB) return crB.localeCompare(crA);
      return (b.id || '').localeCompare(a.id || '');
    }

    if (sortBy === 'amount_asc') {
      if (a.amount_paise !== b.amount_paise) {
        return a.amount_paise - b.amount_paise;
      }
      if (a.transaction_date !== b.transaction_date) {
        return b.transaction_date.localeCompare(a.transaction_date);
      }
      const recA = a.recorded_at || a.created_at || '';
      const recB = b.recorded_at || b.created_at || '';
      if (recA !== recB) return recB.localeCompare(recA);
      const crA = a.created_at || '';
      const crB = b.created_at || '';
      if (crA !== crB) return crB.localeCompare(crA);
      return (b.id || '').localeCompare(a.id || '');
    }

    if (sortBy === 'date_asc') {
      // 1. transaction_date ASC
      if (a.transaction_date !== b.transaction_date) {
        return a.transaction_date.localeCompare(b.transaction_date);
      }
      // 2. recorded_at ASC
      const recA = a.recorded_at || a.created_at || '';
      const recB = b.recorded_at || b.created_at || '';
      if (recA !== recB) {
        return recA.localeCompare(recB);
      }
      // 3. created_at ASC
      const crA = a.created_at || '';
      const crB = b.created_at || '';
      if (crA !== crB) {
        return crA.localeCompare(crB);
      }
      // 4. Transaction ID ASC (stable tie-breaker)
      return (a.id || '').localeCompare(b.id || '');
    }

    // Default: 'date_desc' (Newest First)
    // 1. transaction_date DESC
    if (a.transaction_date !== b.transaction_date) {
      return b.transaction_date.localeCompare(a.transaction_date);
    }
    // 2. recorded_at DESC
    const recA = a.recorded_at || a.created_at || '';
    const recB = b.recorded_at || b.created_at || '';
    if (recA !== recB) {
      return recB.localeCompare(recA);
    }
    // 3. created_at DESC
    const crA = a.created_at || '';
    const crB = b.created_at || '';
    if (crA !== crB) {
      return crB.localeCompare(crA);
    }
    // 4. Transaction ID DESC (stable tie-breaker)
    return (b.id || '').localeCompare(a.id || '');
  });
}

export interface TransactionLedgerProps {
  userProfile?: UserProfileSummary;
  hasPassword?: boolean;
  onOpenQuickAdd: () => void;
  refreshTrigger: number;
  onTransactionMutated?: () => void;
  onAccountPasswordVerified?: () => void;
  userId?: string;
  initialFilter?: {
    categoryId?: string;
    necessity?: NecessityClass;
    startDate: string;
    endDate: string;
    label: string;
    amountPaise: number;
  } | null;
}

// In-memory query cache for recent filter queries to make back-and-forth filtering instantaneous
const ledgerQueryCache = new Map<string, TransactionDTO[]>();

export function clearLedgerQueryCache(): void {
  ledgerQueryCache.clear();
}

export function TransactionLedger({
  userProfile,
  hasPassword,
  onOpenQuickAdd,
  refreshTrigger,
  onTransactionMutated,
  onAccountPasswordVerified,
  userId,
  initialFilter = null,
}: TransactionLedgerProps) {
  const isPwa = useStandalonePwa();
  const [transactions, setTransactions] = useState<TransactionDTO[]>([]);
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshotComplete, setSnapshotComplete] = useState(false);

  // Filters
  const [selectedType, setSelectedType] = useState<TransactionType | 'all'>(initialFilter ? 'expense' : 'all');
  const [selectedCategory, setSelectedCategory] = useState<string>(initialFilter?.categoryId || 'all');
  const [selectedNecessity, setSelectedNecessity] = useState<NecessityClass | 'all'>(initialFilter?.necessity || 'all');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | 'all'>('all');
  const [selectedDatePreset, setSelectedDatePreset] = useState<LedgerDatePreset>(initialFilter ? 'custom' : 'all');
  const [dateRangeOverride, setDateRangeOverride] = useState(initialFilter ? {
    startDate: initialFilter.startDate,
    endDate: initialFilter.endDate,
  } : null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortByState] = useState<LedgerSortOption>(getInitialLedgerSortPreference);

  const handleSortChange = (newSort: LedgerSortOption) => {
    setSortByState(newSort);
    try {
      localStorage.setItem(LEDGER_SORT_STORAGE_KEY, newSort);
    } catch {
      // Ignore localStorage errors
    }
  };

  // Interactive transaction details & mutations state
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionDTO | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<TransactionDTO | null>(null);
  useCriticalOperation(editingTransaction !== null);
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

  // Categories and transactions are read from the signed-in user's local database first.
  useEffect(() => {
    let isMounted = true;
    if (!userId) return;
    if (isPwa) getCachedCategories(userId).then((cached) => { if (isMounted && cached.length) setCategories(cached); });
    fetchCategories()
      .then((catRes) => {
        if (isMounted) {
          setCategories(catRes.categories || []);
          if (userId) void setCachedCategories(catRes.categories || [], userId);
          // Refreshes are owned by the sync engine; never query from a filter interaction.
        }
      })
      .catch((err) => {
        console.warn('[Ledger] Non-fatal category loading error:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [refreshTrigger, userId, isPwa]);

  // Compute active date range based on preset
  const activeDateRange = useMemo(() => {
    if (dateRangeOverride) return dateRangeOverride;
    if (selectedDatePreset === 'custom' && initialFilter) {
      return { startDate: initialFilter.startDate, endDate: initialFilter.endDate };
    }
    if (selectedDatePreset === 'all' || selectedDatePreset === 'custom') return { startDate: undefined, endDate: undefined };
    const range = computePresetDateRange(selectedDatePreset);
    return { startDate: range.startDate, endDate: range.endDate };
  }, [selectedDatePreset, dateRangeOverride, initialFilter]);

  const moveMonth = (offset: number) => {
    const base = activeDateRange.startDate || new Date().toISOString().slice(0, 10);
    const [year, month] = base.split('-').map(Number);
    const start = new Date(Date.UTC(year, month - 1 + offset, 1));
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
    const asDate = (date: Date) => date.toISOString().slice(0, 10);
    setSelectedDatePreset('custom');
    setDateRangeOverride({ startDate: asDate(start), endDate: asDate(end) });
  };

  // Installed PWAs query the durable local snapshot; desktop web queries the authenticated API.
  const loadTransactions = useCallback(() => {
    querySeqRef.current += 1;
    const currentSeq = querySeqRef.current;
    if (!userId) return;
    if (!isPwa) {
      setIsRefreshing(true);
      setError(null);
      void fetchTransactions({
        type: selectedType === 'all' ? undefined : selectedType,
        category_id: selectedCategory === 'all' ? undefined : selectedCategory,
        necessity: selectedType === 'income' || selectedNecessity === 'all' ? undefined : selectedNecessity,
        start_date: activeDateRange.startDate,
        end_date: activeDateRange.endDate,
        sort_by: sortBy,
        page_size: 50,
      }).then((result) => {
        if (querySeqRef.current !== currentSeq) return;
        setTransactions(result.items || []);
        setSnapshotComplete(false);
        setIsInitialLoading(false);
        setIsRefreshing(false);
      }).catch((err: unknown) => {
        if (querySeqRef.current !== currentSeq) return;
        setError(err instanceof Error ? err.message : 'Could not load transactions. Check your connection.');
        setTransactions([]);
        setIsInitialLoading(false);
        setIsRefreshing(false);
      });
      return;
    }
    void Promise.resolve().then(() => Promise.all([getCachedTransactions(userId), getSyncMeta(userId)])).then(([items, meta]) => {
      if (querySeqRef.current !== currentSeq) return;
      setTransactions(items);
      setSnapshotComplete(meta.transactionsSnapshotComplete);
      setError(null);
      setIsInitialLoading(false);
      setIsRefreshing(false);
    });
  }, [userId, isPwa, selectedType, selectedCategory, selectedNecessity, activeDateRange, sortBy]);

  // Clear query cache on external data mutations
  useEffect(() => {
    clearLedgerQueryCache();
  }, [refreshTrigger]);

  useEffect(() => {
    void Promise.resolve().then(loadTransactions);

    return () => { querySeqRef.current += 1; };
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
    let result = transactions.filter((t) =>
      (selectedType === 'all' || t.type === selectedType) &&
      (selectedCategory === 'all' || t.category_id === selectedCategory) &&
      (selectedType === 'income' || selectedNecessity === 'all' || t.necessity === selectedNecessity) &&
      (selectedPaymentMethod === 'all' || t.payment_method === selectedPaymentMethod) &&
      (!activeDateRange.startDate || t.transaction_date >= activeDateRange.startDate) &&
      (!activeDateRange.endDate || t.transaction_date <= activeDateRange.endDate)
    );

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((t) => {
        const desc = (t.description || '').toLowerCase();
        const cat = (t.category_name || '').toLowerCase();
        const notes = (t.notes || '').toLowerCase();
        const date = t.transaction_date.toLowerCase();
        const humanDate = formatDateHuman(t.transaction_date).toLowerCase();
        const inr = t.formatted_inr.toLowerCase();
        return (
          desc.includes(q) ||
          cat.includes(q) ||
          notes.includes(q) ||
          date.includes(q) ||
          humanDate.includes(q) ||
          inr.includes(q)
        );
      });
    }

    return sortLedgerTransactions(result, sortBy);
  }, [transactions, searchQuery, sortBy, selectedType, selectedCategory, selectedNecessity, selectedPaymentMethod, activeDateRange]);

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
      await syncEngine.deleteTransactionLocalFirst(deletingTransaction.id, userId || 'default');

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
    setSelectedPaymentMethod('all');
    setSelectedDatePreset('all');
    setDateRangeOverride(null);
    setSearchQuery('');
    handleSortChange('date_desc');
  };

  const isAnyFilterActive =
    selectedType !== 'all' ||
    selectedCategory !== 'all' ||
    selectedNecessity !== 'all' ||
    selectedPaymentMethod !== 'all' ||
    selectedDatePreset !== 'all' ||
    dateRangeOverride !== null ||
    searchQuery.trim().length > 0 ||
    sortBy !== 'date_desc';

  return (
    <div className="space-y-5">
      {initialFilter && (
        <div className="flex flex-col gap-1 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">{initialFilter.label} transactions</h2>
            <p className="text-xs text-[var(--text-muted)]">Filtered from {initialFilter.startDate} to {initialFilter.endDate}</p>
          </div>
          <div className="font-mono text-sm font-semibold text-[var(--text-primary)]">{formatPaiseToINR(initialFilter.amountPaise)}</div>
        </div>
      )}
      {/* 1. Net Cash Flow & Summary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl shadow-xs transition-colors">
        <div>
          <span className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-medium">
            Net Cash Flow
          </span>
          <div
            className={`text-2xl font-mono tracking-tight font-semibold mt-0.5 ${
              netCashFlowPaise > BigInt(0)
                ? 'text-[var(--income-fg)]'
                : netCashFlowPaise < BigInt(0)
                ? 'text-[var(--expense-fg)]'
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
          <div className="text-lg font-mono text-[var(--income-fg)] mt-0.5">
            +{formatPaiseToINR(totalIncomePaise)}
          </div>
        </div>

        <div className="border-t md:border-t-0 md:border-l border-[var(--border-hairline)] pt-2 md:pt-0 md:pl-4">
          <span className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-medium">
            Total Expense
          </span>
          <div className="text-lg font-mono text-[var(--expense-fg)] mt-0.5">
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

      {/* 2. Redesigned Filter Bar & Action Triggers */}
      <div className="space-y-3.5 pb-4 border-b border-[var(--border-hairline)]">
        {/* Group A — Transaction Type Segmented Control (Own Row, Full Touch Targets) */}
        <div className="w-full">
          <div
            role="group"
            aria-label="Filter by transaction type"
            className="flex w-full p-1 bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] rounded-xl text-xs font-medium"
          >
            {(['all', 'expense', 'income'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setSelectedType(t)}
                className={`flex-1 min-h-[38px] py-2 text-center rounded-lg capitalize transition-all cursor-pointer flex items-center justify-center ${
                  selectedType === t
                    ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs font-semibold'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Group B — Category Dropdown (Own Row, Full Width) */}
        <div className="w-full">
          <select
            aria-label="Filter by category"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full h-10 px-3 py-2 text-xs bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-lg text-[var(--text-secondary)] focus:outline-hidden focus:border-[var(--focus-ring)] cursor-pointer transition-colors"
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
        </div>

        {/* Group C — Additional Filters (Mobile 2-Column Grid, Desktop 4-Column Grid) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 w-full">
          {/* 1. Necessity */}
          <select
            aria-label="Filter by necessity"
            value={selectedNecessity}
            onChange={(e) => setSelectedNecessity(e.target.value as NecessityClass | 'all')}
            disabled={selectedType === 'income'}
            className="w-full h-10 px-3 py-2 text-xs bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-lg text-[var(--text-secondary)] focus:outline-hidden focus:border-[var(--focus-ring)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title={selectedType === 'income' ? 'Necessity applies to expenses only' : 'Filter by necessity tier'}
          >
            <option value="all">All Necessities</option>
            <option value="essential">Essential</option>
            <option value="optional">Optional</option>
            <option value="luxury">Luxury</option>
          </select>

          {/* 2. Payment Method */}
          <select
            aria-label="Filter by payment method"
            value={selectedPaymentMethod}
            onChange={(e) => setSelectedPaymentMethod(e.target.value as PaymentMethod | 'all')}
            className="w-full h-10 px-3 py-2 text-xs bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-lg text-[var(--text-secondary)] focus:outline-hidden focus:border-[var(--focus-ring)] cursor-pointer transition-colors"
          >
            <option value="all">All Payment Methods</option>
            <option value="cash">Cash</option>
            <option value="online">Online</option>
          </select>

          {/* 3. Date Range + Prev/Next Month Steppers */}
          <div className="flex items-center gap-1 w-full">
            <select
              aria-label="Filter by statement date period"
              value={selectedDatePreset}
              onChange={(e) => {
                setSelectedDatePreset(e.target.value as LedgerDatePreset);
                setDateRangeOverride(null);
              }}
              className="flex-1 min-w-0 h-10 px-2.5 py-2 text-xs bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-lg text-[var(--text-secondary)] focus:outline-hidden focus:border-[var(--focus-ring)] cursor-pointer transition-colors"
              title="Filter by statement date period"
            >
              <option value="all">All Time</option>
              {initialFilter && <option value="custom">Dashboard Range</option>}
              <option value="this_month">This Month</option>
              <option value="last_month">Last Month</option>
              <option value="this_year">This Year</option>
            </select>
            <button
              type="button"
              onClick={() => moveMonth(-1)}
              aria-label="Previous month"
              className="h-10 w-8 flex items-center justify-center shrink-0 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] transition-colors cursor-pointer"
              title="Previous month"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => moveMonth(1)}
              aria-label="Next month"
              className="h-10 w-8 flex items-center justify-center shrink-0 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] transition-colors cursor-pointer"
              title="Next month"
            >
              ›
            </button>
          </div>

          {/* 4. Sort Order */}
          <select
            aria-label="Sort transaction ordering"
            value={sortBy}
            onChange={(e) => handleSortChange(e.target.value as LedgerSortOption)}
            className="w-full h-10 px-3 py-2 text-xs bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-lg text-[var(--text-secondary)] focus:outline-hidden focus:border-[var(--focus-ring)] cursor-pointer transition-colors"
            title="Sort transaction ordering"
          >
            <option value="date_desc">Newest First</option>
            <option value="date_asc">Oldest First</option>
            <option value="amount_desc">Amount: High to Low</option>
            <option value="amount_asc">Amount: Low to High</option>
          </select>
        </div>

        {/* Group D — Search Input and Actions (Own Full-Width Rows, No Collision) */}
        <div className="space-y-2.5 w-full">
          {/* Full-width Search Input */}
          <div className="relative w-full">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-xs text-[var(--text-muted)]">
              🔍
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search description, category, notes, or amount..."
              className="w-full h-10 pl-9 pr-8 py-2 text-xs bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-hidden focus:border-[var(--focus-ring)] transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* Record Count, Live Status, and Clean Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-0.5">
            {/* Record Counter & Reset */}
            <div className="text-xs text-[var(--text-muted)] font-medium">
              {isRefreshing ? (
                <span className="inline-flex items-center gap-1.5 text-[var(--text-primary)] font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                  Updating…
                </span>
              ) : (
                <span>
                  {filteredTransactions.length}{' '}
                  {filteredTransactions.length === 1 ? 'record' : 'records'}
                  {isAnyFilterActive && (
                    <button
                      type="button"
                      onClick={handleResetFilters}
                      className="ml-2 text-[var(--action-primary-bg)] hover:underline cursor-pointer"
                    >
                      Reset filters
                    </button>
                  )}
                </span>
              )}
            </div>

            {/* Action Buttons: PDF Export & Record Entry */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsExportDialogOpen(true)}
                title="Configure and download transaction statement PDF"
                className="inline-flex items-center justify-center gap-1.5 min-h-[38px] px-3.5 py-2 text-xs font-semibold border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-subtle)] rounded-lg transition-colors cursor-pointer shadow-2xs"
              >
                <span className="text-xs" aria-hidden="true">📄</span>
                <span>Download PDF</span>
              </button>

              <button
                type="button"
                onClick={onOpenQuickAdd}
                className="inline-flex items-center justify-center gap-1 min-h-[38px] px-3.5 py-2 text-xs font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-lg hover:bg-[var(--action-primary-hover)] transition-colors shadow-xs cursor-pointer shrink-0"
              >
                <span>+ Record Entry</span>
              </button>
            </div>
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
            {isAnyFilterActive ? 'No matching transactions found' : snapshotComplete ? 'No transactions recorded in the downloaded ledger' : 'No offline copy of this transaction history is available yet'}
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

                  <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] flex-wrap">
                    <span className="shrink-0">{formatDateHuman(txn.transaction_date)}</span>
                    <span>•</span>
                    <Badge variant={txn.payment_method === 'online' ? 'online' : 'cash'} size="xs">
                      {txn.payment_method === 'online' ? 'Online' : 'Cash'}
                    </Badge>
                    {('sync_status' in txn && txn.sync_status === 'pending') && (
                      <Badge variant="warning" size="xs" dot={true} title="Waiting to sync">
                        Pending sync
                      </Badge>
                    )}
                    {txn.necessity && (
                      <Badge variant={txn.necessity} size="xs" dot={true}>
                        <span className="capitalize">{txn.necessity}</span>
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Right: Amount & Note Marker */}
                <div className="text-right">
                  <div
                    className={`font-mono text-sm md:text-base font-semibold tracking-tight ${
                      isIncome
                        ? 'text-[var(--income-fg)]'
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
          userId={userId}
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
        hasPassword={hasPassword}
        onAccountPasswordVerified={onAccountPasswordVerified}
      />
    </div>
  );
}
