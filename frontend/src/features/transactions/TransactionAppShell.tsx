'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { ArthLogo } from '@/components/brand/ArthLogo';
import { QuickAddModal } from './QuickAddModal';
import { TransactionLedger } from './TransactionLedger';
import { CategoryManager } from '@/features/categories/CategoryManager';
import { PeoplePage } from '@/features/people/PeoplePage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { InstallPromptCard } from '@/features/pwa/InstallPromptCard';
import { SheetsConnectionCard } from '@/features/sheets/SheetsConnectionCard';
import { DataExportCard } from '@/features/export/DataExportCard';
import { UsernameClaimForm } from '@/features/profile/UsernameClaimForm';
import { DeleteAccountModal } from '@/features/profile/DeleteAccountModal';
import { ChangePasswordModal } from '@/features/profile/ChangePasswordModal';
import { ConfigureStartingBalancesModal } from '@/features/dashboard/ConfigureStartingBalancesModal';
import {
  type CreateTransactionResponse,
  type CreateTransactionRequest,
  type CreateTransferRequest,
  type CreateAdjustmentRequest,
  type AccountBalancesDTO,
} from '@arth/contracts';
import {
  createTransaction,
  createBalanceTransfer,
  createBalanceAdjustment,
} from '@/lib/api-client';
import {
  getPendingMutations,
  removePendingMutation,
  getCachedBalances,
  setCachedBalances,
} from '@/lib/offline-db';
import { usePwaUpdate } from '@/features/pwa/usePwaUpdate';
import { useCriticalOperation } from '@/features/pwa/critical-operation';

interface TransactionAppShellProps {
  user: {
    id: string;
    email?: string;
    displayName?: string;
    username?: string;
    providers?: string[];
    hasPassword?: boolean;
  } | null;
}

export type AppView = 'home' | 'ledger' | 'people' | 'categories' | 'more';

export function TransactionAppShell({ user }: TransactionAppShellProps) {
  const [hasPassword, setHasPassword] = useState<boolean>(
    Boolean(user?.hasPassword ?? user?.providers?.includes('email'))
  );
  const [activeView, setActiveView] = useState<AppView>('home');
  const [isQuickAddOpen, setIsQuickAddOpen] = useState<boolean>(false);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const [categoryVersion, setCategoryVersion] = useState<number>(0);
  const [saveSuccessBanner, setSaveSuccessBanner] = useState<string | null>(null);
  const [currentUsername, setCurrentUsername] = useState<string | undefined>(user?.username);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState<boolean>(false);
  const [isStartingBalancesModalOpen, setIsStartingBalancesModalOpen] = useState<boolean>(false);
  const [shellBalances, setShellBalances] = useState<AccountBalancesDTO | null>(null);

  // Offline mutation queue sync state
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Automatic PWA update detection, background download, and safe activation
  usePwaUpdate({ checkIntervalMs: 5 * 60 * 1000 });

  // Guard critical operations: defer PWA updates while user is entering/saving transactions or syncing
  useCriticalOperation(
    isQuickAddOpen || isDeleteModalOpen || isPasswordModalOpen || isStartingBalancesModalOpen || isSyncing
  );

  // Check pending mutations in IndexedDB
  const checkPendingMutations = useCallback(() => {
    getPendingMutations()
      .then((pending) => {
        setPendingSyncCount(pending.length);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    checkPendingMutations();
  }, [refreshTrigger, checkPendingMutations]);

  // Load initial cached balances for Settings card and Dashboard instant render
  useEffect(() => {
    if (!user) return;
    getCachedBalances()
      .then((b) => {
        if (b) setShellBalances(b);
      })
      .catch(() => {});
  }, [user]);

  // Synchronize pending outbox mutations with backend
  const handleSyncNow = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const pending = await getPendingMutations();
      for (const m of pending) {
        try {
          if (m.type === 'create_transaction') {
            await createTransaction(m.payload as CreateTransactionRequest);
            await removePendingMutation(m.id);
          } else if (m.type === 'create_transfer') {
            await createBalanceTransfer(m.payload as CreateTransferRequest);
            await removePendingMutation(m.id);
          } else if (m.type === 'create_adjustment') {
            await createBalanceAdjustment(m.payload as CreateAdjustmentRequest);
            await removePendingMutation(m.id);
          }
        } catch (itemErr) {
          console.error('[Sync] Failed to process mutation:', m.id, itemErr);
        }
      }
      await checkPendingMutations();
      setRefreshTrigger((prev) => prev + 1);
    } catch (err) {
      console.error('[Sync] Error during background synchronization:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Auto-sync when coming back online
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      handleSyncNow();
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  const handleTransactionCreated = (res: CreateTransactionResponse) => {
    setRefreshTrigger((prev) => prev + 1);
    checkPendingMutations();
    const txn = res.transaction;
    const msg = res.idempotent_replay
      ? `Transaction ${txn.formatted_inr} confirmed (idempotent replay)`
      : `Successfully recorded ${txn.type === 'expense' ? 'expense' : 'income'} of ${txn.formatted_inr}`;

    setSaveSuccessBanner(msg);
    setTimeout(() => {
      setSaveSuccessBanner(null);
    }, 4000);
  };

  const handleCategoryChanged = () => {
    setCategoryVersion((prev) => prev + 1);
  };

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] transition-colors pb-[max(6rem,calc(5rem+env(safe-area-inset-bottom)))] md:pb-12">
      {/* Top Application Header */}
      <header className="sticky top-0 z-30 bg-[var(--bg-canvas)]/90 backdrop-blur-xs border-b border-[var(--border-hairline)] px-4 sm:px-6 lg:px-8 py-3 sm:py-3.5">
        <div className="max-w-7xl 2xl:max-w-[1440px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <Link href="/" className="flex items-center gap-2 sm:gap-2.5 group shrink-0">
              <ArthLogo
                variant="full"
                className="h-6 sm:h-7 w-auto max-w-[110px] sm:max-w-[130px] text-[var(--text-primary)] group-hover:opacity-90 transition-opacity shrink-0"
              />
              <span className="text-[10px] sm:text-[11px] uppercase tracking-wider font-semibold px-1.5 sm:px-2 py-0.5 rounded-xs bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] border border-[var(--border-subtle)] shrink-0 select-none">
                Ledger
              </span>
            </Link>

            {/* Desktop Navigation Switcher */}
            {user && (
              <div className="hidden sm:flex items-center gap-1.5 bg-[var(--bg-surface-subtle)] p-1 rounded-md border border-[var(--border-hairline)] ml-2 lg:ml-4">
                <button
                  type="button"
                  onClick={() => setActiveView('home')}
                  className={`px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-xs transition-colors cursor-pointer ${
                    activeView === 'home'
                      ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  Dashboard
                </button>
                <button
                  type="button"
                  onClick={() => setActiveView('ledger')}
                  className={`px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-xs transition-colors cursor-pointer ${
                    activeView === 'ledger'
                      ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  Ledger
                </button>
                <button
                  type="button"
                  onClick={() => setActiveView('people')}
                  className={`px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-xs transition-colors cursor-pointer ${
                    activeView === 'people'
                      ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  People
                </button>
                <button
                  type="button"
                  onClick={() => setActiveView('categories')}
                  className={`px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-xs transition-colors cursor-pointer ${
                    activeView === 'categories'
                      ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  Categories
                </button>
                <button
                  type="button"
                  onClick={() => setActiveView('more')}
                  className={`px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-xs transition-colors cursor-pointer ${
                    activeView === 'more'
                      ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  Settings
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <div className="hidden sm:flex items-center gap-3">
                <span className="text-xs sm:text-sm font-mono text-[var(--text-secondary)] truncate max-w-[160px] lg:max-w-[220px]">
                  {currentUsername ? `@${currentUsername}` : user.displayName || user.email}
                </span>
                <form action="/auth/logout" method="POST">
                  <button
                    type="submit"
                    className="px-3 py-1.5 text-xs sm:text-sm font-medium border border-[var(--border-subtle)] bg-[var(--bg-surface)] rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                  >
                    Sign Out
                  </button>
                </form>
              </div>
            ) : (
              <Link
                href="/login"
                className="px-3.5 py-1.5 text-xs sm:text-sm font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-md hover:bg-[var(--action-primary-hover)] transition-colors"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl 2xl:max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Offline Pending Synchronization Banner */}
        {pendingSyncCount > 0 && (
          <div className="mb-4 p-3 text-xs bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-200 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span>
                {pendingSyncCount} {pendingSyncCount === 1 ? 'change' : 'changes'} saved locally (pending sync)
              </span>
            </div>
            <button
              type="button"
              onClick={handleSyncNow}
              disabled={isSyncing}
              className="px-2.5 py-1 text-xs font-semibold bg-amber-700 text-white rounded-md hover:bg-amber-800 transition-colors disabled:opacity-60 cursor-pointer"
            >
              {isSyncing ? 'Syncing...' : 'Sync now'}
            </button>
          </div>
        )}

        {/* Success Confirmation Banner */}
        {saveSuccessBanner && (
          <div className="mb-4 p-3 text-xs bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-200 rounded-lg flex items-center justify-between transition-all">
            <span>✓ {saveSuccessBanner}</span>
            <button
              onClick={() => setSaveSuccessBanner(null)}
              className="text-emerald-600 dark:text-emerald-400 font-bold ml-2 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Subtle prompt for accounts without a username */}
        {user && !currentUsername && (
          <div className="mb-4 p-3 text-xs bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] text-[var(--text-secondary)] rounded-md flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span>💡</span>
              <span>
                You haven&apos;t set a username yet. Choose one to enable sign-in with your username.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setActiveView('more')}
              className="text-xs font-medium text-[var(--text-primary)] underline underline-offset-2 hover:opacity-80 transition-opacity cursor-pointer shrink-0"
            >
              Choose username &rarr;
            </button>
          </div>
        )}

        {user ? (
          <>
            {/* Persistent Tab Container: All views stay mounted in the DOM to eliminate reload delay */}
            <div className={activeView === 'home' ? 'block' : 'hidden'}>
              <DashboardPage
                onOpenQuickAdd={() => setIsQuickAddOpen(true)}
                onNavigateToLedger={() => setActiveView('ledger')}
                refreshTrigger={refreshTrigger}
                initialBalances={shellBalances}
                onBalancesLoaded={(b) => setShellBalances(b)}
              />
            </div>

            <div className={activeView === 'ledger' ? 'block' : 'hidden'}>
              <TransactionLedger
                userProfile={{
                  displayName: user?.displayName,
                  username: currentUsername || user?.username,
                  email: user?.email,
                }}
                hasPassword={hasPassword}
                onOpenQuickAdd={() => setIsQuickAddOpen(true)}
                refreshTrigger={refreshTrigger}
                onTransactionMutated={() => setRefreshTrigger((prev) => prev + 1)}
              />
            </div>

            <div className={activeView === 'people' ? 'block' : 'hidden'}>
              <PeoplePage
                onRefreshShell={() => setRefreshTrigger((prev) => prev + 1)}
              />
            </div>

            <div className={activeView === 'categories' ? 'block' : 'hidden'}>
              <CategoryManager onCategoryChange={handleCategoryChanged} />
            </div>

            <div className={activeView === 'more' ? 'block' : 'hidden'}>
              <div className="space-y-5">
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
                    More & Settings
                  </h1>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    Application settings, category customization, and account details
                  </p>
                </div>

                {/* Account Balances Card in Settings */}
                <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl p-4 sm:p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">💰</span>
                      <div>
                        <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                          Account Starting Balances
                        </h3>
                        <p className="text-[11px] text-[var(--text-muted)]">
                          Initial cash and bank balances when you began using Arth
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsStartingBalancesModalOpen(true)}
                      className="px-3 py-1.5 text-xs font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-md hover:bg-[var(--action-primary-hover)] transition-colors shadow-2xs cursor-pointer"
                    >
                      {shellBalances?.balances_configured ? 'Edit Balances' : 'Set Up Balances'}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 text-xs font-mono border-t border-[var(--border-hairline)]">
                    <div className="p-2.5 bg-[var(--bg-canvas)] rounded-md border border-[var(--border-hairline)]">
                      <span className="text-[10px] text-[var(--text-muted)] block">Starting Cash</span>
                      <span className="text-sm font-semibold text-[var(--text-primary)]">
                        {shellBalances?.formatted_starting_cash || '₹0.00'}
                      </span>
                    </div>
                    <div className="p-2.5 bg-[var(--bg-canvas)] rounded-md border border-[var(--border-hairline)]">
                      <span className="text-[10px] text-[var(--text-muted)] block">Starting Online</span>
                      <span className="text-sm font-semibold text-[var(--text-primary)]">
                        {shellBalances?.formatted_starting_online || '₹0.00'}
                      </span>
                    </div>
                  </div>
                </div>

                <InstallPromptCard />

                <SheetsConnectionCard />

                {user && <DataExportCard user={user} />}

                <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl divide-y divide-[var(--border-hairline)] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setActiveView('categories')}
                    className="w-full p-4 text-left flex items-center justify-between hover:bg-[var(--bg-surface-subtle)] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg">🏷️</span>
                      <div>
                        <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                          Category Management
                        </h3>
                        <p className="text-[11px] text-[var(--text-muted)]">
                          Add, rename, reorder, or archive income and expense categories
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-[var(--text-muted)]">&rarr;</span>
                  </button>

                  <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">🌓</span>
                      <div>
                        <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                          Appearance & Theme
                        </h3>
                        <p className="text-[11px] text-[var(--text-muted)]">
                          Switch between archival Light and obsidian Dark themes
                        </p>
                      </div>
                    </div>
                    <ThemeToggle />
                  </div>

                  {/* Security: Password Management */}
                  <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">🔐</span>
                      <div>
                        <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                          Security &amp; Password
                        </h3>
                        <p className="text-[11px] text-[var(--text-muted)]">
                          {hasPassword
                            ? 'Update your account password or credentials'
                            : 'Set a password to enable email & username sign-in'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsPasswordModalOpen(true)}
                      className="px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] bg-[var(--bg-surface-subtle)] hover:bg-[var(--bg-surface-active)] border border-[var(--border-hairline)] rounded-md transition-colors cursor-pointer shrink-0"
                    >
                      {hasPassword ? 'Change Password' : 'Set Password'}
                    </button>
                  </div>

                  <div className="p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">👤</span>
                      <div className="min-w-0">
                        <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                          Account Profile
                        </h3>
                        <p className="text-[11px] text-[var(--text-muted)] font-mono truncate break-all">
                          {user.displayName
                            ? `${user.displayName} (${user.email})`
                            : user.email}
                        </p>
                      </div>
                    </div>

                    {/* Username Management */}
                    <div className="pt-2 border-t border-[var(--border-hairline)]">
                      <UsernameClaimForm
                        currentUsername={currentUsername}
                        onUsernameSet={(newUsername) => setCurrentUsername(newUsername)}
                      />
                    </div>

                    <div className="text-[10px] text-[var(--text-muted)] font-mono pt-1">
                      Currency: INR (₹) • System: Ledger Minimal
                    </div>
                  </div>
                </div>

                {/* Danger Zone: Delete Account */}
                <div className="bg-[var(--bg-surface)] border border-rose-200 dark:border-rose-900/40 rounded-xl p-5 space-y-3">
                  <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400">
                    <span className="text-base">⚠</span>
                    <h3 className="text-xs font-bold tracking-tight uppercase">Danger Zone</h3>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
                    <div>
                      <h4 className="text-xs font-semibold text-[var(--text-primary)]">
                        Delete Account &amp; Financial Records
                      </h4>
                      <p className="text-[11px] text-[var(--text-muted)] max-w-lg mt-0.5">
                        Permanently purge your account, transaction ledger, category taxonomy, and people debt/loan tracker. This operation cannot be reversed.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsDeleteModalOpen(true)}
                      className="px-3.5 py-2 text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-800 rounded-md transition-colors cursor-pointer shrink-0"
                    >
                      Delete Account...
                    </button>
                  </div>
                </div>

                <form action="/auth/logout" method="POST">
                  <button
                    type="submit"
                    className="w-full py-2.5 text-xs font-medium border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-subtle)] rounded-lg transition-colors cursor-pointer"
                  >
                    Sign Out of Arth
                  </button>
                </form>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-16 px-4 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl space-y-4">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              Welcome to Arth Personal Finance
            </h2>
            <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
              Please sign in to access your personal ledger, record income and expenses, and track people obligations.
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
      {/* 5 destinations: Home | Ledger | Add (+) | People | More */}
      {user && (
        <nav
          aria-label="Mobile Navigation"
          className="md:hidden fixed inset-x-0 bottom-0 z-40 bg-[var(--bg-surface)]/95 backdrop-blur-md border-t border-[var(--border-hairline)] px-2 pt-1 pb-[max(0.6rem,env(safe-area-inset-bottom))] flex items-center justify-around"
        >
          {/* 1. Home */}
          <button
            type="button"
            onClick={() => setActiveView('home')}
            className={`flex flex-col items-center justify-center min-h-[44px] gap-0.5 text-[10px] font-medium transition-colors flex-1 max-w-[64px] cursor-pointer ${
              activeView === 'home'
                ? 'text-[var(--text-primary)] font-bold'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <span className="text-base leading-none" aria-hidden="true">🏠</span>
            <span className="truncate">Home</span>
          </button>

          {/* 2. Ledger */}
          <button
            type="button"
            onClick={() => setActiveView('ledger')}
            className={`flex flex-col items-center justify-center min-h-[44px] gap-0.5 text-[10px] font-medium transition-colors flex-1 max-w-[64px] cursor-pointer ${
              activeView === 'ledger'
                ? 'text-[var(--text-primary)] font-bold'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <span className="text-base leading-none" aria-hidden="true">📊</span>
            <span className="truncate">Ledger</span>
          </button>

          {/* 3. Central Floating Quick Add Action (+) */}
          <div className="flex items-center justify-center flex-1 max-w-[56px] -mt-5">
            <button
              type="button"
              onClick={() => setIsQuickAddOpen(true)}
              aria-label="Add transaction"
              className="flex items-center justify-center w-12 h-12 rounded-full bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] shadow-md hover:scale-105 active:scale-95 transition-transform cursor-pointer border-2 border-[var(--bg-surface)]"
            >
              <span className="text-2xl font-light leading-none mb-0.5" aria-hidden="true">+</span>
            </button>
          </div>

          {/* 4. People */}
          <button
            type="button"
            onClick={() => setActiveView('people')}
            className={`flex flex-col items-center justify-center min-h-[44px] gap-0.5 text-[10px] font-medium transition-colors flex-1 max-w-[64px] cursor-pointer ${
              activeView === 'people'
                ? 'text-[var(--text-primary)] font-bold'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <span className="text-base leading-none" aria-hidden="true">👥</span>
            <span className="truncate">People</span>
          </button>

          {/* 5. More */}
          <button
            type="button"
            onClick={() => setActiveView('more')}
            className={`flex flex-col items-center justify-center min-h-[44px] gap-0.5 text-[10px] font-medium transition-colors flex-1 max-w-[64px] cursor-pointer ${
              activeView === 'more' || activeView === 'categories'
                ? 'text-[var(--text-primary)] font-bold'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <span className="text-base leading-none" aria-hidden="true">☰</span>
            <span className="truncate">More</span>
          </button>
        </nav>
      )}

      {/* Quick Add Modal / Sheet */}
      {isQuickAddOpen && (
        <QuickAddModal
          isOpen={true}
          onClose={() => setIsQuickAddOpen(false)}
          onSuccess={handleTransactionCreated}
          categoryVersion={categoryVersion}
        />
      )}

      {/* Change / Set Password Modal */}
      {user && (
        <ChangePasswordModal
          isOpen={isPasswordModalOpen}
          onClose={() => setIsPasswordModalOpen(false)}
          userEmail={user.email}
          hasPassword={hasPassword}
          onSuccess={(msg) => {
            setHasPassword(true);
            setSaveSuccessBanner(msg);
          }}
        />
      )}

      {/* Delete Account Confirmation Modal */}
      {isDeleteModalOpen && (
        <DeleteAccountModal
          isOpen={true}
          onClose={() => setIsDeleteModalOpen(false)}
          userEmail={user?.email}
        />
      )}

      {/* Configure Starting Balances Modal */}
      {isStartingBalancesModalOpen && (
        <ConfigureStartingBalancesModal
          isOpen={true}
          onClose={() => setIsStartingBalancesModalOpen(false)}
          onConfigured={(updated) => {
            setShellBalances(updated);
            setCachedBalances(updated);
            setRefreshTrigger((prev) => prev + 1);
          }}
          currentBalances={shellBalances}
        />
      )}

    </div>
  );
}
