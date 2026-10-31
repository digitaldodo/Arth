'use client';

import React, { useState, useEffect } from 'react';
import type { AccountBalancesDTO, ConfigureStartingBalancesRequest } from '@arth/contracts';
import { syncEngine } from '@/features/sync/sync-engine';
import {
  configureStartingBalances as apiConfigureStartingBalances,
  fetchBalances,
  fetchCurrentUser,
} from '@/lib/api-client';
import { setCachedBalances } from '@/lib/offline-db';
import { formatPaiseToINR, parseNonNegativeINRToPaise } from '@arth/contracts';

export interface ConfigureStartingBalancesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigured: (balances: AccountBalancesDTO) => void;
  currentBalances?: AccountBalancesDTO | null;
  userId?: string;
  isLoadingBalances?: boolean;
}

export function ConfigureStartingBalancesModal({
  isOpen,
  onClose,
  onConfigured,
  currentBalances,
  userId,
  isLoadingBalances = false,
}: ConfigureStartingBalancesModalProps) {
  const [fetchedUserId, setFetchedUserId] = useState<string | null>(null);
  const [isResolvingAuth, setIsResolvingAuth] = useState<boolean>(!userId);
  const [authExpired, setAuthExpired] = useState<boolean>(false);

  const effectiveUserId = userId || fetchedUserId;
  const [loadedBalances, setLoadedBalances] = useState<AccountBalancesDTO | null>(null);

  const activeBalances = currentBalances ?? loadedBalances;
  const isBalancesLoading = Boolean(
    isLoadingBalances || (isOpen && currentBalances === undefined && !loadedBalances && effectiveUserId)
  );

  const [cashStr, setCashStr] = useState<string>(() => {
    if (currentBalances?.balances_configured) {
      return currentBalances.starting_cash_paise
        ? (currentBalances.starting_cash_paise / 100).toFixed(2)
        : '0.00';
    }
    return '0.00';
  });
  const [onlineStr, setOnlineStr] = useState<string>(() => {
    if (currentBalances?.balances_configured) {
      return currentBalances.starting_online_paise
        ? (currentBalances.starting_online_paise / 100).toFixed(2)
        : '0.00';
    }
    return '0.00';
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Synchronize input fields when modal opens or active balances change:
  // For unconfigured users: exactly 0.00 cash, 0.00 online (Total 0.00)
  // For configured users: populate with their actual saved starting values
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      setErrorMsg(null);
      if (activeBalances?.balances_configured) {
        setCashStr(
          activeBalances.starting_cash_paise
            ? (activeBalances.starting_cash_paise / 100).toFixed(2)
            : '0.00'
        );
        setOnlineStr(
          activeBalances.starting_online_paise
            ? (activeBalances.starting_online_paise / 100).toFixed(2)
            : '0.00'
        );
      } else {
        setCashStr('0.00');
        setOnlineStr('0.00');
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [isOpen, activeBalances]);

  // 1. Authoritative Session Resolution:
  // If userId prop was provided, use it directly. Otherwise, verify active session with the backend.
  useEffect(() => {
    if (userId || !isOpen) return;

    let isMounted = true;
    fetchCurrentUser()
      .then((user) => {
        if (!isMounted) return;
        if (user?.userId) {
          setFetchedUserId(user.userId);
          setAuthExpired(false);
        } else {
          setFetchedUserId(null);
          setAuthExpired(true);
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setFetchedUserId(null);
        setAuthExpired(true);
      })
      .finally(() => {
        if (isMounted) setIsResolvingAuth(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, userId]);

  // 2. Fallback fetch balances if caller did not supply currentBalances and effectiveUserId is present
  useEffect(() => {
    if (isOpen && currentBalances === undefined && effectiveUserId && !loadedBalances) {
      let isMounted = true;
      fetchBalances()
        .then((b) => {
          if (isMounted && b) setLoadedBalances(b);
        })
        .catch(() => {});
      return () => {
        isMounted = false;
      };
    }
  }, [isOpen, currentBalances, effectiveUserId, loadedBalances]);

  if (!isOpen) return null;

  // Calculate live preview total
  let totalPaise = 0n;
  try {
    const c = parseNonNegativeINRToPaise(cashStr || '0');
    const o = parseNonNegativeINRToPaise(onlineStr || '0');
    totalPaise = c + o;
  } catch {
    totalPaise = 0n;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    try {
      parseNonNegativeINRToPaise(cashStr || '0');
      parseNonNegativeINRToPaise(onlineStr || '0');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Invalid amount format');
      return;
    }

    if (!effectiveUserId) {
      setAuthExpired(true);
      setErrorMsg('Active session required. Please sign in to save starting balances.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: ConfigureStartingBalancesRequest = {
        starting_cash: cashStr || '0',
        starting_online: onlineStr || '0',
      };

      let updated: AccountBalancesDTO;
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        // Authoritative server-side save via BFF proxy -> Fastify -> PostgreSQL RPC
        updated = await apiConfigureStartingBalances(payload);
        await setCachedBalances(updated, effectiveUserId);
      } else {
        // Offline-first durable mutation for installed PWA
        updated = await syncEngine.configureStartingBalancesLocalFirst(payload, effectiveUserId);
      }

      onConfigured(updated);
      onClose();
    } catch (err: unknown) {
      const isAuthError =
        (err as { statusCode?: number })?.statusCode === 401 ||
        /session|unauthorized|expired|authentication/i.test(
          err instanceof Error ? err.message : String(err)
        );

      if (isAuthError) {
        setAuthExpired(true);
        setErrorMsg('Your session has expired. Please sign in again.');
      } else {
        setErrorMsg(
          err instanceof Error ? err.message : 'Failed to save starting balances'
        );
      }
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
              {activeBalances?.balances_configured
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

        {/* Distinct UI States */}
        {isResolvingAuth ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-xs text-[var(--text-secondary)]">
            <span className="w-5 h-5 rounded-full border-2 border-[var(--border-subtle)] border-t-[var(--action-primary-bg)] animate-spin" />
            <span>Checking authentication…</span>
          </div>
        ) : authExpired || !effectiveUserId ? (
          <div className="py-6 space-y-4">
            <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-200 rounded-lg text-xs leading-relaxed">
              <span className="font-semibold block mb-1">Authentication Required</span>
              Your session has expired or you are not signed in. Please sign in to save starting balances on this account.
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="w-1/2 py-2 text-xs font-medium border border-[var(--border-subtle)] rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-surface-subtle)] transition-colors cursor-pointer"
              >
                Close
              </button>
              <a
                href="/login"
                className="w-1/2 py-2 text-xs font-semibold text-center rounded-lg bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] hover:bg-[var(--action-primary-hover)] transition-all shadow-xs"
              >
                Sign In
              </a>
            </div>
          </div>
        ) : isBalancesLoading && !activeBalances ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-xs text-[var(--text-secondary)]">
            <span className="w-5 h-5 rounded-full border-2 border-[var(--border-subtle)] border-t-[var(--action-primary-bg)] animate-spin" />
            <span>Loading saved starting balances…</span>
          </div>
        ) : (
          <>
            {errorMsg && (
              <div
                role="alert"
                className="mt-4 p-3 text-xs bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 rounded-md"
              >
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
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
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
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
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
                  {isSubmitting ? 'Saving…' : 'Save Starting Balances'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
