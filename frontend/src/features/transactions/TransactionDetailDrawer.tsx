'use client';

import React, { useEffect } from 'react';
import type { TransactionDTO } from '@arth/contracts';
import { formatDateHuman, formatDateTimeIST } from '@/lib/format';

interface TransactionDetailDrawerProps {
  transaction: TransactionDTO | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (txn: TransactionDTO) => void;
  onDelete: (txn: TransactionDTO) => void;
}

export function TransactionDetailDrawer({
  transaction,
  isOpen,
  onClose,
  onEdit,
  onDelete,
}: TransactionDetailDrawerProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !transaction) return null;

  const isIncome = transaction.type === 'income';
  const hasUpdated =
    transaction.updated_at &&
    transaction.created_at &&
    Math.abs(new Date(transaction.updated_at).getTime() - new Date(transaction.created_at).getTime()) > 1000;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end bg-black/60 backdrop-blur-xs transition-opacity"
      role="dialog"
      aria-modal="true"
      aria-labelledby="txn-detail-title"
    >
      {/* Backdrop */}
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      {/* Sheet / Drawer Container */}
      <div
        className="relative z-10 w-full sm:max-w-md bg-[var(--bg-surface)] border-t sm:border-t-0 sm:border-l border-[var(--border-hairline)] rounded-t-2xl sm:rounded-none shadow-2xl flex flex-col max-h-[92vh] sm:max-h-full transition-transform"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
      >
        {/* Mobile Drag Indicator */}
        <div className="w-10 h-1 bg-[var(--border-subtle)] rounded-full mx-auto mt-3 sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-[var(--border-hairline)]">
          <div className="min-w-0 pr-3">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-[var(--text-muted)] block mb-0.5">
              Transaction Details
            </span>
            <h2
              id="txn-detail-title"
              className="text-base font-semibold text-[var(--text-primary)] truncate"
            >
              {transaction.description || transaction.category_name || 'Transaction'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close transaction details"
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1.5 rounded-md hover:bg-[var(--bg-surface-subtle)] transition-colors cursor-pointer shrink-0"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-6">
          {/* Hero Amount & Badges */}
          <div className="p-4 bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] rounded-xl">
            <span className="text-[11px] font-medium text-[var(--text-muted)] block mb-1">
              Amount
            </span>
            <div
              className={`text-3xl font-mono font-bold tracking-tight ${
                isIncome
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-[var(--text-primary)]'
              }`}
            >
              {isIncome ? `+${transaction.formatted_inr}` : `-${transaction.formatted_inr}`}
            </div>

            <div className="flex items-center gap-2 mt-3">
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                  isIncome
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                    : 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                }`}
              >
                {isIncome ? 'Income' : 'Expense'}
              </span>

              {transaction.necessity && (
                <span
                  className={`capitalize px-2 py-0.5 rounded text-[10px] font-medium border ${
                    transaction.necessity === 'essential'
                      ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                      : transaction.necessity === 'optional'
                      ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                      : 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800'
                  }`}
                >
                  {transaction.necessity}
                </span>
              )}
            </div>
          </div>

          {/* Details Table / List */}
          <div className="divide-y divide-[var(--border-hairline)] border border-[var(--border-hairline)] rounded-xl bg-[var(--bg-surface)] text-xs">
            {/* Transaction Name */}
            {transaction.description && (
              <div className="flex items-start justify-between p-3 gap-3">
                <span className="text-[var(--text-muted)] font-medium shrink-0">Transaction Name</span>
                <span className="text-[var(--text-primary)] font-medium text-right break-words">
                  {transaction.description}
                </span>
              </div>
            )}

            {/* Category */}
            <div className="flex items-center justify-between p-3 gap-3">
              <span className="text-[var(--text-muted)] font-medium shrink-0">Category</span>
              <span className="text-[var(--text-primary)] font-semibold text-right">
                {transaction.category_name || 'Uncategorized'}
              </span>
            </div>

            {/* Date */}
            <div className="flex items-center justify-between p-3 gap-3">
              <span className="text-[var(--text-muted)] font-medium shrink-0">Date</span>
              <span className="text-[var(--text-primary)] font-mono text-right">
                {formatDateHuman(transaction.transaction_date)}{' '}
                <span className="text-[var(--text-muted)] text-[10px]">({transaction.transaction_date})</span>
              </span>
            </div>

            {/* Payment Method */}
            <div className="flex items-center justify-between p-3 gap-3">
              <span className="text-[var(--text-muted)] font-medium shrink-0">Payment Method</span>
              <span className="text-[var(--text-primary)] capitalize text-right font-medium">
                {transaction.payment_method === 'online' ? '💳 Online' : '💵 Cash'}
              </span>
            </div>

            {/* Necessity (Expense only) */}
            {transaction.necessity && (
              <div className="flex items-center justify-between p-3 gap-3">
                <span className="text-[var(--text-muted)] font-medium shrink-0">Necessity</span>
                <span className="text-[var(--text-primary)] capitalize text-right font-medium">
                  {transaction.necessity}
                </span>
              </div>
            )}

            {/* Created Timestamp */}
            {transaction.created_at && (
              <div className="flex items-center justify-between p-3 gap-3">
                <span className="text-[var(--text-muted)] font-medium shrink-0">Recorded On</span>
                <span className="text-[var(--text-secondary)] text-right font-mono text-[11px]">
                  {formatDateTimeIST(transaction.created_at)}
                </span>
              </div>
            )}

            {/* Last Updated Timestamp */}
            {hasUpdated && (
              <div className="flex items-center justify-between p-3 gap-3">
                <span className="text-[var(--text-muted)] font-medium shrink-0">Last Updated</span>
                <span className="text-[var(--text-secondary)] text-right font-mono text-[11px]">
                  {formatDateTimeIST(transaction.updated_at)}
                </span>
              </div>
            )}

            {/* Transaction ID */}
            <div className="flex items-center justify-between p-3 gap-3">
              <span className="text-[var(--text-muted)] font-medium shrink-0">Transaction ID</span>
              <span
                className="text-[var(--text-muted)] text-[10px] font-mono text-right truncate max-w-[180px]"
                title={transaction.id}
              >
                {transaction.id}
              </span>
            </div>
          </div>

          {/* Private Notes */}
          {transaction.notes && (
            <div className="p-3.5 bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] rounded-xl space-y-1">
              <span className="text-[11px] font-medium text-[var(--text-muted)] block">
                Private Note
              </span>
              <p className="text-xs text-[var(--text-primary)] whitespace-pre-wrap">
                {transaction.notes}
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 sm:px-6 pt-3 pb-2 border-t border-[var(--border-hairline)] flex items-center gap-2">
          <button
            type="button"
            onClick={() => onEdit(transaction)}
            className="flex-1 py-2.5 px-3 text-xs font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-lg hover:bg-[var(--action-primary-hover)] transition-colors shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
          >
            <span>✏️</span>
            <span>Edit Transaction</span>
          </button>

          <button
            type="button"
            onClick={() => onDelete(transaction)}
            className="py-2.5 px-3.5 text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/60 border border-red-200 dark:border-red-900/60 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5"
          >
            <span>🗑️</span>
            <span>Delete</span>
          </button>
        </div>
      </div>
    </div>
  );
}
