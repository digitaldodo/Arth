'use client';

import React, { useState, useEffect, useMemo } from 'react';
import type { CategoryDTO, TransactionType, TransactionDTO } from '@arth/contracts';
import { formatPaiseToINR } from '@/lib/format';
import {
  type DateRangePreset,
  computePresetDateRange,
  formatDateRangeLabel,
  isValidDateRange,
} from './date-range-utils';
import {
  exportLedgerToPdf,
  fetchAllMatchingTransactions,
} from './ledger-pdf-exporter';
import {
  computeCategoryCounts,
  filterEligibleCategories,
  resolveEligibleCategory,
} from './export-category-filter';

interface ExportPdfDialogProps {
  isOpen: boolean;
  onClose: () => void;
  categories: CategoryDTO[];
  initialType?: TransactionType | 'all';
  initialCategoryId?: string; // 'all' or category ID
}

export function ExportPdfDialog({
  isOpen,
  onClose,
  categories,
  initialType = 'all',
  initialCategoryId = 'all',
}: ExportPdfDialogProps) {
  // Preset & Dates
  const [preset, setPreset] = useState<DateRangePreset>('this_month');
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    return computePresetDateRange('this_month').startDate;
  });
  const [customEndDate, setCustomEndDate] = useState<string>(() => {
    return computePresetDateRange('this_month').endDate;
  });

  // Filters
  const [selectedType, setSelectedType] = useState<TransactionType | 'all'>(initialType);
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategoryId);

  // Complete matching transactions for active period & type (used to evaluate category eligibility)
  const [scopeTransactions, setScopeTransactions] = useState<TransactionDTO[]>([]);
  const [isLoadingScope, setIsLoadingScope] = useState<boolean>(true);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Export action state
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<string>('');
  const [exportError, setExportError] = useState<string | null>(null);

  // Determine active date range based on preset or custom inputs
  const effectiveRange = useMemo(() => {
    if (preset === 'custom') {
      return {
        startDate: customStartDate,
        endDate: customEndDate,
      };
    }
    return computePresetDateRange(preset);
  }, [preset, customStartDate, customEndDate]);

  const isRangeValid = isValidDateRange(effectiveRange.startDate, effectiveRange.endDate);

  // Reset initial category/type when dialog opens
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      setSelectedType(initialType);
      setSelectedCategory(initialCategoryId);
      setPreset('this_month');
      const defaultRange = computePresetDateRange('this_month');
      setCustomStartDate(defaultRange.startDate);
      setCustomEndDate(defaultRange.endDate);
      setExportError(null);
    }, 0);

    return () => clearTimeout(timer);
  }, [isOpen, initialType, initialCategoryId]);

  // Fetch complete matching transaction set across all pages for the current date range and type
  useEffect(() => {
    if (!isOpen) return;
    if (!isRangeValid) {
      const timer = setTimeout(() => {
        setScopeTransactions([]);
        setIsLoadingScope(false);
      }, 0);
      return () => clearTimeout(timer);
    }

    let isMounted = true;
    const timer = setTimeout(() => {
      if (isMounted) {
        setIsLoadingScope(true);
        setPreviewError(null);
      }
    }, 0);

    // Fetch all matching transactions without category restriction to evaluate category eligibility
    fetchAllMatchingTransactions(
      selectedType,
      'all',
      effectiveRange.startDate,
      effectiveRange.endDate
    )
      .then((records) => {
        if (!isMounted) return;
        setScopeTransactions(records);
        setIsLoadingScope(false);
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : 'Failed to calculate export preview';
        setPreviewError(msg);
        setIsLoadingScope(false);
      });

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [isOpen, selectedType, effectiveRange.startDate, effectiveRange.endDate, isRangeValid]);

  // Compute category transaction counts and eligible categories having at least one matching transaction
  const categoryCounts = useMemo(() => {
    return computeCategoryCounts(scopeTransactions);
  }, [scopeTransactions]);

  const eligibleCategories = useMemo(() => {
    return filterEligibleCategories(categories, scopeTransactions);
  }, [categories, scopeTransactions]);

  // Preserve explicitly selected category only while it remains eligible; fallback to 'all'
  const activeCategory = resolveEligibleCategory(selectedCategory, eligibleCategories);

  // Filter preview transactions according to active category selection
  const previewTransactions = useMemo(() => {
    if (activeCategory === 'all') {
      return scopeTransactions;
    }
    return scopeTransactions.filter((tx) => tx.category_id === activeCategory);
  }, [scopeTransactions, activeCategory]);

  // Calculate summary metrics strictly from preview transactions
  const summaryMetrics = useMemo(() => {
    let incomePaise = BigInt(0);
    let expensePaise = BigInt(0);

    for (const t of previewTransactions) {
      const p = BigInt(t.amount_paise);
      if (t.type === 'income') {
        incomePaise += p;
      } else {
        expensePaise += p;
      }
    }

    const netPaise = incomePaise - expensePaise;
    return {
      count: previewTransactions.length,
      incomePaise,
      expensePaise,
      netPaise,
      formattedIncome: formatPaiseToINR(incomePaise),
      formattedExpense: formatPaiseToINR(expensePaise),
      formattedNet: formatPaiseToINR(netPaise),
      isNetPositive: netPaise > BigInt(0),
      isNetNegative: netPaise < BigInt(0),
    };
  }, [previewTransactions]);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isExporting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isExporting, onClose]);

  if (!isOpen) return null;

  const handlePresetChange = (newPreset: DateRangePreset) => {
    setPreset(newPreset);
    if (newPreset !== 'custom') {
      const range = computePresetDateRange(newPreset);
      setCustomStartDate(range.startDate);
      setCustomEndDate(range.endDate);
    }
  };

  const handleDownload = async () => {
    if (!isRangeValid || isExporting || previewTransactions.length === 0) return;

    setIsExporting(true);
    setExportProgress('Generating PDF…');
    setExportError(null);

    try {
      const dateRangeLabel = formatDateRangeLabel(effectiveRange.startDate, effectiveRange.endDate);
      await exportLedgerToPdf({
        selectedType,
        selectedCategory: activeCategory,
        categories,
        startDate: effectiveRange.startDate,
        endDate: effectiveRange.endDate,
        dateRangeLabel,
        prefetchedTransactions: previewTransactions,
        onProgress: (status) => setExportProgress(status),
      });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to export statement to PDF';
      setExportError(msg);
    } finally {
      setIsExporting(false);
      setExportProgress('');
    }
  };

  // Label for active category
  const activeCategoryLabel =
    activeCategory === 'all'
      ? 'All Categories'
      : categories.find((c) => c.id === activeCategory)?.name || 'Filtered Category';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs transition-opacity p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-pdf-title"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0"
        onClick={() => {
          if (!isExporting) onClose();
        }}
        aria-hidden="true"
      />

      {/* Modal Card */}
      <div
        className="relative z-10 w-full sm:max-w-xl max-h-[92vh] overflow-y-auto bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-t-2xl sm:rounded-xl shadow-2xl p-5 sm:p-6 transition-all"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        {/* Mobile Drag Indicator */}
        <div className="w-10 h-1 bg-[var(--border-subtle)] rounded-full mx-auto mb-4 sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-hairline)]">
          <div className="flex items-center gap-2">
            <span className="text-base" aria-hidden="true">📄</span>
            <h2 id="export-pdf-title" className="text-base font-semibold text-[var(--text-primary)]">
              Export Transaction Statement
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            aria-label="Close export dialog"
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1.5 rounded-md text-sm cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Error Banners */}
        {exportError && (
          <div className="mt-4 p-3 text-xs bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 rounded-lg">
            <span className="font-semibold">Export Error:</span> {exportError}
          </div>
        )}

        {previewError && (
          <div className="mt-4 p-3 text-xs bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 rounded-lg">
            <span className="font-semibold">Preview Error:</span> {previewError}
          </div>
        )}

        <div className="mt-4 space-y-5">
          {/* 1. Date Range Presets */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-[var(--text-secondary)]">
                Date Range Preset
              </label>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs font-medium">
              {(
                [
                  { id: 'this_month', label: 'This Month' },
                  { id: 'today', label: 'Today' },
                  { id: 'yesterday', label: 'Yesterday' },
                  { id: 'this_week', label: 'This Week' },
                  { id: 'last_week', label: 'Last Week' },
                  { id: 'last_month', label: 'Last Month' },
                  { id: 'this_year', label: 'This Year' },
                  { id: 'custom', label: 'Custom Range' },
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handlePresetChange(p.id)}
                  disabled={isExporting}
                  className={`py-2 px-2.5 rounded-lg border text-center transition-all cursor-pointer truncate ${
                    preset === p.id
                      ? 'bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] border-[var(--action-primary-bg)] font-semibold shadow-xs'
                      : 'bg-[var(--bg-canvas)] text-[var(--text-secondary)] border-[var(--border-hairline)] hover:border-[var(--border-subtle)]'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Custom Range Inputs (Shown when preset === 'custom') */}
            {preset === 'custom' && (
              <div className="mt-3 p-3 bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] rounded-lg grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="custom-start-date" className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
                    Start Date
                  </label>
                  <input
                    id="custom-start-date"
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    disabled={isExporting}
                    className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-md px-2.5 py-1.5 text-xs font-mono text-[var(--text-primary)] focus:outline-hidden"
                  />
                </div>
                <div>
                  <label htmlFor="custom-end-date" className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
                    End Date
                  </label>
                  <input
                    id="custom-end-date"
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    disabled={isExporting}
                    className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-md px-2.5 py-1.5 text-xs font-mono text-[var(--text-primary)] focus:outline-hidden"
                  />
                </div>
              </div>
            )}

            {/* Range Validation Warning */}
            {!isRangeValid && (
              <div className="mt-2 text-[11px] text-red-600 dark:text-red-400 font-medium">
                ⚠️ Start date cannot be later than end date.
              </div>
            )}

            {/* Display formatted date range */}
            {isRangeValid && (
              <div className="mt-2 text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
                <span className="font-semibold text-[var(--text-primary)]">Selected Period:</span>
                <span className="font-mono">
                  {formatDateRangeLabel(effectiveRange.startDate, effectiveRange.endDate)}
                </span>
              </div>
            )}
          </div>

          {/* 2. Transaction Type Filters (Mutually exclusive: Both, Income Only, Expense Only) */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
              Transaction Type
            </label>
            <div className="grid grid-cols-3 gap-1.5 text-xs font-medium">
              {[
                { id: 'all', label: 'Both Income & Expense' },
                { id: 'income', label: 'Income Only' },
                { id: 'expense', label: 'Expense Only' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedType(t.id as TransactionType | 'all')}
                  disabled={isExporting}
                  className={`py-2 px-2 rounded-lg border text-center transition-all cursor-pointer truncate ${
                    selectedType === t.id
                      ? 'bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] border-[var(--action-primary-bg)] font-semibold shadow-xs'
                      : 'bg-[var(--bg-canvas)] text-[var(--text-secondary)] border-[var(--border-hairline)] hover:border-[var(--border-subtle)]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Category Filter (Filtered by Available Matching Transactions) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="export-category-select" className="text-xs font-semibold text-[var(--text-secondary)]">
                Category Scope
              </label>
              {isLoadingScope && (
                <span className="text-[11px] text-[var(--text-muted)] flex items-center gap-1 font-mono">
                  <span className="inline-block w-2.5 h-2.5 border-2 border-[var(--text-secondary)] border-t-transparent rounded-full animate-spin" />
                  Filtering...
                </span>
              )}
            </div>
            <select
              id="export-category-select"
              value={activeCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              disabled={isExporting || isLoadingScope || eligibleCategories.length === 0}
              className="w-full text-xs bg-[var(--bg-canvas)] border border-[var(--border-hairline)] rounded-lg px-3 py-2 text-[var(--text-primary)] focus:outline-hidden cursor-pointer disabled:opacity-50"
            >
              <option value="all">
                All Categories {scopeTransactions.length > 0 ? `(${scopeTransactions.length})` : ''}
              </option>
              {eligibleCategories.map((c) => {
                const count = categoryCounts.get(c.id) || 0;
                return (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.type}) — {count} {count === 1 ? 'txn' : 'txns'}
                  </option>
                );
              })}
            </select>
            {eligibleCategories.length === 0 && !isLoadingScope && isRangeValid && (
              <p className="text-[11px] text-[var(--text-muted)] mt-1">
                No categories contain transactions for the selected period and type.
              </p>
            )}
          </div>

          {/* 4. Export Configuration Summary */}
          <div className="p-4 bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Statement Summary Preview
              </span>
              {isLoadingScope && (
                <span className="text-[11px] text-[var(--text-muted)] flex items-center gap-1">
                  <span className="inline-block w-2.5 h-2.5 border-2 border-[var(--text-secondary)] border-t-transparent rounded-full animate-spin" />
                  Calculating...
                </span>
              )}
            </div>

            {!isLoadingScope && isRangeValid && previewTransactions.length === 0 ? (
              <div className="py-4 text-center space-y-1.5 border-t border-[var(--border-hairline)]">
                <span className="text-2xl block" aria-hidden="true">📭</span>
                <h4 className="text-xs font-semibold text-[var(--text-primary)]">
                  No Matching Transactions
                </h4>
                <p className="text-[11px] text-[var(--text-muted)] max-w-sm mx-auto">
                  No active {selectedType === 'all' ? '' : `${selectedType} `}transactions match the selected criteria. Adjust your date range or select a different transaction type.
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-[var(--border-hairline)] text-xs">
                  <div>
                    <span className="text-[10px] text-[var(--text-muted)] block">Records</span>
                    <span className="font-mono font-semibold text-[var(--text-primary)] text-sm">
                      {summaryMetrics.count}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[var(--text-muted)] block">Total Income</span>
                    <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400 text-sm">
                      +₹{summaryMetrics.formattedIncome}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[var(--text-muted)] block">Total Expenses</span>
                    <span className="font-mono font-semibold text-red-600 dark:text-red-400 text-sm">
                      -₹{summaryMetrics.formattedExpense}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[var(--text-muted)] block">Net Cash Flow</span>
                    <span
                      className={`font-mono font-semibold text-sm ${
                        summaryMetrics.isNetPositive
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : summaryMetrics.isNetNegative
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-[var(--text-primary)]'
                      }`}
                    >
                      {summaryMetrics.isNetPositive ? '+' : ''}₹{summaryMetrics.formattedNet}
                    </span>
                  </div>
                </div>

                <div className="text-[11px] text-[var(--text-muted)] pt-1 border-t border-[var(--border-hairline)] space-y-0.5">
                  <div>
                    <span className="font-medium text-[var(--text-secondary)]">Period:</span>{' '}
                    {isRangeValid ? formatDateRangeLabel(effectiveRange.startDate, effectiveRange.endDate) : 'Invalid Range'}
                  </div>
                  <div>
                    <span className="font-medium text-[var(--text-secondary)]">Scope:</span>{' '}
                    {selectedType === 'all'
                      ? 'Both Income & Expense'
                      : selectedType === 'expense'
                      ? 'Expense Only'
                      : 'Income Only'}{' '}
                    • {activeCategoryLabel}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* 5. Action Buttons */}
          <div className="pt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isExporting}
              className="w-1/3 py-2.5 text-xs font-medium border border-[var(--border-subtle)] rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={!isRangeValid || isExporting || isLoadingScope || previewTransactions.length === 0}
              className="w-2/3 py-2.5 text-xs font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-lg hover:bg-[var(--action-primary-hover)] transition-all shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isExporting ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>{exportProgress || 'Preparing statement…'}</span>
                </>
              ) : previewTransactions.length === 0 && !isLoadingScope ? (
                <span>No Transactions to Export</span>
              ) : (
                <>
                  <span aria-hidden="true">📥</span>
                  <span>Download PDF Statement</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
