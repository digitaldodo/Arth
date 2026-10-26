'use client';

import React from 'react';
import type { TransactionDTO } from '@arth/contracts';
import { formatDateHuman } from '@/lib/format';

interface DeleteTransactionModalProps {
  transaction: TransactionDTO | null;
  isOpen: boolean;
  isDeleting: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  errorMessage: string | null;
}

export function DeleteTransactionModal({
  transaction,
  isOpen,
  isDeleting,
  onClose,
  onConfirm,
  errorMessage,
}: DeleteTransactionModalProps) {
  if (!isOpen || !transaction) return null;

  const isIncome = transaction.type === 'income';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs transition-opacity p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-txn-title"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0"
        onClick={() => {
          if (!isDeleting) onClose();
        }}
        aria-hidden="true"
      />

      {/* Modal Dialog Card */}
      <div
        className="relative z-10 w-full sm:max-w-md bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-t-2xl sm:rounded-xl shadow-2xl p-5 sm:p-6 transition-all"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        {/* Mobile Drag Indicator */}
        <div className="w-10 h-1 bg-[var(--border-subtle)] rounded-full mx-auto mb-4 sm:hidden" />

        {/* Warning Icon & Title */}
        <div className="flex items-center gap-3 pb-3 border-b border-[var(--border-hairline)]">
          <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-950/60 flex items-center justify-center text-red-600 dark:text-red-400 font-bold shrink-0">
            🗑️
          </div>
          <div>
            <h3 id="delete-txn-title" className="text-sm font-semibold text-[var(--text-primary)]">
              Delete Transaction
            </h3>
            <span className="text-[11px] text-[var(--text-muted)]">
              This action removes the record from your active ledger.
            </span>
          </div>
        </div>

        {/* Target Transaction Summary Card */}
        <div className="my-4 p-3.5 bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] rounded-lg">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-[var(--text-primary)]">
                {transaction.description || transaction.category_name || 'Transaction'}
              </div>
              <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                {transaction.category_name} • {formatDateHuman(transaction.transaction_date)}
              </div>
            </div>
            <div
              className={`font-mono text-sm font-bold ${
                isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--text-primary)]'
              }`}
            >
              {isIncome ? `+${transaction.formatted_inr}` : `-${transaction.formatted_inr}`}
            </div>
          </div>
        </div>

        {/* Explanation / Warning */}
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          The transaction will be removed from your active ledger and excluded from all cash flow
          summaries, dashboard analytics, and exported statements.
        </p>

        {/* Error notification if deletion failed */}
        {errorMessage && (
          <div className="mt-3 p-2.5 text-xs bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 rounded-md">
            <span className="font-semibold">Error:</span> {errorMessage}
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-5 flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="flex-1 py-2.5 text-xs font-medium border border-[var(--border-subtle)] rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            aria-busy={isDeleting}
            className="flex-1 min-h-[38px] py-2.5 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors shadow-xs cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
          >
            {isDeleting ? (
              <>
                <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Deleting...</span>
              </>
            ) : (
              <span>Confirm Delete</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
