'use client';

import React, { useState, useEffect, useRef } from 'react';
import { v7 as uuidv7 } from 'uuid';
import {
  type CategoryDTO,
  type TransactionDTO,
  type TransactionType,
  type PaymentMethod,
  type NecessityClass,
  type CreateTransactionResponse,
  type UpdateTransactionResponse,
  parseINRToPaise,
  formatPaiseToINR,
} from '@arth/contracts';
import { createTransaction, updateTransaction, fetchCategories } from '@/lib/api-client';
import { getTodayIST } from '@/lib/format';
import { enqueuePendingMutation, saveCachedTransaction } from '@/lib/offline-db';

interface QuickAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (res: CreateTransactionResponse | UpdateTransactionResponse) => void;
  categoryVersion?: number;
  editingTransaction?: TransactionDTO | null;
}

export function QuickAddModal({
  isOpen,
  onClose,
  onSuccess,
  categoryVersion = 0,
  editingTransaction = null,
}: QuickAddModalProps) {
  const isEditMode = Boolean(editingTransaction);

  const amountInputRef = useRef<HTMLInputElement | null>(null);

  // Stable UUID v7 for creation sessions (retained on retry)
  const [txnId, setTxnId] = useState<string>(() => uuidv7());
  const [type, setType] = useState<TransactionType>(() => editingTransaction?.type ?? 'expense');
  const [amount, setAmount] = useState<string>(() => editingTransaction?.amount_decimal ?? '');
  const [categoryId, setCategoryId] = useState<string>(() => editingTransaction?.category_id ?? '');
  const [transactionDate, setTransactionDate] = useState<string>(
    () => editingTransaction?.transaction_date ?? getTodayIST()
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(() => {
    if (editingTransaction?.payment_method) return editingTransaction.payment_method;
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('arth_last_payment_method');
      if (saved === 'online' || saved === 'cash') return saved;
    }
    return 'online';
  });

  // Explicit necessity tier: in new expense mode, do NOT auto-default; user must explicitly choose
  const [necessity, setNecessity] = useState<NecessityClass | null>(
    () => editingTransaction?.necessity ?? null
  );
  const [description, setDescription] = useState<string>(
    () => editingTransaction?.description ?? ''
  );
  const [notes, setNotes] = useState<string>(() => editingTransaction?.notes ?? '');
  const [showNotes, setShowNotes] = useState<boolean>(() => Boolean(editingTransaction?.notes));

  // Categories state
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState<boolean>(false);
  const [showMoreCategories, setShowMoreCategories] = useState<boolean>(false);

  // Status & error states
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const isSubmittingRef = useRef<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [consecutiveSuccessToast, setConsecutiveSuccessToast] = useState<string | null>(null);

  // Focus amount input when modal opens or after consecutive entry reset
  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => {
        amountInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(t);
    }
  }, [isOpen, txnId]);

  // Populate or reset form whenever modal opens or editingTransaction changes
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      if (editingTransaction) {
        setType(editingTransaction.type);
        setAmount(editingTransaction.amount_decimal);
        setCategoryId(editingTransaction.category_id);
        setTransactionDate(editingTransaction.transaction_date);
        setPaymentMethod(editingTransaction.payment_method);
        setNecessity(editingTransaction.necessity || null);
        setDescription(editingTransaction.description || '');
        setNotes(editingTransaction.notes || '');
        setShowNotes(Boolean(editingTransaction.notes));
        setErrorMessage(null);
        setConsecutiveSuccessToast(null);
      } else {
        setTxnId(uuidv7());
        setType('expense');
        setAmount('');
        // Necessity must NOT be preselected for new expenses
        setNecessity(null);
        setDescription('');
        setNotes('');
        setShowNotes(false);
        setErrorMessage(null);
        setConsecutiveSuccessToast(null);
        setTransactionDate(getTodayIST());

        if (typeof window !== 'undefined') {
          const savedMethod = localStorage.getItem('arth_last_payment_method');
          if (savedMethod === 'online' || savedMethod === 'cash') {
            setPaymentMethod(savedMethod);
          }
          const savedCat = localStorage.getItem('arth_last_category_expense');
          if (savedCat) {
            setCategoryId(savedCat);
          }
        }
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [isOpen, editingTransaction]);

  // Load categories asynchronously when transaction type changes
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const timer = setTimeout(() => {
      if (isMounted) setCategoriesLoading(true);
    }, 0);

    fetchCategories({ type })
      .then((res) => {
        if (!isMounted) return;
        const cats = res.categories || [];
        setCategories(cats);

        setCategoryId((prev) => {
          if (prev && cats.some((c) => c.id === prev)) {
            return prev;
          }
          if (
            editingTransaction &&
            editingTransaction.type === type &&
            cats.some((c) => c.id === editingTransaction.category_id)
          ) {
            return editingTransaction.category_id;
          }
          if (typeof window !== 'undefined') {
            const savedCat = localStorage.getItem(`arth_last_category_${type}`);
            if (savedCat && cats.some((c) => c.id === savedCat)) {
              return savedCat;
            }
          }
          return cats.length > 0 ? cats[0].id : '';
        });
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
      clearTimeout(timer);
    };
  }, [isOpen, type, categoryVersion, editingTransaction]);

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
    if (newType === 'expense') {
      setNecessity(null);
    }
  };

  const handlePaymentMethodChange = (method: PaymentMethod) => {
    setPaymentMethod(method);
    try {
      localStorage.setItem('arth_last_payment_method', method);
    } catch {
      // LocalStorage unavailable in private mode
    }
  };

  const handleCategorySelect = (id: string) => {
    setCategoryId(id);
    try {
      localStorage.setItem(`arth_last_category_${type}`, id);
    } catch {
      // LocalStorage unavailable in private mode
    }
  };

  const executeSave = async (keepOpenForNext: boolean) => {
    setErrorMessage(null);

    // Basic client preflight
    if (!amount.trim()) {
      setErrorMessage('Please enter an amount');
      amountInputRef.current?.focus();
      return;
    }

    try {
      parseINRToPaise(amount.trim());
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Invalid amount format');
      amountInputRef.current?.focus();
      return;
    }

    if (!categoryId) {
      setErrorMessage('Please select a category');
      return;
    }

    // Explicit necessity validation for expenses
    if (type === 'expense' && !necessity) {
      setErrorMessage('Please verify necessity: choose Essential, Optional, or Luxury');
      return;
    }

    if (isSubmittingRef.current || isSubmitting) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      if (isEditMode && editingTransaction) {
        const response = await updateTransaction(editingTransaction.id, {
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
      } else {
        const payload = {
          id: txnId, // Idempotent UUID v7
          amount: amount.trim(),
          type,
          category_id: categoryId,
          transaction_date: transactionDate,
          payment_method: paymentMethod,
          necessity: type === 'expense' ? necessity : null,
          description: description.trim() || null,
          notes: notes.trim() || null,
        };

        let response: CreateTransactionResponse;

        try {
          response = await createTransaction(payload);
          // Cache successful transaction into offline db
          saveCachedTransaction(response.transaction);
        } catch (netErr: unknown) {
          // If offline or network failure, queue to offline db and respond optimistically
          const isOffline =
            typeof navigator !== 'undefined' && !navigator.onLine;
          const isNetError =
            netErr instanceof TypeError ||
            /failed to fetch|network|offline/i.test(String(netErr));

          if (isOffline || isNetError) {
            const paise = parseINRToPaise(payload.amount);
            const optimisticTxn: TransactionDTO = {
              id: payload.id,
              amount_paise: Number(paise),
              amount_decimal: payload.amount,
              formatted_inr: formatPaiseToINR(paise),
              type: payload.type,
              category_id: payload.category_id,
              category_name:
                categories.find((c) => c.id === payload.category_id)?.name ||
                'Uncategorized',
              transaction_date: payload.transaction_date,
              payment_method: payload.payment_method,
              necessity: payload.necessity ?? null,
              description: payload.description || null,
              notes: payload.notes || null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };

            await enqueuePendingMutation({
              id: payload.id,
              type: 'create_transaction',
              payload,
            });
            await saveCachedTransaction(optimisticTxn);

            response = {
              transaction: optimisticTxn,
              idempotent_replay: false,
            };
          } else {
            throw netErr;
          }
        }

        onSuccess(response);

        if (keepOpenForNext) {
          // Fast consecutive entry: clear amount, reset necessity, generate new UUID v7, refocus amount
          const savedAmt = amount.trim();
          setAmount('');
          setNecessity(null);
          setDescription('');
          setNotes('');
          setShowNotes(false);
          setTxnId(uuidv7());
          setConsecutiveSuccessToast(
            `Recorded ₹${savedAmt} — enter next transaction`
          );
          setTimeout(() => {
            setConsecutiveSuccessToast(null);
          }, 3000);
          amountInputRef.current?.focus();
        } else {
          onClose();
        }
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : isEditMode
          ? 'Failed to update transaction'
          : 'Failed to record transaction';
      setErrorMessage(msg);
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeSave(false);
  };

  const topCategories = categories.slice(0, 6);
  const remainingCategories = categories.slice(6);
  const isSelectedInRemaining = remainingCategories.some((c) => c.id === categoryId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-xs transition-opacity p-0 md:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="transaction-modal-title"
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
          <div className="flex items-center gap-2">
            <h2 id="transaction-modal-title" className="text-base font-semibold text-[var(--text-primary)]">
              {isEditMode ? 'Edit Transaction' : 'Record Transaction'}
            </h2>
            {consecutiveSuccessToast && (
              <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-sm">
                ✓ {consecutiveSuccessToast}
              </span>
            )}
          </div>
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
                ref={amountInputRef}
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

          {/* 3. Category Selector (Top 6 chips + More) */}
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
                      handleCategorySelect(cat.id);
                      setShowMoreCategories(false);
                    }}
                    disabled={isSubmitting}
                    className={`px-2.5 py-1.5 text-xs rounded-md border transition-all text-left cursor-pointer ${
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
                  className={`px-2.5 py-1.5 text-xs rounded-md border border-dashed transition-all cursor-pointer ${
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
                      handleCategorySelect(cat.id);
                      setShowMoreCategories(false);
                    }}
                    className={`p-1.5 text-xs text-left rounded-md truncate cursor-pointer ${
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

          {/* 4. Payment Method: Paid using (Expense) vs Received as (Income) */}
          <div>
            <span className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              {type === 'expense' ? 'Paid using' : 'Received as'}
            </span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => handlePaymentMethodChange('online')}
                disabled={isSubmitting}
                className={`py-2 px-3 rounded-lg border text-center font-medium transition-all cursor-pointer ${
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
                className={`py-2 px-3 rounded-lg border text-center font-medium transition-all cursor-pointer ${
                  paymentMethod === 'cash'
                    ? 'bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] border-[var(--action-primary-bg)]'
                    : 'bg-[var(--bg-canvas)] text-[var(--text-secondary)] border-[var(--border-hairline)] hover:border-[var(--border-subtle)]'
                }`}
              >
                Cash
              </button>
            </div>
          </div>

          {/* 5. Necessity (Expense Only - strictly verified each time, not auto-defaulted) */}
          {type === 'expense' && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-[var(--text-secondary)]">
                  Necessity <span className="text-red-500">*</span>
                </span>
                {!necessity && (
                  <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                    Please select tier
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-1.5 text-xs font-medium">
                {(['essential', 'optional', 'luxury'] as NecessityClass[]).map((n) => {
                  const isSelected = necessity === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => {
                        setNecessity(n);
                        setErrorMessage(null);
                      }}
                      disabled={isSubmitting}
                      className={`py-2 px-2 rounded-md border capitalize transition-all cursor-pointer text-center ${
                        isSelected
                          ? 'bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] border-[var(--action-primary-bg)] font-semibold shadow-xs'
                          : 'bg-[var(--bg-canvas)] text-[var(--text-secondary)] border-[var(--border-hairline)] hover:border-[var(--border-subtle)]'
                      }`}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 6. Optional Name & IST Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label htmlFor="transaction-name-input" className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Name <span className="text-[10px] text-[var(--text-muted)] font-normal">(optional)</span>
              </label>
              <input
                id="transaction-name-input"
                type="text"
                maxLength={255}
                placeholder="e.g. Lunch, Grocery"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isSubmitting}
                className="w-full bg-[var(--bg-canvas)] border border-[var(--border-subtle)] focus:border-[var(--focus-ring)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-hidden"
              />
            </div>

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
          </div>

          {/* 7. Collapsed Private Notes */}
          <div>
            {!showNotes ? (
              <button
                type="button"
                onClick={() => setShowNotes(true)}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] underline decoration-dotted cursor-pointer"
              >
                + Add private note
              </button>
            ) : (
              <div className="space-y-2 p-3 bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-[var(--text-secondary)]">Private Note</span>
                  <button
                    type="button"
                    onClick={() => setShowNotes(false)}
                    className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    Hide
                  </button>
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
          <div className="pt-2 flex flex-col sm:flex-row items-center gap-2">
            {!isEditMode && (
              <button
                type="button"
                onClick={() => executeSave(true)}
                disabled={isSubmitting}
                className="w-full sm:w-1/2 py-2.5 text-xs font-semibold border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] bg-[var(--bg-surface-subtle)] hover:bg-[var(--bg-canvas)] transition-colors cursor-pointer disabled:opacity-60"
              >
                Save &amp; Add Another
              </button>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              aria-busy={isSubmitting}
              className={`w-full ${!isEditMode ? 'sm:w-1/2' : 'w-full'} min-h-[38px] py-2.5 text-xs font-semibold rounded-lg text-white transition-all shadow-xs cursor-pointer flex items-center justify-center gap-2 ${
                type === 'expense'
                  ? 'bg-red-700 hover:bg-red-800'
                  : 'bg-emerald-700 hover:bg-emerald-800'
              } disabled:opacity-60 disabled:cursor-not-allowed`}
            >
              {isSubmitting && (
                <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              )}
              <span>
                {isSubmitting
                ? isEditMode
                  ? 'Saving Changes…'
                  : 'Recording...'
                : errorMessage
                ? 'Retry Submission'
                : isEditMode
                ? 'Save Changes'
                : `Record ${type === 'expense' ? 'Expense' : 'Income'}`}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
