'use client';

import React, { useState } from 'react';
import type { AccountBalancesDTO } from '@arth/contracts';
import { syncEngine } from '@/features/sync/sync-engine';
import { formatPaiseToINR, parseNonNegativeINRToPaise } from '@arth/contracts';

interface ConfigureStartingBalancesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigured: (balances: AccountBalancesDTO) => void;
  currentBalances?: AccountBalancesDTO | null;
  userId?: string;
}

export function ConfigureStartingBalancesModal({
  isOpen,
  onClose,
  onConfigured,
  currentBalances,
  userId,
}: ConfigureStartingBalancesModalProps) {
  const [cashStr, setCashStr] = useState<string>(() =>
    currentBalances?.starting_cash_paise
      ? (currentBalances.starting_cash_paise / 100).toFixed(2)
      : '0.00'
  );
  const [onlineStr, setOnlineStr] = useState<string>(() =>
    currentBalances?.starting_online_paise
      ? (currentBalances.starting_online_paise / 100).toFixed(2)
      : '0.00'
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  // Calculate live preview total
  let totalPaise = 0n;
  try {
    const c = parseNonNegativeINRToPaise(cashStr || '0');
    const o = parseNonNegativeINRToPaise(onlineStr || '0');
    totalPaise = c + o;
  } catch {
    // Keep totalPaise at current valid or 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    try {
      // Validate inputs
      parseNonNegativeINRToPaise(cashStr || '0');
      parseNonNegativeINRToPaise(onlineStr || '0');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Invalid amount format');
      return;
    }

    setIsSubmitting(true);
    try {
      if (!userId) throw new Error('Sign in to save starting balances on this device.');
      const updated = await syncEngine.configureStartingBalancesLocalFirst({
        starting_cash: cashStr || '0',
        starting_online: onlineStr || '0',
      }, userId);
      onConfigured(updated);
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to save starting balances'
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
      aria-labelledby="setup-balances-title"
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
              id="setup-balances-title"
              className="text-base font-semibold text-[var(--text-primary)]"
            >
              {currentBalances?.balances_configured
                ? 'Update Starting Balances'
                : 'Set Up Starting Balances'}
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Enter your initial cash on hand and online funds
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
          <div className="p-3 bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] rounded-lg text-xs text-[var(--text-secondary)] leading-relaxed">
            💡 Starting balances represent existing funds you already possess. They are not recorded as income or expenses and do not alter monthly spending statistics.
          </div>

          <div>
            <label
              htmlFor="starting-cash"
              className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
            >
              Starting Cash Balance (INR)
            </label>
            <div className="relative flex items-center border border-[var(--border-subtle)] focus-within:border-[var(--focus-ring)] rounded-lg bg-[var(--bg-canvas)] px-3 py-2">
              <span className="text-base font-mono text-[var(--text-muted)] mr-2 select-none">
                ₹
              </span>
              <input
                id="starting-cash"
                type="text"
                inputMode="decimal"
                pattern="^[0-9]*[.]?[0-9]{0,2}$"
                placeholder="0.00"
                value={cashStr}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
                    setCashStr(val);
                  }
                }}
                disabled={isSubmitting}
                className="w-full bg-transparent font-mono text-lg text-[var(--text-primary)] tracking-tight focus:outline-hidden"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="starting-online"
              className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
            >
              Starting Online Balance (INR)
            </label>
            <div className="relative flex items-center border border-[var(--border-subtle)] focus-within:border-[var(--focus-ring)] rounded-lg bg-[var(--bg-canvas)] px-3 py-2">
              <span className="text-base font-mono text-[var(--text-muted)] mr-2 select-none">
                ₹
              </span>
              <input
                id="starting-online"
                type="text"
                inputMode="decimal"
                pattern="^[0-9]*[.]?[0-9]{0,2}$"
                placeholder="0.00"
                value={onlineStr}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
                    setOnlineStr(val);
                  }
                }}
                disabled={isSubmitting}
                className="w-full bg-transparent font-mono text-lg text-[var(--text-primary)] tracking-tight focus:outline-hidden"
              />
            </div>
          </div>

          {/* Computed Starting Total */}
          <div className="flex items-center justify-between p-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)]">
            <span className="text-xs font-medium text-[var(--text-secondary)]">
              Total Starting Available
            </span>
            <span className="font-mono text-sm font-semibold text-[var(--text-primary)]">
              {formatPaiseToINR(totalPaise)}
            </span>
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
              {isSubmitting ? 'Saving...' : 'Save Starting Balances'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
