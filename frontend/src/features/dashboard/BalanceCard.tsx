'use client';

import React, { useState } from 'react';
import type { AccountBalancesDTO } from '@arth/contracts';
import { ConfigureStartingBalancesModal } from './ConfigureStartingBalancesModal';
import { TransferModal } from './TransferModal';
import { AdjustBalanceModal } from './AdjustBalanceModal';

interface BalanceCardProps {
  balances: AccountBalancesDTO | null;
  loading?: boolean;
  onBalancesUpdated: (updated: AccountBalancesDTO) => void;
}

export function BalanceCard({
  balances,
  loading = false,
  onBalancesUpdated,
}: BalanceCardProps) {
  const [isConfigureOpen, setIsConfigureOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);

  const isConfigured = balances?.balances_configured ?? false;

  return (
    <>
      <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl p-5 sm:p-6 space-y-5 shadow-2xs">
        {/* Top Header: Total Available Balance & Action Buttons */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono uppercase tracking-wider font-semibold text-[var(--text-secondary)]">
                Total Available Balance
              </span>
              {!isConfigured && !loading && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800/60">
                  Not Configured
                </span>
              )}
            </div>
            <div className="text-2xl sm:text-3xl lg:text-4xl font-mono font-bold tracking-tight text-[var(--text-primary)]">
              {loading && !balances ? (
                <div className="h-9 w-44 bg-[var(--bg-surface-subtle)] animate-pulse rounded-md" />
              ) : (
                balances?.formatted_total_available || '₹0.00'
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setIsTransferOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] text-[var(--text-primary)] rounded-md hover:bg-[var(--bg-canvas)] transition-colors cursor-pointer"
            >
              <span>⇄</span>
              <span>Transfer</span>
            </button>
            <button
              type="button"
              onClick={() => setIsAdjustOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] text-[var(--text-primary)] rounded-md hover:bg-[var(--bg-canvas)] transition-colors cursor-pointer"
            >
              <span>⚙</span>
              <span>Adjust</span>
            </button>
            <button
              type="button"
              onClick={() => setIsConfigureOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-md hover:bg-[var(--action-primary-hover)] transition-colors shadow-2xs cursor-pointer"
            >
              {isConfigured ? 'Starting Balances' : 'Set Up Balances'}
            </button>
          </div>
        </div>

        {/* Breakdown: Cash vs Online Balances */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[var(--border-hairline)]">
          {/* Cash Balance */}
          <div className="p-3.5 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-[var(--text-secondary)]">
                  Cash Balance
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-xs bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/60 font-mono">
                  Cash
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)]">Physical wallet &amp; cash on hand</p>
            </div>
            <div className="text-lg sm:text-xl font-mono font-semibold text-[var(--text-primary)]">
              {loading && !balances ? (
                <div className="h-6 w-24 bg-[var(--bg-surface-subtle)] animate-pulse rounded-md" />
              ) : (
                balances?.formatted_current_cash || '₹0.00'
              )}
            </div>
          </div>

          {/* Online Balance */}
          <div className="p-3.5 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-[var(--text-secondary)]">
                  Online Balance
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-xs bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-900/60 font-mono">
                  Online
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)]">Bank accounts &amp; digital funds</p>
            </div>
            <div className="text-lg sm:text-xl font-mono font-semibold text-[var(--text-primary)]">
              {loading && !balances ? (
                <div className="h-6 w-24 bg-[var(--bg-surface-subtle)] animate-pulse rounded-md" />
              ) : (
                balances?.formatted_current_online || '₹0.00'
              )}
            </div>
          </div>
        </div>

        {/* Setup Prompt Banner if unconfigured */}
        {!isConfigured && !loading && (
          <div className="p-3.5 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <div className="space-y-0.5">
              <span className="font-semibold text-amber-900 dark:text-amber-200">
                Track your actual money with Starting Balances
              </span>
              <p className="text-amber-800 dark:text-amber-300/90 text-[11px]">
                Enter how much cash and bank balance you have today. Starting balances are not classified as income or expenses.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsConfigureOpen(true)}
              className="px-3 py-1.5 text-xs font-semibold bg-amber-700 text-white rounded-md hover:bg-amber-800 transition-colors shadow-2xs shrink-0 cursor-pointer"
            >
              Configure Starting Balances &rarr;
            </button>
          </div>
        )}
      </div>

      {/* Modals */}
      <ConfigureStartingBalancesModal
        isOpen={isConfigureOpen}
        onClose={() => setIsConfigureOpen(false)}
        onConfigured={onBalancesUpdated}
        currentBalances={balances}
      />

      <TransferModal
        isOpen={isTransferOpen}
        onClose={() => setIsTransferOpen(false)}
        onSuccess={onBalancesUpdated}
        currentBalances={balances}
      />

      <AdjustBalanceModal
        isOpen={isAdjustOpen}
        onClose={() => setIsAdjustOpen(false)}
        onSuccess={onBalancesUpdated}
        currentBalances={balances}
      />
    </>
  );
}
