'use client';

import React, { useState, useEffect } from 'react';
import { v7 as uuidv7 } from 'uuid';
import {
  type CategoryDTO,
  type TransactionType,
  type PaymentMethod,
  type NecessityClass,
  type CreateTransactionResponse,
} from '@arth/contracts';
import { createTransaction, fetchCategories } from '@/lib/api-client';
import { getTodayIST } from '@/lib/format';

interface QuickAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (res: CreateTransactionResponse) => void;
  categoryVersion?: number;
}

export function QuickAddModal({
  isOpen,
  onClose,
  onSuccess,
  categoryVersion = 0,
}: QuickAddModalProps) {
  // Stable UUID v7 for this submission session (retained on retry)
  const [txnId] = useState<string>(() => uuidv7());
  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [transactionDate, setTransactionDate] = useState<string>(() => getTodayIST());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('arth_last_payment_method');
      if (saved === 'online' || saved === 'cash') return saved;
    }
    return 'online';
  });
  const [necessity, setNecessity] = useState<NecessityClass>('essential');
  const [description, setDescription] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [showNotes, setShowNotes] = useState<boolean>(false);

  // Categories state
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState<boolean>(false);
  const [showMoreCategories, setShowMoreCategories] = useState<boolean>(false);

  // Status & error states
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load categories asynchronously when transaction type changes
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    fetchCategories({ type })
      .then((res) => {
        if (!isMounted) return;
        const cats = res.categories || [];
        setCategories(cats);
        if (cats.length > 0) {
          setCategoryId(cats[0].id);
        } else {
          setCategoryId('');
        }
        setCategoriesLoading(false);
      })
      .catch(() => {
        if (isMounted) {
          setCategories([]);
          setCategoriesLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, type, categoryVersion]);

  // Handle Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const handleTypeChange = (newType: TransactionType) => {
    if (newType === type) return;
    setType(newType);
    setErrorMessage(null);
    setCategoriesLoading(true);
  };

  const handlePaymentMethodChange = (method: PaymentMethod) => {
    setPaymentMethod(method);
    try {
      localStorage.setItem('arth_last_payment_method', method);
    } catch {
      // LocalStorage unavailable in private mode
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Basic client preflight
    if (!amount.trim()) {
      setErrorMessage('Please enter a monetary amount');
      return;
    }
    if (!categoryId) {
      setErrorMessage('Please select a category');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await createTransaction({
        id: txnId, // Idempotent UUID v7
        amount: amount.trim(),
        type,
        category_id: categoryId,
        transaction_date: transactionDate,
        payment_method: paymentMethod,
        necessity: type === 'expense' ? necessity : null,
        description: description.trim() || null,
        notes: notes.trim() || null,
      });

      onSuccess(response);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to record transaction';
      setErrorMessage(msg);
      // Notice: txnId is NOT regenerated on failure!
      // This guarantees that clicking "Retry" submits the exact same UUID v7.
    } finally {
      setIsSubmitting(false);
    }
  };

  const topCategories = categories.slice(0, 6);
  const remainingCategories = categories.slice(6);
  const isSelectedInRemaining = remainingCategories.some((c) => c.id === categoryId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-xs transition-opacity p-0 md:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-add-title"
    >
      {/* Backdrop tap to dismiss */}
      <div
        className="fixed inset-0"
        onClick={() => {
          if (!isSubmitting) onClose();
        }}
      />

      {/* Modal / Bottom Sheet Card */}
      <div
        className="relative z-10 w-full max-h-[92vh] md:max-w-md overflow-y-auto bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-t-2xl md:rounded-xl shadow-2xl p-5 md:p-6 transition-all"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        {/* Mobile Drag Indicator */}
        <div className="w-10 h-1 bg-[var(--border-subtle)] rounded-full mx-auto mb-4 md:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-hairline)]">
          <h2 id="quick-add-title" className="text-base font-semibold text-[var(--text-primary)]">
            Record Transaction
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close dialog"
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 rounded-sm text-sm cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Error Notification */}
        {errorMessage && (
          <div className="mt-4 p-3 text-xs bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 rounded-md">
            <span className="font-semibold">Error:</span> {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* 1. Transaction Type Toggle (Segmented control) */}
          <div className="grid grid-cols-2 p-1 bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] rounded-lg text-xs font-medium">
            <button
              type="button"
              onClick={() => handleTypeChange('expense')}
              className={`py-1.5 rounded-md transition-colors ${
                type === 'expense'
                  ? 'bg-[var(--bg-surface)] text-red-600 dark:text-red-400 shadow-xs font-semibold'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Expense
            </button>
            <button
              type="button"
              onClick={() => handleTypeChange('income')}
              className={`py-1.5 rounded-md transition-colors ${
                type === 'income'
                  ? 'bg-[var(--bg-surface)] text-emerald-600 dark:text-emerald-400 shadow-xs font-semibold'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Income
            </button>
          </div>

          {/* 2. Amount Input (Geist Mono, prominent) */}
          <div>
            <label htmlFor="amount-input" className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              Amount (INR)
            </label>
            <div className="relative flex items-center border border-[var(--border-subtle)] focus-within:border-[var(--focus-ring)] rounded-lg bg-[var(--bg-canvas)] px-3 py-2">
              <span className="text-xl font-mono text-[var(--text-muted)] mr-2 select-none">₹</span>
              <input
                id="amount-input"
                type="text"
                inputMode="decimal"
                pattern="^[0-9]*[.]?[0-9]{0,2}$"
                placeholder="0.00"
                value={amount}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
                    setAmount(val);
                  }
                }}
                disabled={isSubmitting}
                required
                autoFocus
                className="w-full bg-transparent font-mono text-2xl md:text-3xl text-[var(--text-primary)] tracking-tight focus:outline-hidden"
              />
            </div>
          </div>

          {/* 3. Transaction Date */}
          <div>
            <label htmlFor="date-input" className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              Date (IST)
            </label>
            <input
              id="date-input"
              type="date"
              value={transactionDate}
              onChange={(e) => setTransactionDate(e.target.value)}
              disabled={isSubmitting}
              required
              className="w-full bg-[var(--bg-canvas)] border border-[var(--border-subtle)] focus:border-[var(--focus-ring)] rounded-lg px-3 py-2 text-xs font-mono text-[var(--text-primary)] focus:outline-hidden"
            />
          </div>

          {/* 4. Category Selector (Top 6 chips + More) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-[var(--text-secondary)]">Category</span>
              {categoriesLoading && (
                <span className="text-[10px] text-[var(--text-muted)]">Loading...</span>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {topCategories.map((cat) => {
                const isSelected = categoryId === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setCategoryId(cat.id);
                      setShowMoreCategories(false);
                    }}
                    disabled={isSubmitting}
                    className={`px-2.5 py-1.5 text-xs rounded-md border transition-all text-left ${
                      isSelected
                        ? 'bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] border-[var(--action-primary-bg)] font-medium'
                        : 'bg-[var(--bg-canvas)] text-[var(--text-secondary)] border-[var(--border-hairline)] hover:border-[var(--border-subtle)]'
                    }`}
                  >
                    {cat.name}
                  </button>
                );
              })}

              {remainingCategories.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowMoreCategories(!showMoreCategories)}
                  disabled={isSubmitting}
                  className={`px-2.5 py-1.5 text-xs rounded-md border border-dashed transition-all ${
                    isSelectedInRemaining || showMoreCategories
                      ? 'border-[var(--text-primary)] text-[var(--text-primary)] font-medium'
                      : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  {isSelectedInRemaining
                    ? categories.find((c) => c.id === categoryId)?.name || 'More...'
                    : showMoreCategories
                    ? 'Less ▲'
                    : `+${remainingCategories.length} More ▼`}
                </button>
              )}
            </div>

            {/* Extended Categories drawer if opened */}
            {showMoreCategories && remainingCategories.length > 0 && (
              <div className="mt-2 p-2 bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] rounded-lg grid grid-cols-2 gap-1.5">
                {remainingCategories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setCategoryId(cat.id);
                      setShowMoreCategories(false);
                    }}
                    className={`p-1.5 text-xs text-left rounded-md truncate ${
                      categoryId === cat.id
                        ? 'bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] font-medium'
                        : 'hover:bg-[var(--bg-surface)] text-[var(--text-secondary)]'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 5. Payment Method (Online vs Cash) */}
          <div>
            <span className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              Payment Method
            </span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => handlePaymentMethodChange('online')}
                disabled={isSubmitting}
                className={`py-2 px-3 rounded-lg border text-center font-medium transition-all ${
                  paymentMethod === 'online'
                    ? 'bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] border-[var(--action-primary-bg)]'
                    : 'bg-[var(--bg-canvas)] text-[var(--text-secondary)] border-[var(--border-hairline)] hover:border-[var(--border-subtle)]'
                }`}
              >
                Online
              </button>
              <button
                type="button"
                onClick={() => handlePaymentMethodChange('cash')}
                disabled={isSubmitting}
                className={`py-2 px-3 rounded-lg border text-center font-medium transition-all ${
                  paymentMethod === 'cash'
                    ? 'bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] border-[var(--action-primary-bg)]'
                    : 'bg-[var(--bg-canvas)] text-[var(--text-secondary)] border-[var(--border-hairline)] hover:border-[var(--border-subtle)]'
                }`}
              >
                Cash
              </button>
            </div>
          </div>

          {/* 6. Necessity (Expense Only - strictly removed for Income) */}
          {type === 'expense' && (
            <div>
              <span className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Necessity
              </span>
              <div className="grid grid-cols-3 gap-1.5 text-xs font-medium">
                {(['essential', 'optional', 'luxury'] as NecessityClass[]).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setNecessity(n)}
                    disabled={isSubmitting}
                    className={`py-1.5 px-2 rounded-md border capitalize transition-all ${
                      necessity === n
                        ? 'bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] border-[var(--action-primary-bg)]'
                        : 'bg-[var(--bg-canvas)] text-[var(--text-secondary)] border-[var(--border-hairline)] hover:border-[var(--border-subtle)]'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 7. Collapsed Notes / Description */}
          <div>
            {!showNotes ? (
              <button
                type="button"
                onClick={() => setShowNotes(true)}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] underline decoration-dotted cursor-pointer"
              >
                + Add description or private note
              </button>
            ) : (
              <div className="space-y-2 p-3 bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-[var(--text-secondary)]">Details</span>
                  <button
                    type="button"
                    onClick={() => setShowNotes(false)}
                    className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    Hide
                  </button>
                </div>
                <div>
                  <input
                    type="text"
                    maxLength={500}
                    placeholder="Short description (e.g. Swiggy order)"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-md px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:outline-hidden"
                  />
                </div>
                <div>
                  <textarea
                    maxLength={1000}
                    rows={2}
                    placeholder="Private note..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-md px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:outline-hidden resize-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* 8. Action Buttons */}
          <div className="pt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="w-1/3 py-2.5 text-xs font-medium border border-[var(--border-subtle)] rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`w-2/3 py-2.5 text-xs font-semibold rounded-lg text-white transition-all shadow-xs cursor-pointer ${
                type === 'expense'
                  ? 'bg-red-700 hover:bg-red-800'
                  : 'bg-emerald-700 hover:bg-emerald-800'
              } disabled:opacity-60 disabled:cursor-not-allowed`}
            >
              {isSubmitting
                ? 'Recording...'
                : errorMessage
                ? 'Retry Submission'
                : `Record ${type === 'expense' ? 'Expense' : 'Income'}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
