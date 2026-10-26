'use client';

import React, { useState } from 'react';
import { v7 as uuidv7 } from 'uuid';
import type { PaymentMethod, AccountBalancesDTO } from '@arth/contracts';
import { createBalanceTransfer } from '@/lib/api-client';
import { parseINRToPaise } from '@arth/contracts';

interface TransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (balances: AccountBalancesDTO) => void;
  currentBalances?: AccountBalancesDTO | null;
}

export function TransferModal({
  isOpen,
  onClose,
  onSuccess,
  currentBalances,
}: TransferModalProps) {
  const [fromMethod, setFromMethod] = useState<PaymentMethod>('online');
  const [amountStr, setAmountStr] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const toMethod: PaymentMethod = fromMethod === 'cash' ? 'online' : 'cash';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!amountStr.trim()) {
      setErrorMsg('Please enter a transfer amount');
      return;
    }

    try {
      parseINRToPaise(amountStr.trim());
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Invalid amount format');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createBalanceTransfer({
        id: uuidv7(),
        amount: amountStr.trim(),
        from_method: fromMethod,
        to_method: toMethod,
        reason: reason.trim() || (fromMethod === 'online' ? 'ATM Cash Withdrawal' : 'Cash Deposit'),
      });

      onSuccess(res.balances);
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to record balance transfer'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="transfer-modal-title"
    >
      <div
        className="fixed inset-0"
        onClick={() => {
          if (!isSubmitting) onClose();
        }}
      />

      <div className="relative z-10 w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl shadow-2xl p-6 transition-all">
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-hairline)]">
          <div>
            <h2
              id="transfer-modal-title"
              className="text-base font-semibold text-[var(--text-primary)]"
            >
              Transfer Between Accounts
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Move funds between your Cash and Online accounts
            </p>
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

        {errorMsg && (
          <div className="mt-4 p-3 text-xs bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 rounded-md">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Transfer Direction Toggle */}
          <div className="grid grid-cols-2 gap-2 text-xs font-medium">
            <button
              type="button"
              onClick={() => setFromMethod('online')}
              className={`p-2.5 rounded-lg border text-center transition-all cursor-pointer ${
                fromMethod === 'online'
                  ? 'bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] border-[var(--action-primary-bg)]'
                  : 'bg-[var(--bg-canvas)] text-[var(--text-secondary)] border-[var(--border-hairline)] hover:border-[var(--border-subtle)]'
              }`}
            >
              <div className="font-semibold">Online &rarr; Cash</div>
              <div className="text-[10px] opacity-80 mt-0.5">ATM / Cash Withdrawal</div>
            </button>
            <button
              type="button"
              onClick={() => setFromMethod('cash')}
              className={`p-2.5 rounded-lg border text-center transition-all cursor-pointer ${
                fromMethod === 'cash'
                  ? 'bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] border-[var(--action-primary-bg)]'
                  : 'bg-[var(--bg-canvas)] text-[var(--text-secondary)] border-[var(--border-hairline)] hover:border-[var(--border-subtle)]'
              }`}
            >
              <div className="font-semibold">Cash &rarr; Online</div>
              <div className="text-[10px] opacity-80 mt-0.5">Bank / CDM Deposit</div>
            </button>
          </div>

          {/* Amount input */}
          <div>
            <label
              htmlFor="transfer-amount"
              className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
            >
              Amount to Transfer (INR)
            </label>
            <div className="relative flex items-center border border-[var(--border-subtle)] focus-within:border-[var(--focus-ring)] rounded-lg bg-[var(--bg-canvas)] px-3 py-2">
              <span className="text-xl font-mono text-[var(--text-muted)] mr-2 select-none">
                ₹
              </span>
              <input
                id="transfer-amount"
                type="text"
                inputMode="decimal"
                pattern="^[0-9]*[.]?[0-9]{0,2}$"
                placeholder="0.00"
                value={amountStr}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
                    setAmountStr(val);
                  }
                }}
                disabled={isSubmitting}
                autoFocus
                className="w-full bg-transparent font-mono text-2xl text-[var(--text-primary)] tracking-tight focus:outline-hidden"
              />
            </div>
            {currentBalances && (
              <p className="text-[11px] text-[var(--text-muted)] mt-1">
                Current {fromMethod === 'online' ? 'Online' : 'Cash'} Balance:{' '}
                <span className="font-mono text-[var(--text-secondary)]">
                  {fromMethod === 'online'
                    ? currentBalances.formatted_current_online
                    : currentBalances.formatted_current_cash}
                </span>
              </p>
            )}
          </div>

          {/* Optional reason / note */}
          <div>
            <label
              htmlFor="transfer-reason"
              className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
            >
              Note <span className="text-[10px] text-[var(--text-muted)]">(optional)</span>
            </label>
            <input
              id="transfer-reason"
              type="text"
              placeholder={fromMethod === 'online' ? 'ATM Withdrawal' : 'Cash Deposit'}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isSubmitting}
              className="w-full bg-[var(--bg-canvas)] border border-[var(--border-subtle)] focus:border-[var(--focus-ring)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-hidden"
            />
          </div>

          <div className="pt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="w-1/3 py-2 text-xs font-medium border border-[var(--border-subtle)] rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-2/3 py-2 text-xs font-semibold rounded-lg bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] hover:bg-[var(--action-primary-hover)] transition-all shadow-xs cursor-pointer disabled:opacity-60"
            >
              {isSubmitting ? 'Transferring...' : 'Confirm Transfer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
