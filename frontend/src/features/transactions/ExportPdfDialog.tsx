'use client';

import React, { useState, useEffect, useMemo } from 'react';
import type { CategoryDTO, TransactionType, TransactionDTO, NecessityClass } from '@arth/contracts';
import { formatPaiseToINR, formatDateHuman } from '@/lib/format';
import {
  type DateRangePreset,
  computePresetDateRange,
  formatDateRangeLabel,
  isValidDateRange,
} from './date-range-utils';
import {
  exportLedgerToPdf,
  fetchAllMatchingTransactions,
  type UserProfileSummary,
} from './ledger-pdf-exporter';
import {
  computeCategoryCounts,
  filterEligibleCategories,
  resolveEligibleCategory,
} from './export-category-filter';
import { verifyCurrentPasswordAction } from '@/app/login/actions';

export interface ExportPdfDialogProps {
  isOpen: boolean;
  onClose: () => void;
  categories: CategoryDTO[];
  initialType?: TransactionType | 'all';
  initialCategoryId?: string; // 'all' or category ID
  initialNecessity?: NecessityClass | 'all';
  userProfile?: UserProfileSummary;
  hasPassword?: boolean;
  onAccountPasswordVerified?: () => void;
}

export function ExportPdfDialog({
  isOpen,
  onClose,
  categories,
  initialType = 'all',
  initialCategoryId = 'all',
  initialNecessity = 'all',
  userProfile,
  hasPassword = false,
  onAccountPasswordVerified,
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
  const [selectedNecessity, setSelectedNecessity] = useState<NecessityClass | 'all'>(initialNecessity);

  // Complete matching transactions for active period & type (used to evaluate category eligibility)
  const [scopeTransactions, setScopeTransactions] = useState<TransactionDTO[]>([]);
  const [isLoadingScope, setIsLoadingScope] = useState<boolean>(true);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Export action state
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<string>('');
  const [exportError, setExportError] = useState<string | null>(null);

  // Password protection state
  const [protectionMode, setProtectionMode] = useState<'standard' | 'protected'>('standard');
  const [passwordOption, setPasswordOption] = useState<'account' | 'separate'>(
    hasPassword ? 'account' : 'separate'
  );
  const [accountPassword, setAccountPassword] = useState<string>('');
  const [showAccountPassword, setShowAccountPassword] = useState<boolean>(false);

  const [separatePassword, setSeparatePassword] = useState<string>('');
  const [separateConfirmPassword, setSeparateConfirmPassword] = useState<string>('');
  const [showSeparatePassword, setShowSeparatePassword] = useState<boolean>(false);

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

  // Reset initial category/type and password inputs when dialog opens
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      setSelectedType(initialType);
      setSelectedCategory(initialCategoryId);
      setSelectedNecessity(initialNecessity);
      setPreset('this_month');
      const defaultRange = computePresetDateRange('this_month');
      setCustomStartDate(defaultRange.startDate);
      setCustomEndDate(defaultRange.endDate);
      setExportError(null);
      setProtectionMode('standard');
      setPasswordOption(hasPassword ? 'account' : 'separate');
      setAccountPassword('');
      setSeparatePassword('');
      setSeparateConfirmPassword('');
      setShowAccountPassword(false);
      setShowSeparatePassword(false);
    }, 0);

    return () => clearTimeout(timer);
  }, [isOpen, initialType, initialCategoryId, initialNecessity, hasPassword]);

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

  // Filter preview transactions according to active category and necessity selection
  const previewTransactions = useMemo(() => {
    let list = scopeTransactions;
    if (activeCategory !== 'all') {
      list = list.filter((tx) => tx.category_id === activeCategory);
    }
    if (selectedNecessity !== 'all' && selectedType !== 'income') {
      list = list.filter((tx) => tx.necessity === selectedNecessity);
    }
    return list;
  }, [scopeTransactions, activeCategory, selectedNecessity, selectedType]);

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
    const formattedIncome = formatPaiseToINR(incomePaise);
    const formattedExpense = formatPaiseToINR(expensePaise);
    const formattedNet = formatPaiseToINR(netPaise < BigInt(0) ? -netPaise : netPaise);

    return {
      incomePaise,
      expensePaise,
      netPaise,
      formattedIncome,
      formattedExpense,
      formattedNet,
      isNetPositive: netPaise > BigInt(0),
      isNetNegative: netPaise < BigInt(0),
    };
  }, [previewTransactions]);

  // Validation for protected export form
  const isProtectedFormValid = useMemo(() => {
    if (protectionMode !== 'protected') return true;
    if (passwordOption === 'account') {
      return Boolean(accountPassword.trim().length > 0);
    }
    // Separate password validation
    const p = separatePassword.trim();
    return (
      p.length >= 6 &&
      !separatePassword.startsWith(' ') &&
      !separatePassword.endsWith(' ') &&
      separatePassword === separateConfirmPassword
    );
  }, [
    protectionMode,
    passwordOption,
    accountPassword,
    separatePassword,
    separateConfirmPassword,
  ]);

  const separatePasswordError = useMemo(() => {
    if (protectionMode !== 'protected' || passwordOption !== 'separate') return null;
    if (separatePassword.length > 0 && separatePassword.trim().length < 6) {
      return 'Password must be at least 6 characters.';
    }
    if (separatePassword.startsWith(' ') || separatePassword.endsWith(' ')) {
      return 'Password cannot begin or end with a space.';
    }
    if (separateConfirmPassword.length > 0 && separatePassword !== separateConfirmPassword) {
      return 'Passwords do not match.';
    }
    return null;
  }, [protectionMode, passwordOption, separatePassword, separateConfirmPassword]);

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

  const handleDownloadStandard = async () => {
    if (!isRangeValid || isExporting || previewTransactions.length === 0) return;
    setIsExporting(true);
    setExportProgress('Generating PDF statement…');
    setExportError(null);

    try {
      const dateRangeLabel = formatDateRangeLabel(effectiveRange.startDate, effectiveRange.endDate);
      await exportLedgerToPdf({
        selectedType,
        selectedCategory: activeCategory,
        selectedNecessity: selectedType === 'income' ? 'all' : selectedNecessity,
        categories,
        startDate: effectiveRange.startDate,
        endDate: effectiveRange.endDate,
        dateRangeLabel,
        preset,
        prefetchedTransactions: previewTransactions,
        userProfile,
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

  const handleDownloadProtected = async () => {
    if (!isRangeValid || isExporting || previewTransactions.length === 0) return;

    let finalEncryptionPassword = '';

    if (passwordOption === 'account') {
      const trimmed = accountPassword.trim();
      if (!trimmed) {
        setExportError('Please enter your Arth account password.');
        return;
      }

      setIsExporting(true);
      setExportProgress('Verifying account credentials…');
      setExportError(null);

      try {
        const verifyResult = await verifyCurrentPasswordAction(trimmed);
        if (!verifyResult.valid) {
          setIsExporting(false);
          setExportProgress('');
          setExportError(verifyResult.error || 'Incorrect account password. Please try again.');
          return;
        }
        onAccountPasswordVerified?.();
        finalEncryptionPassword = trimmed;
      } catch (err: unknown) {
        setIsExporting(false);
        setExportProgress('');
        setExportError(err instanceof Error ? err.message : 'Failed to verify account password.');
        return;
      }
    } else {
      const trimmed = separatePassword.trim();
      if (!trimmed) {
        setExportError('Please enter a separate PDF password.');
        return;
      }
      if (trimmed.length < 6) {
        setExportError('Password must be at least 6 characters in length.');
        return;
      }
      if (separatePassword.startsWith(' ') || separatePassword.endsWith(' ')) {
        setExportError('Password cannot begin or end with a space.');
        return;
      }
      if (separatePassword !== separateConfirmPassword) {
        setExportError('Passwords do not match. Please verify both fields.');
        return;
      }
      finalEncryptionPassword = trimmed;
      setIsExporting(true);
      setExportProgress('Generating PDF statement…');
      setExportError(null);
    }

    try {
      const dateRangeLabel = formatDateRangeLabel(effectiveRange.startDate, effectiveRange.endDate);
      await exportLedgerToPdf({
        selectedType,
        selectedCategory: activeCategory,
        selectedNecessity: selectedType === 'income' ? 'all' : selectedNecessity,
        categories,
        startDate: effectiveRange.startDate,
        endDate: effectiveRange.endDate,
        dateRangeLabel,
        preset,
        prefetchedTransactions: previewTransactions,
        userProfile,
        password: finalEncryptionPassword,
        onProgress: (status) => setExportProgress(status),
      });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to export encrypted statement';
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
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="custom-start-date" className="block text-[11px] font-medium text-[var(--text-muted)]">
                      Start Date
                    </label>
                    {customStartDate && (
                      <span className="text-[10px] text-[var(--text-muted)] font-mono">
                        {formatDateHuman(customStartDate)}
                      </span>
                    )}
                  </div>
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
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="custom-end-date" className="block text-[11px] font-medium text-[var(--text-muted)]">
                      End Date
                    </label>
                    {customEndDate && (
                      <span className="text-[10px] text-[var(--text-muted)] font-mono">
                        {formatDateHuman(customEndDate)}
                      </span>
                    )}
                  </div>
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

          {/* 2. Transaction Type Segment */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
              Transaction Flow
            </label>
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] rounded-lg text-xs font-medium">
              <button
                type="button"
                onClick={() => setSelectedType('all')}
                disabled={isExporting}
                className={`py-1.5 rounded-md transition-all cursor-pointer ${
                  selectedType === 'all'
                    ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] font-semibold shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Both Income & Expense
              </button>
              <button
                type="button"
                onClick={() => setSelectedType('expense')}
                disabled={isExporting}
                className={`py-1.5 rounded-md transition-all cursor-pointer ${
                  selectedType === 'expense'
                    ? 'bg-[var(--bg-surface)] text-[var(--expense-fg)] font-semibold shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Expense Only
              </button>
              <button
                type="button"
                onClick={() => setSelectedType('income')}
                disabled={isExporting}
                className={`py-1.5 rounded-md transition-all cursor-pointer ${
                  selectedType === 'income'
                    ? 'bg-[var(--bg-surface)] text-[var(--income-fg)] font-semibold shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Income Only
              </button>
            </div>
          </div>

          {/* 3a. Category Filter */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="export-category-select" className="text-xs font-semibold text-[var(--text-secondary)]">
                Category Scope
              </label>
              <span className="text-[11px] text-[var(--text-muted)]">
                {eligibleCategories.length} active with records
              </span>
            </div>
            <select
              id="export-category-select"
              value={activeCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              disabled={isExporting}
              className="w-full text-xs bg-[var(--bg-canvas)] border border-[var(--border-hairline)] rounded-lg px-3 py-2 text-[var(--text-primary)] focus:outline-hidden cursor-pointer"
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
          </div>

          {/* 3b. Necessity Filter */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="export-necessity-select" className="text-xs font-semibold text-[var(--text-secondary)]">
                Necessity Scope
              </label>
              {selectedType === 'income' && (
                <span className="text-[11px] text-[var(--text-muted)] italic">
                  (Expenses only)
                </span>
              )}
            </div>
            <select
              id="export-necessity-select"
              value={selectedNecessity}
              onChange={(e) => setSelectedNecessity(e.target.value as NecessityClass | 'all')}
              disabled={isExporting || selectedType === 'income'}
              className="w-full text-xs bg-[var(--bg-canvas)] border border-[var(--border-hairline)] rounded-lg px-3 py-2 text-[var(--text-primary)] focus:outline-hidden cursor-pointer disabled:opacity-50"
            >
              <option value="all">All Necessities</option>
              <option value="essential">Essential</option>
              <option value="optional">Optional</option>
              <option value="luxury">Luxury</option>
            </select>
          </div>

          {/* 3c. Statement Security & Protection (Standard vs AES-256 Encrypted) */}
          <div className="p-4 bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] rounded-xl space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm">🔐</span>
                <span className="text-xs font-semibold text-[var(--text-primary)]">
                  Statement Protection &amp; Security
                </span>
              </div>
              <span className="text-[10px] text-[var(--text-muted)] font-mono">
                {protectionMode === 'protected' ? 'AES-256 Encrypted' : 'Standard Unencrypted'}
              </span>
            </div>

            {/* Mode Selector */}
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-[var(--bg-canvas)] border border-[var(--border-hairline)] rounded-lg text-xs font-medium">
              <button
                type="button"
                onClick={() => setProtectionMode('standard')}
                disabled={isExporting}
                className={`py-1.5 rounded-md transition-all cursor-pointer ${
                  protectionMode === 'standard'
                    ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] font-semibold shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Standard PDF
              </button>
              <button
                type="button"
                onClick={() => setProtectionMode('protected')}
                disabled={isExporting}
                className={`py-1.5 rounded-md transition-all cursor-pointer ${
                  protectionMode === 'protected'
                    ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] font-semibold shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Password-Protected PDF
              </button>
            </div>

            {/* Password Protection Details */}
            {protectionMode === 'protected' && (
              <div className="space-y-3 pt-2 border-t border-[var(--border-hairline)] animate-in fade-in duration-150">
                {/* Method Options: Account Password vs Separate Password */}
                <div className="space-y-2">
                  <label className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider block">
                    Choose Encryption Password Method
                  </label>

                  {/* Option 1: Account Password */}
                  <div
                    onClick={() => setPasswordOption('account')}
                    className={`p-3 rounded-lg border transition-all cursor-pointer ${
                      passwordOption === 'account'
                        ? 'bg-[var(--bg-surface)] border-[var(--text-primary)] shadow-2xs'
                        : 'bg-[var(--bg-canvas)] border-[var(--border-hairline)] hover:border-[var(--border-subtle)]'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <input
                        type="radio"
                        id="opt-account-pw"
                        name="pdf-password-choice"
                        checked={passwordOption === 'account'}
                        onChange={() => setPasswordOption('account')}
                        className="mt-0.5"
                      />
                      <div className="space-y-1 flex-1">
                        <label
                          htmlFor="opt-account-pw"
                          className="text-xs font-semibold text-[var(--text-primary)] cursor-pointer block"
                        >
                          Use my Arth account password
                        </label>
                        <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                          Re-authenticate with your account password to secure this PDF.
                        </p>

                        {/* Marker status is advisory; the server verifies the credential itself. */}
                        {!hasPassword && passwordOption === 'account' && (
                          <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-200 rounded text-[11px]">
                            Enter your existing Arth password. If you do not have one, choose a separate PDF password below.
                          </div>
                        )}

                        {/* Account password input */}
                        {passwordOption === 'account' && (
                          <div className="mt-2.5 space-y-2">
                            <div className="relative">
                              <input
                                type={showAccountPassword ? 'text' : 'password'}
                                value={accountPassword}
                                onChange={(e) => setAccountPassword(e.target.value)}
                                disabled={isExporting}
                                placeholder="Enter your current Arth password"
                                autoComplete="current-password"
                                className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-md px-2.5 py-1.5 pr-8 text-xs font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-hidden"
                              />
                              <button
                                type="button"
                                onClick={() => setShowAccountPassword(!showAccountPassword)}
                                aria-label={showAccountPassword ? 'Hide password' : 'Show password'}
                                tabIndex={-1}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                              >
                                {showAccountPassword ? '🙈' : '👁️'}
                              </button>
                            </div>

                            {/* Security Warning */}
                            <div className="p-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded text-[11px] text-amber-900 dark:text-amber-200 leading-normal">
                              ⚠️ <strong>Important Security Guidance:</strong> Anyone who knows your Arth account password may also be able to access your Arth account. Share this password carefully.
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Option 2: Separate PDF Password */}
                  <div
                    onClick={() => setPasswordOption('separate')}
                    className={`p-3 rounded-lg border transition-all cursor-pointer ${
                      passwordOption === 'separate'
                        ? 'bg-[var(--bg-surface)] border-[var(--text-primary)] shadow-2xs'
                        : 'bg-[var(--bg-canvas)] border-[var(--border-hairline)] hover:border-[var(--border-subtle)]'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <input
                        type="radio"
                        id="opt-separate-pw"
                        name="pdf-password-choice"
                        checked={passwordOption === 'separate'}
                        onChange={() => setPasswordOption('separate')}
                        className="mt-0.5"
                      />
                      <div className="space-y-1 flex-1">
                        <label
                          htmlFor="opt-separate-pw"
                          className="text-xs font-semibold text-[var(--text-primary)] cursor-pointer block"
                        >
                          Use a separate PDF password (Recommended for sharing)
                        </label>
                        <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                          Choose a dedicated password specifically for this document. Use this option to share with accountants, banks, or third parties without revealing your Arth account credentials.
                        </p>

                        {/* Separate password inputs */}
                        {passwordOption === 'separate' && (
                          <div className="mt-2.5 space-y-2.5">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div>
                                <label
                                  htmlFor="sep-password-input"
                                  className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1"
                                >
                                  Document Password
                                </label>
                                <div className="relative">
                                  <input
                                    id="sep-password-input"
                                    type={showSeparatePassword ? 'text' : 'password'}
                                    value={separatePassword}
                                    onChange={(e) => setSeparatePassword(e.target.value)}
                                    disabled={isExporting}
                                    placeholder="Min 6 characters"
                                    autoComplete="new-password"
                                    className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-md px-2.5 py-1.5 pr-8 text-xs font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-hidden"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setShowSeparatePassword(!showSeparatePassword)}
                                    aria-label={showSeparatePassword ? 'Hide password' : 'Show password'}
                                    tabIndex={-1}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                                  >
                                    {showSeparatePassword ? '🙈' : '👁️'}
                                  </button>
                                </div>
                              </div>

                              <div>
                                <label
                                  htmlFor="sep-confirm-password-input"
                                  className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1"
                                >
                                  Confirm Password
                                </label>
                                <input
                                  id="sep-confirm-password-input"
                                  type={showSeparatePassword ? 'text' : 'password'}
                                  value={separateConfirmPassword}
                                  onChange={(e) => setSeparateConfirmPassword(e.target.value)}
                                  disabled={isExporting}
                                  placeholder="Re-enter password"
                                  autoComplete="new-password"
                                  className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-md px-2.5 py-1.5 text-xs font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-hidden"
                                />
                              </div>
                            </div>

                            {/* Validation feedback */}
                            {separatePasswordError && (
                              <div className="text-[11px] text-red-600 dark:text-red-400 font-medium">
                                ⚠️ {separatePasswordError}
                              </div>
                            )}
                            {!separatePasswordError &&
                              separatePassword.trim().length >= 6 &&
                              separatePassword === separateConfirmPassword && (
                                <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                                  <span>✓</span>
                                  <span>Passwords match (AES-256 standard encryption ready)</span>
                                </div>
                              )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 4. Export Configuration Summary */}
          <div className="p-4 bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Statement Summary Preview
              </span>
              <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-primary)]">
                {isLoadingScope ? 'Calculating…' : `${previewTransactions.length} matching txns`}
              </span>
            </div>

            {!isLoadingScope && (
              <>
                <div className="grid grid-cols-3 gap-2 pt-1 border-t border-[var(--border-hairline)]">
                  <div>
                    <span className="text-[10px] text-[var(--text-muted)] uppercase block">Total Inflow</span>
                    <span className="text-xs font-mono font-semibold text-[var(--income-fg)] block">
                      +{summaryMetrics.formattedIncome}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[var(--text-muted)] uppercase block">Total Outflow</span>
                    <span className="text-xs font-mono font-semibold text-[var(--expense-fg)] block">
                      -{summaryMetrics.formattedExpense}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[var(--text-muted)] uppercase block">Net Flow</span>
                    <span
                      className={`text-xs font-mono font-semibold block ${
                        summaryMetrics.isNetPositive
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : summaryMetrics.isNetNegative
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-[var(--text-primary)]'
                      }`}
                    >
                      {summaryMetrics.isNetPositive ? '+' : ''}{summaryMetrics.formattedNet}
                    </span>
                    <span className="text-[9px] text-[var(--text-muted)] block">
                      {summaryMetrics.isNetPositive
                        ? 'Net inflow'
                        : summaryMetrics.isNetNegative
                        ? 'Net outflow'
                        : 'Neutral'}
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

          {/* 5. Action Buttons (Two Clear Export Options) */}
          <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isExporting}
              className="sm:w-1/4 py-2.5 text-xs font-medium border border-[var(--border-subtle)] rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] transition-colors cursor-pointer"
            >
              Cancel
            </button>

            {protectionMode === 'standard' ? (
              <div className="flex-1 flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={handleDownloadStandard}
                  disabled={
                    !isRangeValid ||
                    isExporting ||
                    isLoadingScope ||
                    previewTransactions.length === 0
                  }
                  className="flex-1 min-h-[38px] py-2.5 text-xs font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-lg hover:bg-[var(--action-primary-hover)] transition-all shadow-xs cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
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
                      <span>Download Standard PDF</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setProtectionMode('protected')}
                  disabled={
                    !isRangeValid ||
                    isExporting ||
                    isLoadingScope ||
                    previewTransactions.length === 0
                  }
                  className="sm:w-auto px-3.5 min-h-[38px] py-2.5 text-xs font-semibold bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] text-[var(--text-primary)] hover:bg-[var(--bg-canvas)] rounded-lg transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                  title="Configure encryption password"
                >
                  <span aria-hidden="true">🔐</span>
                  <span>Protect with Password…</span>
                </button>
              </div>
            ) : (
              <div className="flex-1 flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={() => setProtectionMode('standard')}
                  disabled={isExporting}
                  className="px-3 py-2.5 text-xs font-medium border border-[var(--border-hairline)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg cursor-pointer"
                >
                  ← Standard PDF
                </button>
                <button
                  type="button"
                  onClick={handleDownloadProtected}
                  disabled={
                    !isRangeValid ||
                    isExporting ||
                    isLoadingScope ||
                    previewTransactions.length === 0 ||
                    !isProtectedFormValid
                  }
                  className="flex-1 min-h-[38px] py-2.5 text-xs font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-lg hover:bg-[var(--action-primary-hover)] transition-all shadow-xs cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isExporting ? (
                    <>
                      <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      <span>{exportProgress || 'Encrypting statement…'}</span>
                    </>
                  ) : (
                    <>
                      <span aria-hidden="true">🔐</span>
                      <span>Download Password-Protected PDF</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
