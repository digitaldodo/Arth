'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { UsernameClaimForm } from '@/features/profile/UsernameClaimForm';
import { AppLockSettings } from '@/features/app-lock/AppLockSettings';
import { useAppLock } from '@/features/app-lock/useAppLock';
import { LanguagePreference } from '@/features/settings/LanguagePreference';
import { DataExportCard } from '@/features/export/DataExportCard';
import type { PasswordStatus } from '@/lib/auth/password-status';
import type { AccountBalancesDTO } from '@arth/contracts';

interface SettingsViewProps {
  user: {
    id: string;
    email?: string;
    displayName?: string;
    username?: string;
    providers?: string[];
  };
  currentUsername?: string;
  onUsernameSet: (username: string) => void;
  passwordStatus: PasswordStatus;
  hasPassword: boolean;
  passwordButtonText?: string;
  onOpenPasswordModal: () => void;
  onOpenDeleteModal: () => void;
  onOpenStartingBalancesModal: () => void;
  onOpenCategories: () => void;
  onOpenDataSync: () => void;
  shellBalances: AccountBalancesDTO | null;
  pendingSyncCount: number;
  isSyncing: boolean;
  isMobilePwa: boolean;
  appLock: ReturnType<typeof useAppLock>;
  appLockSlot?: React.ReactNode;
  themeToggleSlot?: React.ReactNode;
  androidDownloadSlot?: React.ReactNode;
  onSignOut: (e: React.FormEvent<HTMLFormElement>) => void;
  installPrompt?: React.ReactNode;
  dataExport?: React.ReactNode;
}

type SettingsSection = 'all' | 'appearance' | 'categories' | 'account' | 'regional' | 'notifications' | 'data' | 'sync';

export function SettingsView({
  user,
  currentUsername,
  onUsernameSet,
  passwordStatus,
  hasPassword,
  passwordButtonText,
  onOpenPasswordModal,
  onOpenDeleteModal,
  onOpenStartingBalancesModal,
  onOpenCategories,
  onOpenDataSync,
  shellBalances,
  pendingSyncCount,
  isSyncing,
  isMobilePwa,
  appLock,
  appLockSlot,
  themeToggleSlot,
  androidDownloadSlot,
  onSignOut,
  installPrompt,
  dataExport,
}: SettingsViewProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>('all');

  // Detect whether running in a native Android wrapper bridge
  const isNativeAndroid =
    typeof window !== 'undefined' &&
    (('AndroidBridge' in window) || ('Android' in window));

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Settings Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-[var(--border-hairline)]">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)]">
            Settings &amp; Preferences
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1">
            Account security, appearance, regional preferences, and data privacy.
          </p>
        </div>

        {/* Compact User Identity & Sign Out */}
        <div className="flex items-center gap-3 bg-[var(--bg-surface)] border border-[var(--border-hairline)] px-3 py-1.5 rounded-lg shrink-0">
          <div className="text-right">
            <span className="text-xs font-semibold text-[var(--text-primary)] block">
              {currentUsername ? `@${currentUsername}` : user.displayName || 'SpendSense Account'}
            </span>
            <span className="text-[11px] text-[var(--text-muted)] font-mono truncate max-w-[150px] block">
              {user.email}
            </span>
          </div>
          <form action="/auth/logout" method="POST" onSubmit={onSignOut}>
            <button
              type="submit"
              className="px-2.5 py-1 text-xs font-medium border border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-md transition-colors cursor-pointer"
            >
              Sign Out
            </button>
          </form>
        </div>
      </div>

      {/* Section Filter Pills */}
      <nav aria-label="Settings sections" className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
        <button
          type="button"
          onClick={() => setActiveSection('all')}
          className={`px-3 py-1.5 rounded-full font-medium whitespace-nowrap transition-colors cursor-pointer ${
            activeSection === 'all'
              ? 'bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] font-semibold'
              : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-hairline)]'
          }`}
        >
          All Settings
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('appearance')}
          className={`px-3 py-1.5 rounded-full font-medium whitespace-nowrap transition-colors cursor-pointer ${
            activeSection === 'appearance'
              ? 'bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] font-semibold'
              : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-hairline)]'
          }`}
        >
          🌓 Appearance
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('categories')}
          className={`px-3 py-1.5 rounded-full font-medium whitespace-nowrap transition-colors cursor-pointer ${
            activeSection === 'categories'
              ? 'bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] font-semibold'
              : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-hairline)]'
          }`}
        >
          🏷️ Categories
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('account')}
          className={`px-3 py-1.5 rounded-full font-medium whitespace-nowrap transition-colors cursor-pointer ${
            activeSection === 'account'
              ? 'bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] font-semibold'
              : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-hairline)]'
          }`}
        >
          🔐 Account &amp; Security
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('regional')}
          className={`px-3 py-1.5 rounded-full font-medium whitespace-nowrap transition-colors cursor-pointer ${
            activeSection === 'regional'
              ? 'bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] font-semibold'
              : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-hairline)]'
          }`}
        >
          🌐 Regional &amp; Balances
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('notifications')}
          className={`px-3 py-1.5 rounded-full font-medium whitespace-nowrap transition-colors cursor-pointer ${
            activeSection === 'notifications'
              ? 'bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] font-semibold'
              : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-hairline)]'
          }`}
        >
          🔔 Privacy &amp; Alerts
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('data')}
          className={`px-3 py-1.5 rounded-full font-medium whitespace-nowrap transition-colors cursor-pointer ${
            activeSection === 'data'
              ? 'bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] font-semibold'
              : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-hairline)]'
          }`}
        >
          💾 Data Management
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('sync')}
          className={`px-3 py-1.5 rounded-full font-medium whitespace-nowrap transition-colors cursor-pointer ${
            activeSection === 'sync'
              ? 'bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] font-semibold'
              : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-hairline)]'
          }`}
        >
          🔄 Sync
        </button>
      </nav>

      {/* ========================================================
          SECTION A: APPEARANCE & PERSONALIZATION
      ======================================================== */}
      {(activeSection === 'all' || activeSection === 'appearance') && (
        <section aria-labelledby="heading-appearance" className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-base" aria-hidden="true">🌓</span>
            <h2 id="heading-appearance" className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Appearance &amp; Personalization
            </h2>
          </div>
          <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl p-4 sm:p-5 space-y-4 shadow-2xs">
            {themeToggleSlot || (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                    Theme Preference
                  </h3>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    Switch between Archival Light and Obsidian Dark themes.
                  </p>
                </div>
                <ThemeToggle className="sm:w-64" />
              </div>
            )}

            <div className="pt-3 border-t border-[var(--border-hairline)] flex items-center justify-between text-xs">
              <div>
                <span className="font-semibold text-[var(--text-primary)] block">Motion &amp; Animations</span>
                <span className="text-[11px] text-[var(--text-muted)]">
                  Respects system prefers-reduced-motion for instantaneous screen transitions.
                </span>
              </div>
              <span className="text-[11px] font-mono uppercase px-2 py-0.5 rounded-xs bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] border border-[var(--border-hairline)]">
                System Default
              </span>
            </div>
          </div>
        </section>
      )}

      {/* ========================================================
          SECTION B: CATEGORY CUSTOMIZATION
      ======================================================== */}
      {(activeSection === 'all' || activeSection === 'categories') && (
        <section aria-labelledby="heading-categories" className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-base" aria-hidden="true">🏷️</span>
            <h2 id="heading-categories" className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Category Customization
            </h2>
          </div>
          <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
            <div className="space-y-1">
              <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                Manage Income &amp; Expense Categories
              </h3>
              <p className="text-[11px] text-[var(--text-muted)] max-w-xl leading-relaxed">
                Add custom categories, rename existing labels, reorder priorities, or archive unused tags. Custom categories remain synchronized across all your logged-in devices.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenCategories}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-md hover:bg-[var(--action-primary-hover)] transition-colors shadow-2xs cursor-pointer shrink-0"
            >
              <span>Manage Categories</span>
              <span aria-hidden="true">&rarr;</span>
            </button>
          </div>
        </section>
      )}

      {/* ========================================================
          SECTION C: ACCOUNT & SECURITY
      ======================================================== */}
      {(activeSection === 'all' || activeSection === 'account') && (
        <section aria-labelledby="heading-account" className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-base" aria-hidden="true">🔐</span>
            <h2 id="heading-account" className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Account &amp; Security
            </h2>
          </div>
          <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl divide-y divide-[var(--border-hairline)] overflow-hidden shadow-2xs">
            {/* Profile & Username */}
            <div className="p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                    Profile &amp; Username
                  </h3>
                  <p className="text-[11px] text-[var(--text-muted)] font-mono">
                    {user.email}
                  </p>
                </div>
              </div>
              <div className="pt-2">
                <UsernameClaimForm
                  currentUsername={currentUsername}
                  onUsernameSet={onUsernameSet}
                />
              </div>
            </div>

            {/* Password Credentials */}
            <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                  Password Credentials
                </h3>
                <p className="text-[11px] text-[var(--text-muted)]">
                  {passwordStatus === 'configured'
                    ? 'Password configured • Set up or update your sign-in credentials'
                    : 'Set a password to enable email & username sign-in'}
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenPasswordModal}
                className="px-3.5 py-1.5 text-xs font-semibold border border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-canvas)] rounded-md transition-colors cursor-pointer shrink-0"
              >
                {passwordButtonText || (passwordStatus === 'configured' ? 'Change Password' : passwordStatus === 'not_configured' ? 'Set Password' : 'Password Settings')}
              </button>
            </div>

            {/* Mobile App Lock (if PWA) */}
            {appLockSlot !== undefined ? (
              appLockSlot && <div className="p-4 sm:p-5">{appLockSlot}</div>
            ) : isMobilePwa ? (
              <div className="p-4 sm:p-5">
                <AppLockSettings appLock={appLock} />
              </div>
            ) : null}

            {/* Danger Zone: Account Deletion */}
            <div className="p-4 sm:p-5 bg-rose-50/20 dark:bg-rose-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-xs font-semibold text-rose-700 dark:text-rose-400">
                  Delete Account &amp; Financial Records
                </h3>
                <p className="text-[11px] text-[var(--text-muted)] max-w-lg mt-0.5">
                  Permanently purge your account, transaction ledger, category taxonomy, and people registers. This operation is non-reversible.
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenDeleteModal}
                className="px-3 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-800 rounded-md transition-colors cursor-pointer shrink-0"
              >
                Delete Account…
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ========================================================
          SECTION D: LANGUAGE & REGIONAL PREFERENCES
      ======================================================== */}
      {(activeSection === 'all' || activeSection === 'regional') && (
        <section aria-labelledby="heading-regional" className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-base" aria-hidden="true">🌐</span>
            <h2 id="heading-regional" className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Language, Regional &amp; Balances
            </h2>
          </div>
          <div className="space-y-3">
            {/* Language Selector */}
            <LanguagePreference userId={user.id} />

            {/* Currency & Paise Storage Info */}
            <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl p-4 sm:p-5 space-y-2 shadow-2xs">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                    Currency &amp; Numeric Precision
                  </h3>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Default currency: Indian Rupee (₹ INR). All transactions are stored as exact 64-bit integer paise.
                  </p>
                </div>
                <span className="text-xs font-mono font-bold px-2 py-1 rounded bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)]">
                  ₹ INR (paise)
                </span>
              </div>
            </div>

            {/* Account Starting Balances Card */}
            <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl p-4 sm:p-5 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                    Starting Account Balances
                  </h3>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Initial Cash and Online balances when your SpendSense ledger began.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onOpenStartingBalancesModal}
                  className="px-3 py-1.5 text-xs font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-md hover:bg-[var(--action-primary-hover)] transition-colors shadow-2xs cursor-pointer shrink-0"
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
          </div>
        </section>
      )}

      {/* ========================================================
          SECTION E: NOTIFICATIONS & PRIVACY (DEVICE-AWARE)
      ======================================================== */}
      {(activeSection === 'all' || activeSection === 'notifications') && (
        <section aria-labelledby="heading-notifications" className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-base" aria-hidden="true">🔔</span>
            <h2 id="heading-notifications" className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Notifications &amp; Privacy
            </h2>
          </div>
          <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl p-4 sm:p-5 space-y-3 shadow-2xs">
            <div className="space-y-1">
              <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                Financial Transaction Notifications &amp; Privacy
              </h3>
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                SpendSense operates with strict user-isolation and zero external data sharing. All PDF statement passwords are kept transiently in device memory only.
              </p>
            </div>

            {/* Device-aware condition: Native Android vs Web/Desktop */}
            {isNativeAndroid ? (
              <div className="p-3 bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] rounded-lg text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[var(--text-primary)]">Android Automatic SMS Capture</span>
                  <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    Active Bridge
                  </span>
                </div>
                <p className="text-[11px] text-[var(--text-secondary)]">
                  Automatic transaction detection is configured in Android Settings &rarr; Automatic Transaction Detection.
                </p>
              </div>
            ) : (
              <div className="p-3 bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] rounded-lg text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[var(--text-primary)]">Automatic SMS Detection</span>
                  <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-[var(--bg-canvas)] text-[var(--text-secondary)] border border-[var(--border-hairline)]">
                    Native Android Feature
                  </span>
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                  Automatic bank and UPI SMS transaction detection is available exclusively in the native SpendSense Android application. On desktop and web browsers, use the <strong>Import Bank Statement</strong> action on Dashboard or Ledger to import PDF, CSV, and XLSX statements.
                </p>
                {androidDownloadSlot ? (
                  <div className="pt-2">{androidDownloadSlot}</div>
                ) : (
                  <div>
                    <Link
                      href="/download"
                      className="text-xs font-semibold text-[var(--text-primary)] underline underline-offset-2 hover:opacity-80 transition-opacity"
                    >
                      Download SpendSense for Android &rarr;
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ========================================================
          SECTION F: DATA & PRIVACY (DATA MANAGEMENT)
      ======================================================== */}
      {(activeSection === 'all' || activeSection === 'data') && (
        <section aria-labelledby="heading-data" className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-base" aria-hidden="true">💾</span>
            <h2 id="heading-data" className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Data Management &amp; Backup
            </h2>
          </div>
          <div className="space-y-3">
            {/* CSV Export & JSON Backup Card */}
            {dataExport || <DataExportCard user={user} />}

            {/* Data Retention & Privacy Policy Note */}
            <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
              <div className="space-y-0.5">
                <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                  Data Retention &amp; Privacy Policy
                </h3>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Review how your financial data is isolated and protected.
                </p>
              </div>
              <Link
                href="/privacy"
                className="text-xs font-semibold text-[var(--text-primary)] underline underline-offset-2 hover:opacity-80 transition-opacity shrink-0"
              >
                Read Privacy Policy &rarr;
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ========================================================
          SECTION G: DEVICES & SYNCHRONIZATION
      ======================================================== */}
      {(activeSection === 'all' || activeSection === 'sync') && (
        <section aria-labelledby="heading-sync" className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-base" aria-hidden="true">🔄</span>
            <h2 id="heading-sync" className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Devices &amp; Synchronization
            </h2>
          </div>
          <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                  Data &amp; Synchronization Engine
                </h3>
                <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded-xs border ${
                  pendingSyncCount > 0
                    ? 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-200'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200'
                }`}>
                  {isSyncing ? 'Syncing…' : pendingSyncCount > 0 ? `${pendingSyncCount} Pending` : 'All Synced'}
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] max-w-xl leading-relaxed">
                Local-first IndexedDB storage provides instant offline access. All pending ledger writes synchronize automatically when online.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenDataSync}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-canvas)] rounded-md transition-colors shadow-2xs cursor-pointer shrink-0"
            >
              <span>View Data &amp; Sync</span>
              <span aria-hidden="true">&rarr;</span>
            </button>
          </div>

          {installPrompt}
        </section>
      )}
    </div>
  );
}
