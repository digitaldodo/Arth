'use client';

import React, { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArthLogo } from '@/components/brand/ArthLogo';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { syncEngine } from '@/features/sync/sync-engine';
import { unlockAfterVerification } from '@/features/app-lock/verification';
import { useAppLock } from '@/features/app-lock/useAppLock';
import {
  type CreateTransactionResponse,
  type AccountBalancesDTO,
  type NecessityClass,
} from '@arth/contracts';
import { getCachedBalances, setCachedBalances, setCachedPwaUser } from '@/lib/offline-db';
import { useCriticalOperation } from '@/features/pwa/critical-operation';
import { useBackHandler } from '@/features/navigation';
import { useMobileStandalonePwa } from '@/features/pwa/useStandalonePwa';
import type { PasswordStatus } from '@/lib/auth/password-status';
import { AuthProvider, useAuth } from '@/features/auth/AuthContext';
import { FeatureComingSoon } from '@/features/scaffold/FeatureComingSoon';
import { HeaderSyncIndicator } from '@/features/sync/HeaderSyncIndicator';

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

export type AppView =
  | 'home'
  | 'ledger'
  | 'people'
  | 'categories'
  | 'documents'
  | 'safe-to-spend'
  | 'emi-planner'
  | 'goal-planner'
  | 'fire-planning'
  | 'insights'
  | 'data-sync'
  | 'more';

const PLANNING_VIEWS: Array<{ id: AppView; label: string; shortDesc: string }> = [
  { id: 'safe-to-spend', label: 'Safe to Spend', shortDesc: 'Daily headroom & obligations' },
  { id: 'emi-planner', label: 'EMI Stress Test', shortDesc: 'Rate sensitivity & prepayment' },
  { id: 'goal-planner', label: 'Goal Planner', shortDesc: 'Milestone targets & savings' },
  { id: 'fire-planning', label: 'FIRE Planning', shortDesc: 'Withdrawal & corpus horizon' },
  { id: 'insights', label: 'Financial Insights', shortDesc: 'Allocation & anomaly checks' },
];

function ViewLoading({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="min-h-36 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 text-sm text-[var(--text-muted)] flex items-center gap-2.5"
    >
      <span className="w-2 h-2 rounded-full bg-[var(--border-strong)] shrink-0" aria-hidden="true" />
      <span>Opening {label}…</span>
    </div>
  );
}

const TransactionLedger = dynamic(() => import('./TransactionLedger').then((module) => module.TransactionLedger), {
  loading: () => <ViewLoading label="your ledger" />,
});
const PeoplePage = dynamic(() => import('@/features/people/PeoplePage').then((module) => module.PeoplePage), {
  loading: () => <ViewLoading label="people" />,
});
const CategoryManager = dynamic(() => import('@/features/categories/CategoryManager').then((module) => module.CategoryManager), {
  loading: () => <ViewLoading label="categories" />,
});
const DocumentsTaxCentre = dynamic(() => import('@/features/tax/DocumentsTaxCentre').then((module) => module.DocumentsTaxCentre), {
  loading: () => <ViewLoading label="documents" />,
});
const StatementImport = dynamic(() => import('@/features/imports/StatementImport').then((module) => module.StatementImport), {
  loading: () => <ViewLoading label="statement tools" />,
});
const SettingsView = dynamic(() => import('@/features/settings/SettingsView').then((module) => module.SettingsView), {
  loading: () => <ViewLoading label="settings" />,
});
const DataSyncSettings = dynamic(() => import('@/features/settings/DataSyncSettings').then((module) => module.DataSyncSettings), {
  loading: () => <ViewLoading label="data and sync" />,
});
const QuickAddModal = dynamic(() => import('./QuickAddModal').then((module) => module.QuickAddModal));
const StatementImportModal = dynamic(() => import('@/features/imports/StatementImportModal').then((module) => module.StatementImportModal));
const InstallPromptCard = dynamic(() => import('@/features/pwa/InstallPromptCard').then((module) => module.InstallPromptCard));
const DataExportCard = dynamic(() => import('@/features/export/DataExportCard').then((module) => module.DataExportCard));
const ThemeToggle = dynamic(() => import('@/components/ui/ThemeToggle').then((module) => module.ThemeToggle));
const AppLockSettings = dynamic(() => import('@/features/app-lock/AppLockSettings').then((module) => module.AppLockSettings));
const AppLockScreen = dynamic(() => import('@/features/app-lock/AppLockScreen').then((module) => module.AppLockScreen));
const ChangePasswordModal = dynamic(() => import('@/features/profile/ChangePasswordModal').then((module) => module.ChangePasswordModal));
const DeleteAccountModal = dynamic(() => import('@/features/profile/DeleteAccountModal').then((module) => module.DeleteAccountModal));
const ConfigureStartingBalancesModal = dynamic(() => import('@/features/dashboard/ConfigureStartingBalancesModal').then((module) => module.ConfigureStartingBalancesModal));

export function TransactionAppShell({ user }: TransactionAppShellProps) {
  return (
    <AuthProvider user={user}>
      <TransactionAppShellContent user={user} />
    </AuthProvider>
  );
}

function TransactionAppShellContent({ user }: TransactionAppShellProps) {
  const { signOut } = useAuth();
  const router = useRouter();
  const userId = user?.id ?? null;
  const isMobilePwa = useMobileStandalonePwa();
  const appLock = useAppLock(user?.id ?? 'anonymous', isMobilePwa);
  const isAppLocked = Boolean(user) && (!appLock.isReady || (isMobilePwa && appLock.isLocked));
  const [passwordStatus, setPasswordStatus] = useState<PasswordStatus>(user?.passwordStatus ?? 'unknown');
  const hasPassword = passwordStatus === 'configured';
  const [activeView, setActiveView] = useState<AppView>('home');
  const [visitedViews, setVisitedViews] = useState<Set<AppView>>(() => new Set(['home']));
  const navigateToView = (view: AppView) => {
    setVisitedViews((visited) => visited.has(view) ? visited : new Set(visited).add(view));
    setActiveView(view);
    setIsPlanningMenuOpen(false);
  };
  const [ledgerInitialFilter, setLedgerInitialFilter] = useState<{
    categoryId?: string;
    necessity?: NecessityClass;
    startDate: string;
    endDate: string;
    label: string;
    amountPaise: number;
  } | null>(null);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState<boolean>(false);
  const [isStatementImportOpen, setIsStatementImportOpen] = useState<boolean>(false);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const [categoryVersion, setCategoryVersion] = useState<number>(0);
  const [saveSuccessBanner, setSaveSuccessBanner] = useState<string | null>(null);
  const [currentUsername, setCurrentUsername] = useState<string | undefined>(user?.username);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState<boolean>(false);
  const [isStartingBalancesModalOpen, setIsStartingBalancesModalOpen] = useState<boolean>(false);
  const [shellBalances, setShellBalances] = useState<AccountBalancesDTO | null>(null);
  const [openedCategoriesFromMore, setOpenedCategoriesFromMore] = useState<boolean>(false);
  const [isPlanningMenuOpen, setIsPlanningMenuOpen] = useState<boolean>(false);
  const planningMenuRef = useRef<HTMLDivElement | null>(null);

  const isPlanningViewActive = ['safe-to-spend', 'emi-planner', 'goal-planner', 'fire-planning', 'insights'].includes(activeView);
  const activePlanningLabel = PLANNING_VIEWS.find((v) => v.id === activeView)?.label;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (planningMenuRef.current && !planningMenuRef.current.contains(event.target as Node)) {
        setIsPlanningMenuOpen(false);
      }
    }
    if (isPlanningMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isPlanningMenuOpen]);

  // Dismiss Planning popover on Android hardware/gesture back
  useBackHandler({
    id: 'popover-planning-menu',
    priority: 'modal',
    enabled: isPlanningMenuOpen,
    onBack: () => {
      setIsPlanningMenuOpen(false);
      return true;
    },
  });

  // Priority 3: Main navigation tab back handler returns to Dashboard
  useBackHandler({
    id: 'tab-main',
    priority: 'tab',
    enabled:
      activeView !== 'home' &&
      (!openedCategoriesFromMore || activeView !== 'categories') &&
      activeView !== 'data-sync' &&
      !isPlanningViewActive,
    onBack: () => {
      navigateToView('home');
      return true;
    },
  });

  // Priority 2: Categories opened from More returns to More
  useBackHandler({
    id: 'subscreen-categories-from-more',
    priority: 'subscreen',
    enabled: activeView === 'categories',
    onBack: () => {
      setOpenedCategoriesFromMore(false);
      navigateToView('more');
      return true;
    },
  });

  // Priority 2: Planning intelligence tools back handler returns to Dashboard
  useBackHandler({
    id: 'subscreen-planning',
    priority: 'subscreen',
    enabled: isPlanningViewActive,
    onBack: () => {
      navigateToView('home');
      return true;
    },
  });

  // Priority 2: Data & Sync subscreen back handler returns to More/Settings
  useBackHandler({
    id: 'subscreen-data-sync',
    priority: 'subscreen',
    enabled: activeView === 'data-sync',
    onBack: () => {
      navigateToView('more');
      return true;
    },
  });

  useBackHandler({
    id: 'subscreen-documents',
    priority: 'subscreen',
    enabled: activeView === 'documents',
    onBack: () => { navigateToView('home'); return true; },
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
  const lastSyncedAtRef = useRef<number | null>(syncEngine.getState().lastSyncedAt);
  const lastSyncedCountRef = useRef<number>(syncEngine.getState().syncedCount);
  const initialMountSyncHandledRef = useRef<boolean>(false);

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
  }, [user]);

  const handleSignOut = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await signOut();
  };

  // Guard critical operations: defer PWA updates while user is entering/saving transactions, importing statements, or syncing
  useCriticalOperation(
    isQuickAddOpen || isStatementImportOpen || isDeleteModalOpen || isPasswordModalOpen || isStartingBalancesModalOpen || isSyncing
  );

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
      const syncedChanged = state.syncedCount > lastSyncedCountRef.current;
      if (state.lastSyncedAt && state.lastSyncedAt !== lastSyncedAtRef.current) {
        lastSyncedAtRef.current = state.lastSyncedAt;
        // Avoid triggering a redundant Dashboard refetch on the very first background reconciliation
        // unless offline mutations were actually uploaded to the server.
        if (initialMountSyncHandledRef.current || syncedChanged) {
          setRefreshTrigger((value) => value + 1);
        }
        initialMountSyncHandledRef.current = true;
      }
      lastSyncedCountRef.current = state.syncedCount;
    });

    if (!userId) {
      return unsubscribe;
    }

    // Yield briefly so the primary Dashboard fetch starts before background snapshot sync
    const syncTimer = window.setTimeout(() => {
      void syncEngine.processQueue(userId);
    }, 150);

    return () => {
      window.clearTimeout(syncTimer);
      unsubscribe();
    };
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
      throw new Error(result.error || 'Sign out could not be completed. SpendSense remains locked.');
    }
    appLock.resetAppLock();
    router.replace('/login');
  };

  return (
    <>
    <div hidden={isAppLocked} aria-hidden={isAppLocked} inert={isAppLocked} className="min-h-screen">
    <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] transition-colors pb-[max(6rem,calc(5.25rem+env(safe-area-inset-bottom)))] lg:pb-12">
      {/* Top Application Header — Single row on Desktop (lg+), Clean Two-Row Sticky Header on Mobile/Tablet */}
      <header className="sticky top-0 z-30 glass-nav border-b border-[var(--border-hairline)]">
        {/* Row 1: Brand Identity + Desktop Navigation + Synchronization Status */}
        <div className="max-w-7xl 2xl:max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-2.5 sm:py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <Link
              href="/"
              onClick={() => navigateToView('home')}
              aria-label="Go to dashboard"
              className="flex items-center gap-2 sm:gap-2.5 group shrink-0 rounded-sm"
            >
              <ArthLogo
                variant="full"
                className="h-6 sm:h-7 w-auto max-w-[120px] sm:max-w-[130px] text-[var(--text-primary)] group-hover:opacity-90 transition-opacity shrink-0"
              />
              <span className="hidden min-[350px]:inline-flex text-[10px] sm:text-[11px] uppercase tracking-wider font-semibold px-1.5 sm:px-2 py-0.5 rounded-xs bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] border border-[var(--border-subtle)] shrink-0 select-none">
                Ledger
              </span>
            </Link>

            {/* Desktop Navigation Switcher (lg+) */}
            {user && (
              <div className="hidden lg:flex items-center gap-1.5 bg-[var(--bg-surface-subtle)] p-1 rounded-lg border border-[var(--border-hairline)] ml-2 lg:ml-4">
                <button
                  type="button"
                  onClick={() => navigateToView('home')}
                  className={`px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-md transition-colors cursor-pointer ${
                    activeView === 'home'
                      ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xs border border-[var(--border-hairline)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-transparent'
                  }`}
                >
                  Dashboard
                </button>
                <button
                  type="button"
                  onClick={() => navigateToView('ledger')}
                  className={`px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-md transition-colors cursor-pointer ${
                    activeView === 'ledger'
                      ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xs border border-[var(--border-hairline)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-transparent'
                  }`}
                >
                  Ledger
                </button>
                <button
                  type="button"
                  onClick={() => navigateToView('documents')}
                  className={`px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-md transition-colors cursor-pointer ${
                    activeView === 'documents'
                      ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xs border border-[var(--border-hairline)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-transparent'
                  }`}
                >
                  Documents &amp; Tax
                </button>

                {/* Desktop Planning Dropdown */}
                <div className="relative" ref={planningMenuRef}>
                  <button
                    type="button"
                    aria-expanded={isPlanningMenuOpen}
                    aria-haspopup="menu"
                    onClick={() => setIsPlanningMenuOpen((prev) => !prev)}
                    className={`px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                      isPlanningViewActive
                        ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xs border border-[var(--border-hairline)]'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-transparent'
                    }`}
                  >
                    <span>Planning</span>
                    <span className={`text-[10px] opacity-70 transition-transform ${isPlanningMenuOpen ? 'rotate-180' : ''}`} aria-hidden="true">▾</span>
                  </button>

                  {isPlanningMenuOpen && (
                    <div
                      role="menu"
                      aria-label="Planning tools"
                      className="hidden lg:block absolute top-full left-0 mt-1.5 w-60 py-1.5 bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] rounded-xl shadow-lg z-50"
                    >
                      {PLANNING_VIEWS.map((item) => (
                        <button
                          key={item.id}
                          role="menuitem"
                          type="button"
                          onClick={() => navigateToView(item.id)}
                          className={`w-full px-3.5 py-2 text-left text-xs flex flex-col gap-0.5 hover:bg-[var(--bg-surface-subtle)] cursor-pointer transition-colors ${
                            activeView === item.id ? 'bg-[var(--bg-surface-subtle)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                          }`}
                        >
                          <span className={activeView === item.id ? 'font-semibold text-[var(--text-primary)]' : 'font-medium text-[var(--text-primary)]'}>
                            {item.label}
                          </span>
                          <span className="text-[10px] text-[var(--text-muted)]">{item.shortDesc}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => navigateToView('people')}
                  className={`px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-md transition-colors cursor-pointer ${
                    activeView === 'people'
                      ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xs border border-[var(--border-hairline)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-transparent'
                  }`}
                >
                  People
                </button>
                <button
                  type="button"
                  onClick={() => navigateToView('more')}
                  className={`px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-md transition-colors cursor-pointer ${
                    activeView === 'more' || activeView === 'data-sync' || activeView === 'categories'
                      ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xs border border-[var(--border-hairline)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-transparent'
                  }`}
                >
                  Settings
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {user && (
              <HeaderSyncIndicator onOpenSyncSettings={() => navigateToView('data-sync')} />
            )}
            {user ? (
              <div className="hidden sm:flex items-center gap-2.5 lg:gap-3">
                <span className="text-xs sm:text-sm font-mono text-[var(--text-secondary)] truncate max-w-[140px] lg:max-w-[200px]">
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

        {/* Row 2 (Mobile & Tablet < lg): Dedicated Scrollable Secondary Navigation Rail */}
        {user && (
          <div className="lg:hidden border-t border-[var(--border-hairline)]/80 relative">
            <div
              role="navigation"
              aria-label="Primary sections"
              className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-2 overflow-x-auto scrollbar-none py-1.5"
            >
              <button
                type="button"
                onClick={() => navigateToView('ledger')}
                className={`relative shrink-0 whitespace-nowrap min-h-[38px] px-3 py-1.5 text-xs sm:text-[13px] font-semibold rounded-md border transition-colors cursor-pointer flex items-center gap-1.5 ${
                  activeView === 'ledger'
                    ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border-subtle)] shadow-2xs'
                    : 'bg-transparent text-[var(--text-secondary)] border-transparent active:bg-[var(--bg-surface-subtle)]'
                }`}
              >
                <span>Ledger</span>
              </button>

              <button
                type="button"
                onClick={() => navigateToView('documents')}
                className={`relative shrink-0 whitespace-nowrap min-h-[38px] px-3 py-1.5 text-xs sm:text-[13px] font-semibold rounded-md border transition-colors cursor-pointer flex items-center gap-1.5 ${
                  activeView === 'documents'
                    ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border-subtle)] shadow-2xs'
                    : 'bg-transparent text-[var(--text-secondary)] border-transparent active:bg-[var(--bg-surface-subtle)]'
                }`}
              >
                <span className="sm:hidden">Documents</span>
                <span className="hidden sm:inline">Documents &amp; Tax</span>
              </button>

              <button
                type="button"
                aria-expanded={isPlanningMenuOpen}
                aria-haspopup="menu"
                onClick={() => setIsPlanningMenuOpen((prev) => !prev)}
                className={`relative shrink-0 whitespace-nowrap min-h-[38px] px-3 py-1.5 text-xs sm:text-[13px] font-semibold rounded-md border transition-colors cursor-pointer flex items-center gap-1.5 ${
                  isPlanningViewActive || isPlanningMenuOpen
                    ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border-subtle)] shadow-2xs'
                    : 'bg-transparent text-[var(--text-secondary)] border-transparent active:bg-[var(--bg-surface-subtle)]'
                }`}
              >
                <span>{activePlanningLabel ? `Planning · ${activePlanningLabel}` : 'Planning'}</span>
                <span
                  className={`text-[10px] opacity-70 transition-transform ${isPlanningMenuOpen ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                >
                  ▾
                </span>
              </button>
            </div>

            {/* Mobile & Tablet Planning Menu Popover (outside overflow-x-auto so never clipped) */}
            {isPlanningMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40 bg-black/25"
                  onClick={() => setIsPlanningMenuOpen(false)}
                  aria-hidden="true"
                />
                <div
                  role="menu"
                  aria-label="Planning tools"
                  className="absolute left-4 right-4 sm:left-6 sm:right-auto sm:w-72 top-full mt-1.5 z-50 bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] rounded-xl shadow-xl py-1.5 divide-y divide-[var(--border-hairline)]"
                >
                  <div className="px-3.5 py-2 flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] font-semibold">
                      Planning &amp; Intelligence
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsPlanningMenuOpen(false)}
                      aria-label="Close planning menu"
                      className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] px-1.5 py-0.5 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="py-1">
                    {PLANNING_VIEWS.map((item) => {
                      const isCurrent = activeView === item.id;
                      return (
                        <button
                          key={item.id}
                          role="menuitem"
                          type="button"
                          onClick={() => navigateToView(item.id)}
                          className={`w-full min-h-[44px] px-3.5 py-2 text-left flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                            isCurrent
                              ? 'bg-[var(--bg-surface-subtle)] text-[var(--text-primary)]'
                              : 'text-[var(--text-secondary)] active:bg-[var(--bg-surface-subtle)]'
                          }`}
                        >
                          <span className="min-w-0">
                            <span className={`block text-xs ${isCurrent ? 'font-bold text-[var(--text-primary)]' : 'font-semibold text-[var(--text-primary)]'}`}>
                              {item.label}
                            </span>
                            <span className="block text-[11px] text-[var(--text-muted)]">
                              {item.shortDesc}
                            </span>
                          </span>
                          {isCurrent && (
                            <span className="text-[10px] font-mono uppercase text-[var(--text-primary)] shrink-0">
                              Active
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl 2xl:max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-5 sm:py-7 lg:py-8">
        {/* Success / Save Confirmation Toast */}
        {saveSuccessBanner && (
          <div
            role="status"
            aria-live="polite"
            className="fixed bottom-20 lg:bottom-8 left-1/2 -translate-x-1/2 z-50 max-w-[calc(100vw-2rem)] px-4 py-2.5 rounded-lg bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] border border-[var(--border-subtle)] shadow-xl text-xs font-medium flex items-center gap-2 transition-all"
          >
            <span className="text-emerald-500 font-bold shrink-0">✓</span>
            <span className="truncate">{saveSuccessBanner}</span>
            <button
              type="button"
              onClick={() => setSaveSuccessBanner(null)}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] font-bold ml-2 cursor-pointer shrink-0"
              aria-label="Dismiss notification"
            >
              ✕
            </button>
          </div>
        )}

        {/* Subtle prompt for accounts without a username */}
        {user && !currentUsername && (
          <div className="mb-4 p-3 text-xs bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] text-[var(--text-secondary)] rounded-lg flex flex-wrap items-center justify-between gap-2.5">
            <span className="min-w-0 leading-relaxed">
              You haven&apos;t set a username yet. Choose one to enable sign-in with your username.
            </span>
            <button
              type="button"
              onClick={() => navigateToView('more')}
              className="text-xs font-semibold text-[var(--text-primary)] underline underline-offset-2 hover:opacity-80 transition-opacity cursor-pointer shrink-0"
            >
              Choose username &rarr;
            </button>
          </div>
        )}

        {user ? (
          <>
            {/* Mount each destination on first visit, then preserve its state for fast return navigation. */}
            {visitedViews.has('home') && <div className={activeView === 'home' ? 'view-enter' : 'hidden'}>
              <DashboardPage
                userId={user.id}
                onOpenQuickAdd={() => setIsQuickAddOpen(true)}
                onOpenStatementImport={() => setIsStatementImportOpen(true)}
                onNavigateToLedger={() => navigateToView('ledger')}
                onOpenFilteredLedger={(filter) => {
                  setLedgerInitialFilter(filter);
                  navigateToView('ledger');
                }}
                refreshTrigger={refreshTrigger}
                initialBalances={shellBalances}
                onBalancesLoaded={(b) => setShellBalances(b)}
              />
            </div>}

            {visitedViews.has('ledger') && <div className={activeView === 'ledger' ? 'view-enter' : 'hidden'}>
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
                onOpenStatementImport={() => setIsStatementImportOpen(true)}
                onNavigateToStatementImport={() => setIsStatementImportOpen(true)}
                refreshTrigger={refreshTrigger}
                onTransactionMutated={() => setRefreshTrigger((prev) => prev + 1)}
              />
            </div>}

            {visitedViews.has('people') && <div className={activeView === 'people' ? 'view-enter' : 'hidden'}>
              <PeoplePage
                userId={user.id}
                onRefreshShell={() => setRefreshTrigger((prev) => prev + 1)}
              />
            </div>}

            {visitedViews.has('categories') && <div className={activeView === 'categories' ? 'view-enter' : 'hidden'}>
              <CategoryManager userId={user.id} onCategoryChange={handleCategoryChanged} />
            </div>}

            {visitedViews.has('documents') && <div className={activeView === 'documents' ? 'view-enter' : 'hidden'}>
              <DocumentsTaxCentre userId={user.id} />
            </div>}

            {visitedViews.has('data-sync') && <div className={activeView === 'data-sync' ? 'view-enter' : 'hidden'}>
              <DataSyncSettings userId={user.id} onBack={() => navigateToView('more')} />
            </div>}

            {visitedViews.has('safe-to-spend') && <div className={activeView === 'safe-to-spend' ? 'view-enter' : 'hidden'}>
              <FeatureComingSoon
                title="Safe to Spend"
                subtitle="Real-Time Discretionary Headroom & Dynamic Daily Allowance"
                moduleName="safe_to_spend"
                phase="Design & Integration"
                description="Real-time discretionary spending limit calculated from fixed obligations, planned savings, and active debt amortizations without simulating false AI models."
                plannedCapabilities={[
                  "Real-time recurring bill and loan deduction from current cash balances",
                  "Configurable buffer reserve margin before discretionary spending",
                  "Daily and weekly discretionary pace indicators",
                  "Non-destructive projections honoring integer-paise math"
                ]}
                ownerNote="This module requires live recurring commitment synchronization from People and Debt registers before active calculations are unlocked."
                onBack={() => navigateToView('home')}
              />
            </div>}

            {visitedViews.has('emi-planner') && <div className={activeView === 'emi-planner' ? 'view-enter' : 'hidden'}>
              <FeatureComingSoon
                title="EMI Stress Test & Prepayment Planner"
                subtitle="Amortization Sensitivity & Optimal Prepayment vs SIP Sequencing"
                moduleName="emi_planner"
                phase="Design & Modeling"
                description="Amortization stress testing, repo rate sensitivity modeling, and optimal loan prepayment sequencing adapted to Indian lending conditions."
                plannedCapabilities={[
                  "Floating vs fixed rate interest sensitivity curves (RBI Repo Rate indexing)",
                  "Prepayment vs SIP investment opportunity cost calculator",
                  "Principal reduction timeline acceleration analysis",
                  "Unified integration with active liabilities from People and Debt registers"
                ]}
                ownerNote="Deterministic financial math based on reducing-balance interest formulas will power this calculator without mocked server endpoints."
                onBack={() => navigateToView('home')}
              />
            </div>}

            {visitedViews.has('goal-planner') && <div className={activeView === 'goal-planner' ? 'view-enter' : 'hidden'}>
              <FeatureComingSoon
                title="Financial Goal Planner"
                subtitle="Milestone Accumulation & Target Savings Allocation"
                moduleName="goal_planner"
                phase="Architecture & UI Design"
                description="Targeted savings goals, timeline tracking, and auto-allocated monthly contribution targets grounded in authentic ledger cash flow."
                plannedCapabilities={[
                  "Categorized milestones (Emergency Fund, Down Payment, Higher Education, Travel)",
                  "Inflation-adjusted target requirement estimates",
                  "Target progress tracking with milestone notifications",
                  "Automatic allocation from monthly net surplus"
                ]}
                ownerNote="Under active development by the product team. Will integrate directly with goal-tagged transaction rules."
                onBack={() => navigateToView('home')}
              />
            </div>}

            {visitedViews.has('fire-planning') && <div className={activeView === 'fire-planning' ? 'view-enter' : 'hidden'}>
              <FeatureComingSoon
                title="FIRE Planning & Independence Tracker"
                subtitle="Safe Withdrawal Rate & Corpus Milestone Modeling for India"
                moduleName="fire_planning"
                phase="Research & Actuarial Modeling"
                description="Financial Independence, Retire Early modeling adapted to Indian tax, inflation, and investment parameters with zero fake projections."
                plannedCapabilities={[
                  "LeanFIRE, Standard FIRE, and FatFIRE withdrawal rate simulations (SWR: 3.0% - 4.5%)",
                  "Indian long-term capital gains (LTCG) tax drag estimation",
                  "Healthcare and lifestyle inflation adjustment sliders",
                  "Corpus accumulation milestone tracker against current net worth"
                ]}
                ownerNote="Actuarial parameters and tax brackets are being validated against the Income Tax Act to ensure reliable projection numbers."
                onBack={() => navigateToView('home')}
              />
            </div>}

            {visitedViews.has('insights') && <div className={activeView === 'insights' ? 'view-enter' : 'hidden'}>
              <FeatureComingSoon
                title="Spending Insights & Behavioral Analytics"
                subtitle="Deterministic Expense Breakdown & Anomaly Detection"
                moduleName="insights"
                phase="Specification & Architecture"
                description="Deterministic spending patterns, discretionary ratio trends, and expense anomaly detection without black-box AI."
                plannedCapabilities={[
                  "Needs vs Wants vs Investments allocation breakdowns (50/30/20 heuristic)",
                  "Merchant recurring subscription creep detection",
                  "Month-over-month category variance analysis",
                  "Deterministic rule-based spending alerts"
                ]}
                ownerNote="We strictly avoid generative AI hallucinations for financial insights; all heuristics are transparent, rule-based, and auditable."
                onBack={() => navigateToView('home')}
              />
            </div>}

            {visitedViews.has('more') && (
              <div className={activeView === 'more' ? 'view-enter' : 'hidden'}>
                <SettingsView
                  user={user}
                  currentUsername={currentUsername}
                  onUsernameSet={(newUsername) => setCurrentUsername(newUsername)}
                  passwordStatus={passwordStatus}
                  hasPassword={hasPassword}
                  passwordButtonText={
                    passwordStatus === 'configured'
                      ? 'Change Password'
                      : passwordStatus === 'not_configured'
                        ? 'Set Password'
                        : 'Password Settings'
                  }
                  onOpenPasswordModal={() => setIsPasswordModalOpen(true)}
                  onOpenDeleteModal={() => setIsDeleteModalOpen(true)}
                  onOpenStartingBalancesModal={() => setIsStartingBalancesModalOpen(true)}
                  onOpenCategories={() => {
                    setOpenedCategoriesFromMore(true);
                    navigateToView('categories');
                  }}
                  onOpenDataSync={() => navigateToView('data-sync')}
                  shellBalances={shellBalances}
                  pendingSyncCount={pendingSyncCount}
                  isSyncing={isSyncing}
                  isMobilePwa={isMobilePwa}
                  appLock={appLock}
                  appLockSlot={isMobilePwa && <AppLockSettings appLock={appLock} />}
                  onSignOut={handleSignOut}
                  installPrompt={<InstallPromptCard userId={user?.id} />}
                  dataExport={<DataExportCard user={user} />}
                  themeToggleSlot={
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                          Appearance & Theme
                        </h3>
                        <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                          Switch between Archival Light and Obsidian Dark themes.
                        </p>
                      </div>
                      <ThemeToggle className="w-full sm:w-64" />
                    </div>
                  }
                  androidDownloadSlot={
                    <Link
                      href="/download"
                      className="flex items-center justify-between gap-3 p-4 bg-[var(--bg-surface)] border border-[var(--border-hairline)] hover:border-[var(--border-strong)] rounded-xl transition-all group"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--text-primary)]">
                          Native Android Application
                        </p>
                        <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">
                          Get the official offline-first native app with fingerprint unlock
                        </p>
                      </div>
                      <span className="text-xs text-[var(--text-muted)] group-hover:text-[var(--text-primary)] font-bold transition-colors shrink-0">
                        &rarr;
                      </span>
                    </Link>
                  }
                />
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-16 px-4 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl space-y-4">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              Welcome to SpendSense Personal Finance
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

      {/* Mobile & Tablet Fixed Bottom Navigation with Central Quick Add (+) */}
      {/* 5 destinations: Home | Ledger | Add (+) | People | More */}
      {user && (
        <nav
          aria-label="Mobile Navigation"
          className="lg:hidden fixed inset-x-0 bottom-0 z-40 glass-bottom-nav border-t border-[var(--border-hairline)] px-2 pt-1.5 pb-[max(0.55rem,env(safe-area-inset-bottom))] flex items-center justify-around"
        >
          {/* 1. Home */}
          <button
            type="button"
            onClick={() => navigateToView('home')}
            className={`flex flex-col items-center justify-center min-h-[44px] gap-1 text-[10px] transition-colors flex-1 max-w-[72px] cursor-pointer rounded-md ${
              activeView === 'home'
                ? 'text-[var(--text-primary)] font-semibold'
                : 'text-[var(--text-muted)] font-medium hover:text-[var(--text-primary)]'
            }`}
          >
            <svg className="w-[19px] h-[19px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={activeView === 'home' ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 10.5 12 3l9 7.5" />
              <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
            </svg>
            <span className="truncate">Home</span>
          </button>

          {/* 2. Ledger */}
          <button
            type="button"
            onClick={() => navigateToView('ledger')}
            className={`flex flex-col items-center justify-center min-h-[44px] gap-1 text-[10px] transition-colors flex-1 max-w-[72px] cursor-pointer rounded-md ${
              activeView === 'ledger'
                ? 'text-[var(--text-primary)] font-semibold'
                : 'text-[var(--text-muted)] font-medium hover:text-[var(--text-primary)]'
            }`}
          >
            <svg className="w-[19px] h-[19px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={activeView === 'ledger' ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 6h16" />
              <path d="M4 12h16" />
              <path d="M4 18h10" />
            </svg>
            <span className="truncate">Ledger</span>
          </button>

          {/* 3. Integrated Center Quick Add Action (+) */}
          <div className="flex items-center justify-center flex-1 max-w-[64px]">
            <button
              type="button"
              onClick={() => setIsQuickAddOpen(true)}
              aria-label="Add transaction"
              className="flex items-center justify-center w-12 h-10 rounded-md bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] hover:bg-[var(--action-primary-hover)] active:scale-95 transition-transform cursor-pointer border border-[var(--border-strong)]/20"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
            </button>
          </div>

          {/* 4. People */}
          <button
            type="button"
            onClick={() => navigateToView('people')}
            className={`flex flex-col items-center justify-center min-h-[44px] gap-1 text-[10px] transition-colors flex-1 max-w-[72px] cursor-pointer rounded-md ${
              activeView === 'people'
                ? 'text-[var(--text-primary)] font-semibold'
                : 'text-[var(--text-muted)] font-medium hover:text-[var(--text-primary)]'
            }`}
          >
            <svg className="w-[19px] h-[19px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={activeView === 'people' ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="9" cy="7" r="3.5" />
              <path d="M3 20c0-3.2 2.7-5.5 6-5.5s6 2.3 6 5.5" />
              <path d="M16.5 4.5a3 3 0 0 1 0 5.5" />
              <path d="M18 15c2.2.6 3.5 2.4 3.5 5" />
            </svg>
            <span className="truncate">People</span>
          </button>

          {/* 5. More / Settings */}
          <button
            type="button"
            onClick={() => navigateToView('more')}
            className={`flex flex-col items-center justify-center min-h-[44px] gap-1 text-[10px] transition-colors flex-1 max-w-[72px] cursor-pointer rounded-md ${
              activeView === 'more' || activeView === 'data-sync' || activeView === 'categories'
                ? 'text-[var(--text-primary)] font-semibold'
                : 'text-[var(--text-muted)] font-medium hover:text-[var(--text-primary)]'
            }`}
          >
            <svg className="w-[19px] h-[19px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={activeView === 'more' || activeView === 'data-sync' || activeView === 'categories' ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.86 1 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
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

      {/* Shared Statement Import Modal / Sheet */}
      {isStatementImportOpen && user && (
        <StatementImportModal
          isOpen={true}
          onClose={() => setIsStatementImportOpen(false)}
          userId={user.id}
          StatementImportComponent={StatementImport}
          onImported={(count) => {
            setRefreshTrigger((prev) => prev + 1);
            setSaveSuccessBanner(`Imported ${count} statement transaction(s) into your ledger.`);
            setTimeout(() => setSaveSuccessBanner(null), 3500);
          }}
          onManualEntry={() => {
            setIsStatementImportOpen(false);
            setIsQuickAddOpen(true);
          }}
        />
      )}

      {/* Change / Set Password Modal */}
      {user && isPasswordModalOpen && (
        <ChangePasswordModal
          isOpen={true}
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
