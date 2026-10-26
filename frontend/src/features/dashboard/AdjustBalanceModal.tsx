'use client';

import React, { useState } from 'react';
import { v7 as uuidv7 } from 'uuid';
import type { PaymentMethod, AccountBalancesDTO } from '@arth/contracts';
import { createBalanceAdjustment } from '@/lib/api-client';
import { parseINRToPaise } from '@arth/contracts';

interface AdjustBalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (balances: AccountBalancesDTO) => void;
  currentBalances?: AccountBalancesDTO | null;
}

export function AdjustBalanceModal({
  isOpen,
  onClose,
  onSuccess,
  currentBalances,
}: AdjustBalanceModalProps) {
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [direction, setDirection] = useState<'increase' | 'decrease'>('increase');
  const [amountStr, setAmountStr] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!amountStr.trim()) {
      setErrorMsg('Please enter an adjustment amount');
      return;
    }

    try {
      parseINRToPaise(amountStr.trim());
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Invalid amount format');
      return;
    }

    if (!reason.trim()) {
      setErrorMsg('A reason is required for auditable balance corrections');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createBalanceAdjustment({
        id: uuidv7(),
        payment_method: method,
        amount: amountStr.trim(),
        direction,
        reason: reason.trim(),
      });

      onSuccess(res.balances);
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to record balance adjustment'
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
      aria-labelledby="adjust-modal-title"
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
              id="adjust-modal-title"
              className="text-base font-semibold text-[var(--text-primary)]"
            >
              Adjust Balance (Reconciliation)
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Record an auditable correction to align your balance
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
          {/* Account Selection (Cash vs Online) */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              Select Account to Adjust
            </label>
            <div className="grid grid-cols-2 gap-2 text-xs font-medium">
              <button
                type="button"
                onClick={() => setMethod('cash')}
                className={`py-2 px-3 rounded-lg border text-center transition-all cursor-pointer ${
                  method === 'cash'
                    ? 'bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] border-[var(--action-primary-bg)] font-semibold'
                    : 'bg-[var(--bg-canvas)] text-[var(--text-secondary)] border-[var(--border-hairline)] hover:border-[var(--border-subtle)]'
                }`}
              >
                Cash Account
              </button>
              <button
                type="button"
                onClick={() => setMethod('online')}
                className={`py-2 px-3 rounded-lg border text-center transition-all cursor-pointer ${
                  method === 'online'
                    ? 'bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] border-[var(--action-primary-bg)] font-semibold'
                    : 'bg-[var(--bg-canvas)] text-[var(--text-secondary)] border-[var(--border-hairline)] hover:border-[var(--border-subtle)]'
                }`}
              >
                Online Account
              </button>
            </div>
            {currentBalances && (
              <p className="text-[11px] text-[var(--text-muted)] mt-1">
                Current {method === 'cash' ? 'Cash' : 'Online'} Balance:{' '}
                <span className="font-mono text-[var(--text-secondary)]">
                  {method === 'cash'
                    ? currentBalances.formatted_current_cash
                    : currentBalances.formatted_current_online}
                </span>
              </p>
            )}
          </div>

          {/* Direction Selection (Increase vs Decrease) */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              Adjustment Type
            </label>
            <div className="grid grid-cols-2 gap-2 text-xs font-medium">
              <button
                type="button"
                onClick={() => setDirection('increase')}
                className={`py-2 px-3 rounded-lg border text-center transition-all cursor-pointer ${
                  direction === 'increase'
                    ? 'bg-emerald-700 text-white border-emerald-700 font-semibold'
                    : 'bg-[var(--bg-canvas)] text-[var(--text-secondary)] border-[var(--border-hairline)] hover:border-[var(--border-subtle)]'
                }`}
              >
                + Add / Found Funds
              </button>
              <button
                type="button"
                onClick={() => setDirection('decrease')}
                className={`py-2 px-3 rounded-lg border text-center transition-all cursor-pointer ${
                  direction === 'decrease'
                    ? 'bg-red-700 text-white border-red-700 font-semibold'
                    : 'bg-[var(--bg-canvas)] text-[var(--text-secondary)] border-[var(--border-hairline)] hover:border-[var(--border-subtle)]'
                }`}
              >
                &minus; Deduct / Missing Funds
              </button>
            </div>
          </div>

          {/* Adjustment Amount */}
          <div>
            <label
              htmlFor="adjustment-amount"
              className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
            >
              Amount to {direction === 'increase' ? 'Add' : 'Deduct'} (INR)
            </label>
            <div className="relative flex items-center border border-[var(--border-subtle)] focus-within:border-[var(--focus-ring)] rounded-lg bg-[var(--bg-canvas)] px-3 py-2">
              <span className="text-xl font-mono text-[var(--text-muted)] mr-2 select-none">
                ₹
              </span>
              <input
                id="adjustment-amount"
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
          </div>

          {/* Required Reason for Audit */}
          <div>
            <label
              htmlFor="adjustment-reason"
              className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
            >
              Reason for Adjustment <span className="text-red-500">*</span>
            </label>
            <input
              id="adjustment-reason"
              type="text"
              required
              placeholder="e.g. Wallet cash physical count discrepancy, Bank fee adjustment"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isSubmitting}
              className="w-full bg-[var(--bg-canvas)] border border-[var(--border-subtle)] focus:border-[var(--focus-ring)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-hidden"
            />
            <p className="text-[10px] text-[var(--text-muted)] mt-1">
              Required to preserve an auditable reconciliation history.
            </p>
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
              {isSubmitting ? 'Adjusting...' : 'Save Adjustment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
