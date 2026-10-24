'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { QuickAddModal } from './QuickAddModal';
import { TransactionLedger } from './TransactionLedger';
import type { CreateTransactionResponse } from '@arth/contracts';

interface TransactionAppShellProps {
  user: {
    id: string;
    email?: string;
  } | null;
}

export function TransactionAppShell({ user }: TransactionAppShellProps) {
  const [isQuickAddOpen, setIsQuickAddOpen] = useState<boolean>(false);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const [saveSuccessBanner, setSaveSuccessBanner] = useState<string | null>(null);

  const handleTransactionCreated = (res: CreateTransactionResponse) => {
    setRefreshTrigger((prev) => prev + 1);
    const txn = res.transaction;
    const msg = res.idempotent_replay
      ? `Transaction ${txn.formatted_inr} confirmed (idempotent replay)`
      : `Successfully recorded ${txn.type === 'expense' ? 'expense' : 'income'} of ${txn.formatted_inr}`;

    setSaveSuccessBanner(msg);
    setTimeout(() => {
      setSaveSuccessBanner(null);
    }, 4000);
  };

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] transition-colors pb-24 md:pb-12">
      {/* Top Application Header */}
      <header className="sticky top-0 z-30 bg-[var(--bg-canvas)]/90 backdrop-blur-xs border-b border-[var(--border-hairline)] px-4 py-3">
        <div className="max-w-[760px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-lg font-bold tracking-tight text-[var(--text-primary)]">
                Arth
              </span>
              <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-xs bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                Ledger
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-2.5">
            {user ? (
              <div className="flex items-center gap-2">
                <span className="hidden sm:inline-block text-xs font-mono text-[var(--text-secondary)] truncate max-w-[150px]">
                  {user.email}
                </span>
                <form action="/auth/logout" method="POST">
                  <button
                    type="submit"
                    className="px-2.5 py-1 text-xs font-medium border border-[var(--border-subtle)] bg-[var(--bg-surface)] rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    Sign Out
                  </button>
                </form>
              </div>
            ) : (
              <Link
                href="/login"
                className="px-3 py-1 text-xs font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-md hover:bg-[var(--action-primary-hover)] transition-colors"
              >
                Sign In
              </Link>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-[760px] mx-auto px-4 py-6">
        {/* Success Confirmation Banner */}
        {saveSuccessBanner && (
          <div className="mb-4 p-3 text-xs bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-200 rounded-lg flex items-center justify-between transition-all">
            <span>✓ {saveSuccessBanner}</span>
            <button
              onClick={() => setSaveSuccessBanner(null)}
              className="text-emerald-600 dark:text-emerald-400 font-bold ml-2"
            >
              ✕
            </button>
          </div>
        )}

        {user ? (
          <TransactionLedger
            onOpenQuickAdd={() => setIsQuickAddOpen(true)}
            refreshTrigger={refreshTrigger}
          />
        ) : (
          <div className="text-center py-16 px-4 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl space-y-4">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              Welcome to Arth Personal Finance
            </h2>
            <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
              Please sign in with your Google account to access your personal ledger, record income and expenses, and track your cash flow.
            </p>
            <div>
              <Link
                href="/login"
                className="inline-block px-5 py-2.5 text-xs font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-lg hover:bg-[var(--action-primary-hover)] transition-colors shadow-xs"
              >
                Sign In to Continue &rarr;
              </Link>
            </div>
          </div>
        )}
      </main>

      {/* Mobile Fixed Bottom Navigation with Central Quick Add (+) */}
      <div className="md:hidden fixed inset-x-0 bottom-0 z-40 bg-[var(--bg-surface)]/95 backdrop-blur-md border-t border-[var(--border-hairline)] px-6 py-2 flex items-center justify-between">
        <button
          onClick={() => {}}
          className="flex flex-col items-center gap-0.5 text-[10px] font-medium text-[var(--text-primary)]"
        >
          <span className="text-base">📊</span>
          <span>Ledger</span>
        </button>

        {/* Central Floating Quick Add Action */}
        <button
          type="button"
          onClick={() => setIsQuickAddOpen(true)}
          aria-label="Add transaction"
          className="flex items-center justify-center w-12 h-12 -mt-5 rounded-full bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] shadow-lg hover:scale-105 active:scale-95 transition-transform"
        >
          <span className="text-2xl font-light leading-none">+</span>
        </button>

        <button
          onClick={() => {}}
          className="flex flex-col items-center gap-0.5 text-[10px] font-medium text-[var(--text-muted)]"
        >
          <span className="text-base">⚙️</span>
          <span>Settings</span>
        </button>
      </div>

      {/* Quick Add Modal / Sheet */}
      {isQuickAddOpen && (
        <QuickAddModal
          isOpen={true}
          onClose={() => setIsQuickAddOpen(false)}
          onSuccess={handleTransactionCreated}
        />
      )}
    </div>
  );
}
