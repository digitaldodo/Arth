'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import { AppLockSettings } from '@/features/app-lock/AppLockSettings';
import { AppLockScreen } from '@/features/app-lock/AppLockScreen';
import { AutomaticDetectionSettings } from '@/features/android/AutomaticDetectionSettings';
import { useAppLock } from '@/features/app-lock/useAppLock';
import { syncEngine } from '@/features/sync/sync-engine';
import { unlockAfterVerification } from '@/features/app-lock/verification';
import { ConfigureStartingBalancesModal } from '@/features/dashboard/ConfigureStartingBalancesModal';
import {
  type CreateTransactionResponse,
  type AccountBalancesDTO,
  type NecessityClass,
} from '@arth/contracts';
import { clearCachedPwaUserContext, getCachedBalances, setCachedBalances, setCachedPwaUser } from '@/lib/offline-db';
import { useCriticalOperation } from '@/features/pwa/critical-operation';
import { useBackHandler } from '@/features/navigation';
import { useMobileStandalonePwa, useStandalonePwa } from '@/features/pwa/useStandalonePwa';
import type { PasswordStatus } from '@/lib/auth/password-status';

interface TransactionAppShellProps {
  user: {
    id: string;
    email?: string;
    displayName?: string;
    username?: string;
    providers?: string[];
    passwordStatus?: PasswordStatus;
  } | null;
}

export type AppView = 'home' | 'ledger' | 'people' | 'categories' | 'more';

export function TransactionAppShell({ user }: TransactionAppShellProps) {
  const router = useRouter();
  const userId = user?.id ?? null;
  const isPwa = useStandalonePwa();
  const isMobilePwa = useMobileStandalonePwa();
  const appLock = useAppLock(user?.id ?? 'anonymous', isMobilePwa);
  const isAppLocked = Boolean(user) && (!appLock.isReady || (isMobilePwa && appLock.isLocked));
  const [passwordStatus, setPasswordStatus] = useState<PasswordStatus>(user?.passwordStatus ?? 'unknown');
  const hasPassword = passwordStatus === 'configured';
  const [activeView, setActiveView] = useState<AppView>('home');
  const [ledgerInitialFilter, setLedgerInitialFilter] = useState<{
    categoryId?: string;
    necessity?: NecessityClass;
    startDate: string;
    endDate: string;
    label: string;
    amountPaise: number;
  } | null>(null);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState<boolean>(false);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const [categoryVersion, setCategoryVersion] = useState<number>(0);
  const [saveSuccessBanner, setSaveSuccessBanner] = useState<string | null>(null);
  const [currentUsername, setCurrentUsername] = useState<string | undefined>(user?.username);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState<boolean>(false);
  const [isStartingBalancesModalOpen, setIsStartingBalancesModalOpen] = useState<boolean>(false);
  const [shellBalances, setShellBalances] = useState<AccountBalancesDTO | null>(null);
  const [moreSubView, setMoreSubView] = useState<'hub' | 'settings' | 'appearance' | 'security'>('hub');
  const [openedCategoriesFromMore, setOpenedCategoriesFromMore] = useState<boolean>(false);

  // Priority 3: Main navigation tab back handler returns to Dashboard
  useBackHandler({
    id: 'tab-main',
    priority: 'tab',
    enabled:
      activeView !== 'home' &&
      (!openedCategoriesFromMore || activeView !== 'categories') &&
      (activeView !== 'more' || moreSubView === 'hub'),
    onBack: () => {
      setActiveView('home');
      return true;
    },
  });

  // Priority 2: Categories opened from More returns to More
  useBackHandler({
    id: 'subscreen-categories-from-more',
    priority: 'subscreen',
    enabled: activeView === 'categories' && openedCategoriesFromMore,
    onBack: () => {
      setOpenedCategoriesFromMore(false);
      setActiveView('more');
      return true;
    },
  });

  // Priority 2: Settings subview in More returns to More Hub
  useBackHandler({
    id: 'subscreen-more-settings',
    priority: 'subscreen',
    enabled: activeView === 'more' && moreSubView === 'settings',
    onBack: () => {
      setMoreSubView('hub');
      return true;
    },
  });

  // Priority 2: Appearance subview returns to Settings
  useBackHandler({
    id: 'subscreen-more-appearance',
    priority: 'subscreen',
    enabled: activeView === 'more' && moreSubView === 'appearance',
    onBack: () => {
      setMoreSubView('settings');
      return true;
    },
  });

  // Priority 2: Security subview returns to Settings
  useBackHandler({
    id: 'subscreen-more-security',
    priority: 'subscreen',
    enabled: activeView === 'more' && moreSubView === 'security',
    onBack: () => {
      setMoreSubView('settings');
      return true;
    },
  });

  // Priority 1b: Starting balances modal
  useBackHandler({
    id: 'modal-shell-starting-balances',
    priority: 'modal',
    enabled: isStartingBalancesModalOpen,
    onBack: () => {
      setIsStartingBalancesModalOpen(false);
      return true;
    },
  });

  // Priority 1b: Change password modal
  useBackHandler({
    id: 'modal-shell-password',
    priority: 'modal',
    enabled: isPasswordModalOpen,
    onBack: () => {
      setIsPasswordModalOpen(false);
      return true;
    },
  });

  // Priority 1: Delete account confirmation dialog
  useBackHandler({
    id: 'dialog-shell-delete-account',
    priority: 'dialog',
    enabled: isDeleteModalOpen,
    onBack: () => {
      setIsDeleteModalOpen(false);
      return true;
    },
  });

  // Offline mutation queue sync state
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const lastSyncedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!user) return;
    void setCachedPwaUser(user).then(() => {
      if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({ type: 'PWA_PREPARED' });
        } else {
          navigator.serviceWorker.ready.then((reg) => {
            reg.active?.postMessage({ type: 'PWA_PREPARED' });
          }).catch(() => {});
        }
      }
    }).catch(() => {});
  }, [user, pendingSyncCount, isSyncing]);

  const handleSignOut = async (event: React.FormEvent<HTMLFormElement>) => {
    if (!isPwa) return;
    event.preventDefault();
    const form = event.currentTarget;
    await clearCachedPwaUserContext();
    navigator.serviceWorker?.controller?.postMessage({ type: 'PWA_SIGNED_OUT' });
    form.submit();
  };

  // Guard critical operations: defer PWA updates while user is entering/saving transactions or syncing
  useCriticalOperation(
    isQuickAddOpen || isDeleteModalOpen || isPasswordModalOpen || isStartingBalancesModalOpen || isSyncing
  );

  // The sync engine is the only queue runner; keep shell status scoped to this account.
  // Load initial cached balances for Settings card and Dashboard instant render
  useEffect(() => {
    if (!user) return;
    getCachedBalances(user.id)
      .then((b) => {
        if (b) setShellBalances(b);
      })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    syncEngine.setUserId(userId);
    const unsubscribe = syncEngine.subscribe((state) => {
      setPendingSyncCount(state.pendingCount);
      setIsSyncing(state.isSyncing);
      if (state.lastSyncedAt && state.lastSyncedAt !== lastSyncedAtRef.current) {
        lastSyncedAtRef.current = state.lastSyncedAt;
        setRefreshTrigger((value) => value + 1);
      }
    });
    if (userId) void syncEngine.processQueue(userId);
    return unsubscribe;
  }, [userId]);

  const handleTransactionCreated = (res: CreateTransactionResponse) => {
    setRefreshTrigger((prev) => prev + 1);
    const txn = res.transaction;
    const isOffline =
      (typeof navigator !== 'undefined' && !navigator.onLine) ||
      ('sync_status' in txn && txn.sync_status === 'pending');
    const msg = isOffline
      ? "Saved on this device. Will sync when you're online."
      : 'Transaction saved successfully.';

    setSaveSuccessBanner(msg);
    setTimeout(() => {
      setSaveSuccessBanner(null);
    }, 3500);
  };

  const handleCategoryChanged = () => {
    setCategoryVersion((prev) => prev + 1);
  };

  const handleLockRecovery = async () => {
    const response = await fetch('/api/app-lock/recover', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const result = await response.json().catch(() => ({})) as { error?: string; signedOut?: boolean };
    if (!response.ok || result.signedOut !== true) {
      throw new Error(result.error || 'Sign out could not be completed. Arth remains locked.');
    }
    appLock.resetAppLock();
    router.replace('/login');
  };

  return (
    <>
    <div hidden={isAppLocked} aria-hidden={isAppLocked} inert={isAppLocked} className="min-h-screen">
    <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] transition-colors pb-[max(6rem,calc(5rem+env(safe-area-inset-bottom)))] md:pb-12">
      {/* Top Application Header */}
      <header className="sticky top-0 z-30 bg-[var(--bg-canvas)]/90 backdrop-blur-xs border-b border-[var(--border-hairline)] px-4 sm:px-6 lg:px-8 py-3 sm:py-3.5">
        <div className="max-w-7xl 2xl:max-w-[1440px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <Link href="/" onClick={() => setActiveView('home')} aria-label="Go to dashboard" className="flex items-center gap-2 sm:gap-2.5 group shrink-0">
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
                <form action="/auth/logout" method="POST" onSubmit={handleSignOut}>
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
        {/* Success / Save Confirmation Toast */}
        {saveSuccessBanner && (
          <div
            role="status"
            aria-live="polite"
            className="fixed bottom-20 md:bottom-8 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-lg bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] shadow-xl text-xs font-medium flex items-center gap-2 transition-all"
          >
            <span className="text-emerald-500 font-bold">✓</span>
            <span>{saveSuccessBanner}</span>
            <button
              type="button"
              onClick={() => setSaveSuccessBanner(null)}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] font-bold ml-2 cursor-pointer"
              aria-label="Dismiss notification"
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
                userId={user.id}
                onOpenQuickAdd={() => setIsQuickAddOpen(true)}
                onNavigateToLedger={() => setActiveView('ledger')}
                onOpenFilteredLedger={(filter) => {
                  setLedgerInitialFilter(filter);
                  setActiveView('ledger');
                }}
                refreshTrigger={refreshTrigger}
                initialBalances={shellBalances}
                onBalancesLoaded={(b) => setShellBalances(b)}
              />
            </div>

            <div className={activeView === 'ledger' ? 'block' : 'hidden'}>
              <TransactionLedger
                key={ledgerInitialFilter ? `${ledgerInitialFilter.categoryId || ''}:${ledgerInitialFilter.necessity || ''}:${ledgerInitialFilter.startDate}:${ledgerInitialFilter.endDate}` : 'all'}
                initialFilter={ledgerInitialFilter}
                userId={user?.id}
                userProfile={{
                  displayName: user?.displayName,
                  username: currentUsername || user?.username,
                  email: user?.email,
                }}
                hasPassword={hasPassword}
                onAccountPasswordVerified={() => setPasswordStatus('configured')}
                onOpenQuickAdd={() => setIsQuickAddOpen(true)}
                refreshTrigger={refreshTrigger}
                onTransactionMutated={() => setRefreshTrigger((prev) => prev + 1)}
              />
            </div>

            <div className={activeView === 'people' ? 'block' : 'hidden'}>
              <PeoplePage
                userId={user.id}
                onRefreshShell={() => setRefreshTrigger((prev) => prev + 1)}
              />
            </div>

            <div className={activeView === 'categories' ? 'block' : 'hidden'}>
              <CategoryManager userId={user.id} onCategoryChange={handleCategoryChanged} />
            </div>

                        <div className={activeView === 'more' ? 'block' : 'hidden'}>
              <div className="space-y-5">
                {/* 1. APPEARANCE SUBVIEW */}
                {moreSubView === 'appearance' && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setMoreSubView('settings')}
                        className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1 cursor-pointer"
                      >
                        &larr; Back to Settings
                      </button>
                    </div>
                    <div>
                      <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
                        Appearance & Theme
                      </h1>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                        Configure application theme and visual appearance
                      </p>
                    </div>
                    <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl p-5 space-y-4">
                      <div>
                        <h3 className="text-xs font-semibold text-[var(--text-primary)] mb-1">
                          Theme Preference
                        </h3>
                        <p className="text-[11px] text-[var(--text-muted)] mb-3">
                          Switch between Archival Light and Obsidian Dark modes.
                        </p>
                        <ThemeToggle className="sm:w-64" />
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. SECURITY SUBVIEW */}
                {moreSubView === 'security' && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setMoreSubView('settings')}
                        className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1 cursor-pointer"
                      >
                        &larr; Back to Settings
                      </button>
                    </div>
                    <div>
                      <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
                        Security &amp; Password
                      </h1>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                        Account credentials, application lock, and access recovery
                      </p>
                    </div>
                    <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl divide-y divide-[var(--border-hairline)] overflow-hidden">
                      <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="text-lg">🔐</span>
                          <div>
                            <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                              Password Credentials
                            </h3>
                            <p className="text-[11px] text-[var(--text-muted)]">
                              {passwordStatus === 'configured'
                                ? 'Update your account password or credentials'
                                : passwordStatus === 'not_configured'
                                  ? 'Set a password to enable email & username sign-in'
                                  : 'Check or update your account password settings'}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsPasswordModalOpen(true)}
                          className="px-3.5 py-2 text-xs font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-md hover:bg-[var(--action-primary-hover)] transition-colors cursor-pointer shrink-0"
                        >
                          {passwordStatus === 'configured'
                            ? 'Change Password'
                            : passwordStatus === 'not_configured'
                              ? 'Set Password'
                              : 'Password Settings'}
                        </button>
                      </div>
                      {isMobilePwa && <AppLockSettings appLock={appLock} />}
                    </div>
                  </div>
                )}

                {/* 3. SETTINGS SUBVIEW */}
                {moreSubView === 'settings' && (
                  <div className="space-y-5">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setMoreSubView('hub')}
                        className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1 cursor-pointer"
                      >
                        &larr; Back to More
                      </button>
                    </div>
                    <div>
                      <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
                        Settings
                      </h1>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                        Preferences, visual appearance, credentials, and starting balances
                      </p>
                    </div>

                    {/* Account Balances Card */}
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

                    <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl divide-y divide-[var(--border-hairline)] overflow-hidden">
                      {/* Appearance Drilldown */}
                      <button
                        type="button"
                        onClick={() => setMoreSubView('appearance')}
                        className="w-full p-4 text-left flex items-center justify-between hover:bg-[var(--bg-surface-subtle)] transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-lg">🌓</span>
                          <div>
                            <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                              Appearance & Theme
                            </h3>
                            <p className="text-[11px] text-[var(--text-muted)]">
                              Archival Light and obsidian Dark theme settings
                            </p>
                          </div>
                        </div>
                        <span className="text-xs text-[var(--text-muted)] font-bold">&rarr;</span>
                      </button>

                      {/* Security Drilldown */}
                      <button
                        type="button"
                        onClick={() => setMoreSubView('security')}
                        className="w-full p-4 text-left flex items-center justify-between hover:bg-[var(--bg-surface-subtle)] transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-lg">🔐</span>
                          <div>
                            <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                              Security &amp; Password
                            </h3>
                            <p className="text-[11px] text-[var(--text-muted)]">
                              {passwordStatus === 'configured'
                                ? 'Password configured • Update credentials'
                                : 'Set password to enable email & username sign-in'}
                            </p>
                          </div>
                        </div>
                        <span className="text-xs text-[var(--text-muted)] font-bold">&rarr;</span>
                      </button>

                      {/* Profile Section */}
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

                        <div className="pt-2 border-t border-[var(--border-hairline)]">
                          <UsernameClaimForm
                            currentUsername={currentUsername}
                            onUsernameSet={(newUsername) => setCurrentUsername(newUsername)}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Danger Zone */}
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
                  </div>
                )}

                {/* 4. MORE HUB (PRIMARY HUB) */}
                {moreSubView === 'hub' && (
                  <div className="space-y-5">
                    <div>
                      <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
                        More &amp; Settings
                      </h1>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                        Application settings, category customization, and account details
                      </p>
                    </div>

                    <div className="grid gap-3">
                      {/* Settings Navigation Card */}
                      <button
                        type="button"
                        onClick={() => setMoreSubView('settings')}
                        className="w-full p-4 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl flex items-center justify-between hover:bg-[var(--bg-surface-subtle)] transition-colors cursor-pointer text-left shadow-2xs"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xl">⚙️</span>
                          <div>
                            <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                              Settings
                            </h3>
                            <p className="text-[11px] text-[var(--text-muted)]">
                              Appearance, Security &amp; Password, Starting Balances, Profile
                            </p>
                          </div>
                        </div>
                        <span className="text-xs text-[var(--text-muted)] font-bold">&rarr;</span>
                      </button>

                      {/* Category Customization Card */}
                      <button
                        type="button"
                        onClick={() => {
                          setOpenedCategoriesFromMore(true);
                          setActiveView('categories');
                        }}
                        className="w-full p-4 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl flex items-center justify-between hover:bg-[var(--bg-surface-subtle)] transition-colors cursor-pointer text-left shadow-2xs"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xl">🏷️</span>
                          <div>
                            <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                              Category Customization
                            </h3>
                            <p className="text-[11px] text-[var(--text-muted)]">
                              Add, rename, reorder, or archive income and expense categories
                            </p>
                          </div>
                        </div>
                        <span className="text-xs text-[var(--text-muted)] font-bold">&rarr;</span>
                      </button>
                    </div>

                    {/* Integrated Theme Toggle shortcut */}
                    <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
                      <ThemeToggle className="sm:w-64" />
                    </div>

                    <InstallPromptCard userId={user?.id} />

                    <AutomaticDetectionSettings />

                    <SheetsConnectionCard />

                    {user && <DataExportCard user={user} />}

                    <form action="/auth/logout" method="POST" onSubmit={handleSignOut}>
                      <button
                        type="submit"
                        className="w-full py-2.5 text-xs font-medium border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-subtle)] rounded-lg transition-colors cursor-pointer"
                      >
                        Sign Out of Arth
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </div>          </>
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
          userId={user?.id}
        />
      )}

      {/* Change / Set Password Modal */}
      {user && (
        <ChangePasswordModal
          isOpen={isPasswordModalOpen}
          onClose={() => setIsPasswordModalOpen(false)}
          userEmail={user.email}
          hasPassword={hasPassword}
          passwordStatus={passwordStatus}
          onSuccess={(msg) => {
            setPasswordStatus('configured');
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
            if (user?.id) void setCachedBalances(updated, user.id);
            setRefreshTrigger((prev) => prev + 1);
          }}
          currentBalances={shellBalances}
          userId={user?.id}
        />
      )}

    </div>
    </div>
    {isAppLocked && user && isMobilePwa && (
      <AppLockScreen
        isInitializing={!appLock.isReady}
        supportsPlatformAuth={appLock.supportsPlatformAuth}
        onUnlock={async () => {
          await unlockAfterVerification(appLock.verifyDevice, appLock.unlockAfterVerification);
        }}
        onResetViaAccount={handleLockRecovery}
      />
    )}
    </>
  );
}
