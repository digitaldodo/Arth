'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Badge } from '@/components/ui/Badge';
import {
  type TransactionDTO,
  type CategoryDTO,
  type TransactionType,
  type NecessityClass,
  type PaymentMethod,
  parseINRToPaise,
} from '@arth/contracts';
import { saveUserMerchantRule } from '@/features/categorization/user-merchant-rules';
import { fetchCategories, fetchTransactions, restoreTransaction } from '@/lib/api-client';
import { formatDateHuman, formatPaiseToINR } from '@/lib/format';
import { sanitizeUserFacingError } from '@/lib/error-utils';
import { computePresetDateRange } from './date-range-utils';
import { ExportPdfDialog } from './ExportPdfDialog';
import { type UserProfileSummary } from './ledger-pdf-exporter';
import { TransactionDetailDrawer } from './TransactionDetailDrawer';
import { DeleteTransactionModal } from './DeleteTransactionModal';
import { QuickAddModal } from './QuickAddModal';
import { useCriticalOperation } from '@/features/pwa/critical-operation';
import {
  getCachedTransactions,
  getCachedCategories,
  setCachedCategories,
  replaceCachedTransactions,
} from '@/lib/offline-db';
import { syncEngine } from '@/features/sync/sync-engine';
import { useStandalonePwa } from '@/features/pwa/useStandalonePwa';
import { useBackHandler } from '@/features/navigation';
import { StatusBanner } from '@/components/ui/StatusBanner';

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
  onOpenStatementImport?: () => void;
  onNavigateToStatementImport?: () => void;
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
  onOpenStatementImport,
  onNavigateToStatementImport,
  refreshTrigger,
  onTransactionMutated,
  onAccountPasswordVerified,
  userId,
  initialFilter = null,
}: TransactionLedgerProps) {
  const isPwa = useStandalonePwa();
  const handleOpenImport = onOpenStatementImport || onNavigateToStatementImport;
  const [transactions, setTransactions] = useState<TransactionDTO[]>([]);
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isStale, setIsStale] = useState<boolean>(false);
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

  // Priority 7: Contextual Inline/Anchored Editing State
  interface InlineEditForm {
    id: string;
    amount: string;
    date: string;
    description: string;
    categoryId: string;
    type: TransactionType;
    necessity: NecessityClass | null;
    paymentMethod: PaymentMethod;
    rememberMerchant: boolean;
  }
  const [inlineEditingId, setInlineEditingId] = useState<string | null>(null);
  const [inlineForm, setInlineForm] = useState<InlineEditForm | null>(null);
  const [inlineEditError, setInlineEditError] = useState<string | null>(null);
  const [isSavingInline, setIsSavingInline] = useState(false);
  const [rememberToast, setRememberToast] = useState<string | null>(null);

  useCriticalOperation(editingTransaction !== null || inlineEditingId !== null);
  const [deletingTransaction, setDeletingTransaction] = useState<TransactionDTO | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Undo soft-delete state
  const [undoTxn, setUndoTxn] = useState<TransactionDTO | null>(null);
  const [isUndoing, setIsUndoing] = useState<boolean>(false);
  const undoTimerRef = useRef<NodeJS.Timeout | null>(null);

  // PDF Export Dialog State
  const [isExportDialogOpen, setIsExportDialogOpen] = useState<boolean>(false);

  // Back handler for Inline Editing
  useBackHandler({
    id: 'form-inline-editing',
    priority: 'modal',
    enabled: Boolean(inlineEditingId),
    onBack: () => {
      setInlineEditingId(null);
      setInlineForm(null);
      return true;
    },
  });
  // Priority 1: Back handler for Transaction Details Drawer
  useBackHandler({
    id: 'drawer-transaction-detail',
    priority: 'modal',
    enabled: Boolean(selectedTransaction),
    onBack: () => {
      setSelectedTransaction(null);
      return true;
    },
  });

  // Priority 1: Back handler for Delete Confirmation Dialog
  useBackHandler({
    id: 'dialog-delete-transaction',
    priority: 'dialog',
    enabled: Boolean(deletingTransaction),
    onBack: () => {
      if (!isDeleting) {
        setDeletingTransaction(null);
        return true;
      }
      return 'prevented';
    },
  });

  // Priority 1: Back handler for PDF Export Dialog
  useBackHandler({
    id: 'modal-export-pdf',
    priority: 'modal',
    enabled: isExportDialogOpen,
    onBack: () => {
      setIsExportDialogOpen(false);
      return true;
    },
  });

  // Sequence ref and AbortController to cancel obsolete in-flight requests and prevent race conditions
  const querySeqRef = useRef<number>(0);

  // Categories are read from the signed-in user's local database first (both Desktop and PWA).
  useEffect(() => {
    let isMounted = true;
    if (!userId) return;
    getCachedCategories(userId).then((cached) => {
      if (isMounted && cached.length) setCategories(cached);
    });
    fetchCategories()
      .then((catRes) => {
        if (isMounted && catRes.categories) {
          setCategories(catRes.categories);
          if (userId) void setCachedCategories(catRes.categories, userId);
        }
      })
      .catch((err) => {
        console.warn('[Ledger] Non-fatal category loading error:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [refreshTrigger, userId]);

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

  // Shared authoritative transaction loader:
  // 1. Instantly hydrates from local IndexedDB cache (both Desktop and PWA)
  // 2. Fetches fresh authoritative server transactions
  // 3. Handles Condition A (empty), Condition B (cached with stale alert), Condition C (server failure, no cache)
  const loadTransactions = useCallback(() => {
    querySeqRef.current += 1;
    const currentSeq = querySeqRef.current;
    if (!userId) return;

    // Fast-path local read-through
    getCachedTransactions(userId)
      .then((cached) => {
        if (querySeqRef.current !== currentSeq) return;
        if (cached && cached.length > 0) {
          setTransactions((current) => (current.length === 0 ? cached : current));
          setIsInitialLoading(false);
        }
      })
      .catch(() => {});

    setIsRefreshing(true);
    setError(null);

    if (!isPwa) {
      void fetchTransactions({
        type: selectedType === 'all' ? undefined : selectedType,
        category_id: selectedCategory === 'all' ? undefined : selectedCategory,
        necessity: selectedType === 'income' || selectedNecessity === 'all' ? undefined : selectedNecessity,
        start_date: activeDateRange.startDate,
        end_date: activeDateRange.endDate,
        sort_by: sortBy,
        page_size: 50,
      })
        .then(async (result) => {
          if (querySeqRef.current !== currentSeq) return;
          const items = result.items || [];

          // Merge un-synced local transactions from IndexedDB so freshly imported rows are immediately visible
          const cached = await getCachedTransactions(userId).catch(() => []);
          const pendingLocals = cached.filter((c) => c.sync_status === 'pending' || (c as { sync_status?: string }).sync_status === 'failed');

          const itemMap = new Map<string, TransactionDTO>();
          for (const item of items) {
            itemMap.set(item.id, item);
          }
          for (const local of pendingLocals) {
            if (!itemMap.has(local.id)) {
              itemMap.set(local.id, local);
            }
          }
          const merged = Array.from(itemMap.values());
          setTransactions(merged);
          setSnapshotComplete(true);
          setIsStale(false);
          setError(null);
          setIsInitialLoading(false);
          setIsRefreshing(false);
          // Persist fresh server records into durable IndexedDB cache
          if (
            items.length > 0 ||
            (selectedType === 'all' && selectedCategory === 'all' && !activeDateRange.startDate && !activeDateRange.endDate)
          ) {
            await replaceCachedTransactions(items, userId).catch(() => {});
          }
        })
        .catch(async (err: unknown) => {
          if (querySeqRef.current !== currentSeq) return;
          const sanitized = sanitizeUserFacingError(err, 'Could not retrieve transactions from server.');
          setError(sanitized);

          // Check if cached records are available
          const cached = await getCachedTransactions(userId).catch(() => []);
          if (querySeqRef.current !== currentSeq) return;

          if (cached && cached.length > 0) {
            // Condition B: Server failed, but cached records exist.
            // Retain cached records and show subtle stale indicator. Never wipe to [].
            setTransactions(cached);
            setIsStale(true);
          } else {
            // Condition C: Server failed and no cached records exist.
            setTransactions([]);
            setIsStale(false);
          }
          setIsInitialLoading(false);
          setIsRefreshing(false);
        });
      return;
    }

    // Installed PWA mode: query local IndexedDB snapshot
    void getCachedTransactions(userId)
      .then((cached) => {
        if (querySeqRef.current !== currentSeq) return;
        setTransactions(cached || []);
        setSnapshotComplete(true);
        setIsInitialLoading(false);
        setIsRefreshing(false);
      })
      .catch((err) => {
        if (querySeqRef.current !== currentSeq) return;
        setError(err instanceof Error ? err.message : 'Failed to read local transactions');
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

  // Priority 7: Contextual Inline/Anchored Editing Handlers
  const handleStartInlineEdit = (txn: TransactionDTO, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedTransaction(null);
    setInlineEditingId(txn.id);
    const amountStr = (Number(txn.amount_paise) / 100).toFixed(2).replace(/\.00$/, '');
    setInlineForm({
      id: txn.id,
      amount: amountStr,
      date: txn.transaction_date,
      description: txn.description || '',
      categoryId: txn.category_id || '',
      type: txn.type,
      necessity: txn.necessity || null,
      paymentMethod: (txn.payment_method as PaymentMethod) || 'online',
      rememberMerchant: false,
    });
    setInlineEditError(null);
  };

  const handleCancelInlineEdit = (e?: React.SyntheticEvent) => {
    if (e) e.stopPropagation();
    setInlineEditingId(null);
    setInlineForm(null);
    setInlineEditError(null);
  };

  const handleSaveInlineEdit = async (e?: React.SyntheticEvent) => {
    if (e) e.stopPropagation();
    if (!inlineForm) return;

    const amountTrimmed = inlineForm.amount.trim();
    if (!amountTrimmed) {
      setInlineEditError('Amount is required');
      return;
    }
    let paise = 0n;
    try {
      paise = parseINRToPaise(amountTrimmed);
      if (paise <= 0n) {
        setInlineEditError('Amount must be greater than zero');
        return;
      }
    } catch {
      setInlineEditError('Please enter a valid amount');
      return;
    }

    const dateTrimmed = inlineForm.date.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateTrimmed)) {
      setInlineEditError('Please enter a valid date in YYYY-MM-DD format');
      return;
    }

    setIsSavingInline(true);
    setInlineEditError(null);

    try {
      const category = inlineForm.categoryId ? categories.find((c) => c.id === inlineForm.categoryId) : null;

      // Preserve raw narration: Updating description must not overwrite statement_reference or notes containing raw statement narration
      const response = await syncEngine.updateTransactionLocalFirst(
        inlineForm.id,
        {
          amount: (Number(paise) / 100).toFixed(2),
          type: inlineForm.type,
          category_id: inlineForm.categoryId ? inlineForm.categoryId : null,
          transaction_date: dateTrimmed,
          payment_method: inlineForm.paymentMethod,
          necessity: inlineForm.type === 'expense' ? inlineForm.necessity : null,
          description: inlineForm.description.trim() || null,
        },
        categories,
        userId || 'default'
      );

      // If user opted to remember this merchant category:
      if (inlineForm.rememberMerchant && inlineForm.categoryId && category) {
        const pattern = inlineForm.description.trim() || category.name;
        saveUserMerchantRule(userId || 'default', {
          pattern,
          cleanName: pattern,
          categoryId: category.id,
          categoryName: category.name,
          necessity: inlineForm.necessity,
        });
        setRememberToast(`Rule saved! Future transactions matching "${pattern}" will auto-categorize to ${category.name}.`);
        setTimeout(() => setRememberToast(null), 4000);
      }

      setTransactions((prev) =>
        prev.map((t) => (t.id === inlineForm.id ? { ...t, ...response.transaction } : t))
      );

      setInlineEditingId(null);
      setInlineForm(null);
    } catch (err) {
      setInlineEditError(sanitizeUserFacingError(err, 'Failed to save transaction changes'));
    } finally {
      setIsSavingInline(false);
    }
  };

  // Handler: Open edit modal from details drawer or button
  const handleOpenEdit = (txn: TransactionDTO) => {
    setSelectedTransaction(null);
    handleStartInlineEdit(txn);
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
      setError(sanitizeUserFacingError(err, 'Failed to restore transaction. Please try again.'));
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
      {/* Condition C — Server request failed and no cached records exist on this device */}
      {error && transactions.length === 0 && !isInitialLoading ? (
        <div className="p-8 text-center bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl shadow-xs space-y-4 max-w-lg mx-auto my-8">
          <div className="w-12 h-12 mx-auto rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center text-xl font-bold select-none">
            !
          </div>
          <div className="space-y-1.5">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Unable to Retrieve Transaction Ledger
            </h2>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {error}
            </p>
            <p className="text-[11px] text-[var(--text-muted)]">
              No offline copy of your transaction history has been downloaded to this device yet.
            </p>
          </div>
          <div className="pt-2">
            <button
              type="button"
              onClick={loadTransactions}
              className="px-4 py-2 text-xs font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-lg hover:bg-[var(--action-primary-hover)] transition-colors shadow-2xs cursor-pointer"
            >
              Retry Connection
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Condition B — Stale data notice when displaying cached records */}
          {(error || isStale) && transactions.length > 0 && (
            <StatusBanner
              variant="warning"
              title={isStale ? "Showing saved local copy" : "Showing cached ledger"}
              action={{ label: 'Retry', onClick: loadTransactions }}
            >
              {error ? `${error} • Displaying your saved local transaction history while reconnecting to the server.` : 'Displaying your saved local transaction history while reconnecting to the server.'}
            </StatusBanner>
          )}

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
            <option value="upi">UPI</option>
            <option value="online">Online</option>
            <option value="cash">Cash</option>
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

            {/* Action Buttons: Statement Import, PDF Export & Record Entry */}
            <div className="flex items-center gap-2">
              {handleOpenImport && (
                <button
                  type="button"
                  onClick={handleOpenImport}
                  title="Import transactions from bank statement (PDF, CSV, XLSX, XLS)"
                  className="inline-flex items-center justify-center gap-1.5 min-h-[38px] px-3.5 py-2 text-xs font-semibold border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-subtle)] rounded-lg transition-colors cursor-pointer shadow-2xs shrink-0"
                >
                  <span className="text-xs" aria-hidden="true">📥</span>
                  <span>Import Bank Statement</span>
                </button>
              )}

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
            {isAnyFilterActive ? 'No matching transactions found' : snapshotComplete ? 'No transactions recorded in your ledger' : 'No transactions recorded yet'}
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
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={onOpenQuickAdd}
                className="px-4 py-2 text-xs font-medium bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-lg hover:bg-[var(--action-primary-hover)] transition-colors cursor-pointer"
              >
                + Record First Transaction
              </button>
              {handleOpenImport && (
                <button
                  type="button"
                  onClick={handleOpenImport}
                  className="px-4 py-2 text-xs font-medium border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] rounded-lg transition-colors cursor-pointer"
                >
                  <span aria-hidden="true">📄</span> Import Bank Statement
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2 min-h-[160px]">
          {/* Desktop Column Alignment Header */}
          <div className="hidden md:grid grid-cols-12 items-center px-4 py-2 text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)] border-b border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] rounded-lg">
            <span className="col-span-4">Transaction / Category</span>
            <span className="col-span-2">Date</span>
            <span className="col-span-2">Payment Method</span>
            <span className="col-span-2">Necessity</span>
            <span className="col-span-2 text-right">Amount (INR)</span>
          </div>

          {rememberToast && (
            <div className="p-3 rounded-lg bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs flex items-center justify-between mb-2">
              <span>✓ {rememberToast}</span>
              <button type="button" onClick={() => setRememberToast(null)} className="text-xs font-bold cursor-pointer ml-2">✕</button>
            </div>
          )}

          <div
            className={`space-y-2 transition-opacity duration-150 ${
              isRefreshing ? 'opacity-65' : 'opacity-100'
            }`}
          >
            {filteredTransactions.map((txn) => {
              const isIncome = txn.type === 'income';

              if (inlineEditingId === txn.id && inlineForm) {
                return (
                  <div
                    key={txn.id}
                    className="p-4 bg-[var(--bg-surface)] border-2 border-[var(--action-primary-bg)] rounded-xl shadow-xs space-y-3"
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        handleCancelInlineEdit(e);
                      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || (e.target as HTMLElement).tagName !== 'TEXTAREA')) {
                        void handleSaveInlineEdit(e);
                      }
                    }}
                  >
                    <div className="flex items-center justify-between border-b border-[var(--border-hairline)] pb-2">
                      <span className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                        <span>✏️</span>
                        <span>Edit Transaction</span>
                      </span>
                      <button
                        type="button"
                        onClick={handleCancelInlineEdit}
                        className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 cursor-pointer"
                        aria-label="Cancel edit"
                      >
                        ✕
                      </button>
                    </div>

                    {inlineEditError && (
                      <div className="p-2 rounded bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300 text-xs border border-red-200 dark:border-red-900/50">
                        {inlineEditError}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
                      <label className="space-y-1">
                        <span className="text-[11px] font-medium text-[var(--text-muted)]">Amount (₹)</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={inlineForm.amount}
                          onChange={(e) => setInlineForm({ ...inlineForm, amount: e.target.value })}
                          className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 py-1.5 font-mono font-medium text-[var(--text-primary)] focus:outline-hidden focus:border-[var(--action-primary-bg)]"
                          placeholder="0.00"
                          autoFocus
                        />
                      </label>

                      <label className="space-y-1">
                        <span className="text-[11px] font-medium text-[var(--text-muted)]">Date</span>
                        <input
                          type="date"
                          value={inlineForm.date}
                          onChange={(e) => setInlineForm({ ...inlineForm, date: e.target.value })}
                          className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 py-1.5 font-mono text-[var(--text-primary)] focus:outline-hidden focus:border-[var(--action-primary-bg)]"
                        />
                      </label>

                      <label className="space-y-1 sm:col-span-2">
                        <span className="text-[11px] font-medium text-[var(--text-muted)]">Merchant / Description</span>
                        <input
                          type="text"
                          value={inlineForm.description}
                          onChange={(e) => setInlineForm({ ...inlineForm, description: e.target.value })}
                          className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-[var(--text-primary)] focus:outline-hidden focus:border-[var(--action-primary-bg)]"
                          placeholder="Merchant counterparty name"
                        />
                      </label>

                      <label className="space-y-1">
                        <span className="text-[11px] font-medium text-[var(--text-muted)]">Type</span>
                        <select
                          value={inlineForm.type}
                          onChange={(e) => {
                            const nextType = e.target.value as TransactionType;
                            setInlineForm({
                              ...inlineForm,
                              type: nextType,
                              necessity: nextType === 'expense' ? inlineForm.necessity : null,
                            });
                          }}
                          className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-[var(--text-primary)] focus:outline-hidden focus:border-[var(--action-primary-bg)]"
                        >
                          <option value="expense">Expense</option>
                          <option value="income">Income</option>
                        </select>
                      </label>

                      <label className="space-y-1">
                        <span className="text-[11px] font-medium text-[var(--text-muted)]">Channel</span>
                        <select
                          value={inlineForm.paymentMethod}
                          onChange={(e) => setInlineForm({ ...inlineForm, paymentMethod: e.target.value as PaymentMethod })}
                          className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-[var(--text-primary)] focus:outline-hidden focus:border-[var(--action-primary-bg)]"
                        >
                          <option value="upi">UPI</option>
                          <option value="online">Online</option>
                          <option value="cash">Cash</option>
                        </select>
                      </label>

                      <label className="space-y-1 sm:col-span-2">
                        <span className="text-[11px] font-medium text-[var(--text-muted)]">Category (Optional)</span>
                        <select
                          value={inlineForm.categoryId}
                          onChange={(e) => setInlineForm({ ...inlineForm, categoryId: e.target.value })}
                          className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-[var(--text-primary)] focus:outline-hidden focus:border-[var(--action-primary-bg)]"
                        >
                          <option value="">Uncategorized</option>
                          {categories
                            .filter((c) => c.type === inlineForm.type && !c.archived_at)
                            .map((c) => (
                              <option value={c.id} key={c.id}>{c.name}</option>
                            ))}
                        </select>
                      </label>

                      {inlineForm.type === 'expense' && (
                        <label className="space-y-1 sm:col-span-2">
                          <span className="text-[11px] font-medium text-[var(--text-muted)]">Necessity (Optional)</span>
                          <select
                            value={inlineForm.necessity || ''}
                            onChange={(e) => setInlineForm({ ...inlineForm, necessity: (e.target.value as NecessityClass) || null })}
                            className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-[var(--text-primary)] focus:outline-hidden focus:border-[var(--action-primary-bg)]"
                          >
                            <option value="">Unclassified</option>
                            <option value="essential">Essential</option>
                            <option value="optional">Optional</option>
                            <option value="luxury">Luxury</option>
                          </select>
                        </label>
                      )}
                    </div>

                    {inlineForm.categoryId && (
                      <label className="flex items-center gap-2 pt-1 text-xs text-[var(--text-secondary)] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={inlineForm.rememberMerchant}
                          onChange={(e) => setInlineForm({ ...inlineForm, rememberMerchant: e.target.checked })}
                          className="rounded border-[var(--border-subtle)] text-[var(--action-primary-bg)] cursor-pointer"
                        />
                        <span>Remember this merchant&apos;s category for future transactions</span>
                      </label>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-hairline)]">
                      <button
                        type="button"
                        onClick={handleCancelInlineEdit}
                        disabled={isSavingInline}
                        className="px-3.5 py-1.5 rounded-lg border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSaveInlineEdit()}
                        disabled={isSavingInline}
                        className="px-4 py-1.5 rounded-lg bg-[var(--action-primary-bg)] hover:bg-[var(--action-primary-hover)] text-xs font-semibold text-[var(--action-primary-fg)] transition-colors shadow-xs disabled:opacity-50 cursor-pointer inline-flex items-center gap-1.5"
                      >
                        {isSavingInline ? (
                          <>
                            <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            <span>Saving…</span>
                          </>
                        ) : (
                          <span>Save</span>
                        )}
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={txn.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Transaction ${txn.description || txn.category_name || 'entry'}, ${isIncome ? 'plus' : 'minus'} ${txn.formatted_inr}`}
                  onClick={() => handleStartInlineEdit(txn)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleStartInlineEdit(txn);
                    }
                  }}
                  className="p-3.5 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-subtle)] active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:outline-hidden transition-all cursor-pointer group"
                >
                  {/* Mobile Layout (< md) */}
                  <div className="flex md:hidden items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[var(--text-primary)] group-hover:underline underline-offset-2">
                          {txn.description || txn.category_name || 'Uncategorized'}
                        </span>
                        {txn.description && txn.category_name && (
                          <span className="text-xs text-[var(--text-secondary)] truncate max-w-[160px]">
                            • {txn.category_name}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] flex-wrap">
                        <span className="shrink-0">{formatDateHuman(txn.transaction_date)}</span>
                        <span>•</span>
                        <Badge variant={txn.payment_method === 'upi' ? 'upi' : txn.payment_method === 'online' ? 'online' : 'cash'} size="xs">
                          {txn.payment_method === 'upi' ? 'UPI' : txn.payment_method === 'online' ? 'Online' : 'Cash'}
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

                    <div className="text-right flex items-center gap-1.5 shrink-0">
                      <div>
                        <div
                          className={`font-mono text-sm font-semibold tracking-tight tabular-nums ${
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
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTransaction(txn);
                        }}
                        className="px-2 py-1 rounded text-[11px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                        title="View advanced details"
                      >
                        Info
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleStartInlineEdit(txn, e)}
                        className="px-2.5 py-1 rounded text-xs font-medium border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-primary)] hover:border-[var(--border-strong)] cursor-pointer"
                        aria-label={`Edit ${txn.description || 'transaction'}`}
                      >
                        Edit
                      </button>
                    </div>
                  </div>

                  {/* Desktop Tabular Grid Layout (>= md) */}
                  <div className="hidden md:grid grid-cols-12 items-center gap-2">
                    {/* Col 1-4: Description & Category */}
                    <div className="col-span-4 min-w-0 pr-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-[var(--text-primary)] truncate group-hover:underline underline-offset-2">
                          {txn.description || txn.category_name || 'Uncategorized'}
                        </span>
                        {txn.notes && (
                          <span className="text-[10px] text-[var(--text-muted)]" title={txn.notes}>
                            📝
                          </span>
                        )}
                      </div>
                      {txn.description && txn.category_name && (
                        <span className="text-xs text-[var(--text-secondary)] truncate block">
                          {txn.category_name}
                        </span>
                      )}
                    </div>

                    {/* Col 5-6: Date */}
                    <div className="col-span-2 text-xs font-mono text-[var(--text-secondary)]">
                      {formatDateHuman(txn.transaction_date)}
                    </div>

                    {/* Col 7-8: Payment Method & Sync Status */}
                    <div className="col-span-2 flex items-center gap-1.5 flex-wrap">
                      <Badge variant={txn.payment_method === 'upi' ? 'upi' : txn.payment_method === 'online' ? 'online' : 'cash'} size="xs">
                        {txn.payment_method === 'upi' ? 'UPI' : txn.payment_method === 'online' ? 'Online' : 'Cash'}
                      </Badge>
                      {('sync_status' in txn && txn.sync_status === 'pending') && (
                        <Badge variant="warning" size="xs" dot={true} title="Waiting to sync">
                          Pending sync
                        </Badge>
                      )}
                    </div>

                    {/* Col 9-10: Necessity */}
                    <div className="col-span-2">
                      {txn.necessity ? (
                        <Badge variant={txn.necessity} size="xs" dot={true}>
                          <span className="capitalize">{txn.necessity}</span>
                        </Badge>
                      ) : (
                        <span className="text-[11px] font-mono text-[var(--text-muted)]">—</span>
                      )}
                    </div>

                    {/* Col 11-12: Amount and Actions */}
                    <div className="col-span-2 text-right flex items-center justify-end gap-1.5">
                      <div
                        className={`font-mono text-base font-semibold tracking-tight tabular-nums mr-1 ${
                          isIncome
                            ? 'text-[var(--income-fg)]'
                            : 'text-[var(--text-primary)]'
                        }`}
                      >
                        {isIncome ? `+${txn.formatted_inr}` : `-${txn.formatted_inr}`}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTransaction(txn);
                        }}
                        className="px-2 py-0.5 rounded text-[11px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer opacity-60 hover:opacity-100 transition-opacity"
                        title="View raw statement reference & provenance"
                      >
                        Details
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleStartInlineEdit(txn, e)}
                        className="px-2.5 py-0.5 rounded text-xs font-medium border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-all cursor-pointer opacity-80 group-hover:opacity-100"
                        aria-label={`Edit ${txn.description || 'transaction'}`}
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
        </>
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
