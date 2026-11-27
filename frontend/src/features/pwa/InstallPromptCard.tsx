'use client';

import React, { useState, useEffect, useSyncExternalStore } from 'react';
import { Badge } from '@/components/ui/Badge';
import { usePwaInstall } from './usePwaInstall';
import { syncEngine, type SyncState } from '@/features/sync/sync-engine';

export interface InstallPromptCardProps {
  userId?: string;
}

function subscribeServiceWorker(callback: () => void): () => void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return () => {};
  }
  navigator.serviceWorker.addEventListener('controllerchange', callback);
  return () => {
    navigator.serviceWorker.removeEventListener('controllerchange', callback);
  };
}

function getServiceWorkerSnapshot(): boolean {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return false;
  return Boolean(navigator.serviceWorker.controller);
}

function getServiceWorkerServerSnapshot(): boolean {
  return false;
}

export const InstallPromptCard: React.FC<InstallPromptCardProps> = ({ userId }) => {
  const { isStandalone, isInstallable, isInstalled, isIos, installOutcome, installApp } = usePwaInstall();
  const [isInstalling, setIsInstalling] = useState(false);
  const [installResult, setInstallResult] = useState<'accepted' | 'dismissed' | null>(null);
  const [syncState, setSyncState] = useState<SyncState>(() => syncEngine.getState());
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    return syncEngine.subscribe((state) => {
      setSyncState(state);
    });
  }, []);

  const isOfflineReady = useSyncExternalStore(
    subscribeServiceWorker,
    getServiceWorkerSnapshot,
    getServiceWorkerServerSnapshot
  );

  const handleInstallClick = async () => {
    setIsInstalling(true);
    try {
      const accepted = await installApp();
      setInstallResult(accepted ? 'accepted' : 'dismissed');
    } finally {
      setIsInstalling(false);
    }
  };

  const handleManualSync = () => {
    if (userId) {
      void syncEngine.processQueue(userId);
    }
  };

  const handleRetryFailed = async () => {
    if (!userId) return;
    setIsRetrying(true);
    try {
      await syncEngine.retryFailedMutations(userId);
    } finally {
      setIsRetrying(false);
    }
  };

  // Comprehensive Centralized Live Sync & Offline Status Section
  const syncStatusSection = (
    <div className="pt-3 border-t border-[var(--border-hairline)] space-y-4">
      {/* 1. Connectivity & High-Level State */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-[var(--text-secondary)]">Connectivity:</span>
          {syncState.isOnline ? (
            <Badge variant="connected" size="xs" dot>
              Online
            </Badge>
          ) : (
            <Badge variant="warning" size="xs" dot>
              Offline
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium text-[var(--text-muted)]">State:</span>
          {!syncState.isOnline ? (
            <Badge variant="warning" size="xs">Offline (saved locally)</Badge>
          ) : syncState.isSyncing ? (
            <Badge variant="connected" size="xs" dot>Synchronizing…</Badge>
          ) : syncState.mutationError || syncState.failedCount > 0 ? (
            <Badge variant="expense" size="xs" dot>Failed and requiring attention</Badge>
          ) : syncState.pendingCount > 0 ? (
            <Badge variant="warning" size="xs" dot>Waiting to sync</Badge>
          ) : syncState.refreshError ? (
            <Badge variant="warning" size="xs">Server data refresh failed</Badge>
          ) : (
            <Badge variant="connected" size="xs" dot>Synced</Badge>
          )}
        </div>
      </div>

      {/* 2. Outgoing Changes Breakdown */}
      <div>
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
          Outgoing Changes
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="p-2.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] text-center">
            <div className="text-[10px] text-[var(--text-muted)] font-medium">Pending</div>
            <div className={`text-base font-semibold font-mono mt-0.5 ${syncState.pendingCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-[var(--text-primary)]'}`}>
              {syncState.pendingCount}
            </div>
            <div className="text-[9px] text-[var(--text-muted)] mt-0.5">Saved locally</div>
          </div>

          <div className="p-2.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] text-center">
            <div className="text-[10px] text-[var(--text-muted)] font-medium">Synchronizing</div>
            <div className={`text-base font-semibold font-mono mt-0.5 ${syncState.isSyncing ? 'text-emerald-600 dark:text-emerald-400 animate-pulse' : 'text-[var(--text-primary)]'}`}>
              {syncState.syncingCount}
            </div>
            <div className="text-[9px] text-[var(--text-muted)] mt-0.5">In flight</div>
          </div>

          <div className="p-2.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] text-center">
            <div className="text-[10px] text-[var(--text-muted)] font-medium">Synced</div>
            <div className="text-base font-semibold font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
              {syncState.syncedCount > 0 ? syncState.syncedCount : (syncState.pendingCount === 0 ? '✓' : '0')}
            </div>
            <div className="text-[9px] text-[var(--text-muted)] mt-0.5">Confirmed</div>
          </div>

          <div className="p-2.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] text-center">
            <div className="text-[10px] text-[var(--text-muted)] font-medium">Failed</div>
            <div className={`text-base font-semibold font-mono mt-0.5 ${syncState.failedCount > 0 ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-[var(--text-primary)]'}`}>
              {syncState.failedCount}
            </div>
            <div className="text-[9px] text-[var(--text-muted)] mt-0.5">Needs attention</div>
          </div>
        </div>
      </div>

      {/* 3. Server Refresh Status */}
      <div>
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
          Server Data Refresh
        </h4>
        <div className="space-y-1.5 text-xs bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] rounded-lg p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[var(--text-secondary)]">Account balances:</span>
            {syncState.resourceErrors.balances ? (
              <span className="text-[10px] font-semibold text-rose-600 dark:text-rose-400">Failed (showing saved copy)</span>
            ) : syncState.isSyncing ? (
              <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">Refreshing…</span>
            ) : (
              <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">✓ Synced</span>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[var(--text-secondary)]">Transaction history:</span>
            {syncState.resourceErrors.transactions ? (
              <span className="text-[10px] font-semibold text-rose-600 dark:text-rose-400">Failed (showing saved copy)</span>
            ) : syncState.isSyncing ? (
              <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">Refreshing…</span>
            ) : (
              <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">✓ Synced</span>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[var(--text-secondary)]">Categories:</span>
            {syncState.resourceErrors.categories ? (
              <span className="text-[10px] font-semibold text-rose-600 dark:text-rose-400">Failed (showing saved copy)</span>
            ) : syncState.isSyncing ? (
              <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">Refreshing…</span>
            ) : (
              <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">✓ Synced</span>
            )}
          </div>
        </div>
      </div>

      {/* 4. History & Errors */}
      <div className="space-y-2 text-xs">
        <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] font-mono">
          <span>Last synced:</span>
          <span>
            {syncState.lastSyncedAt
              ? new Date(syncState.lastSyncedAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })
              : 'Not yet synced in this session'}
          </span>
        </div>

        {(syncState.mutationError || syncState.refreshError || syncState.lastError) && (
          <div className="p-2.5 rounded-lg border border-amber-300 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 text-[11px] space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">
                {syncState.mutationError ? 'Synchronization Error' : syncState.refreshError ? 'Refresh Notice' : 'Sync Notice'}
              </span>
              <button
                type="button"
                onClick={() => setShowErrorDetails((prev) => !prev)}
                className="underline hover:opacity-80 cursor-pointer font-medium text-[10px]"
              >
                {showErrorDetails ? 'Hide details' : 'View details'}
              </button>
            </div>
            <p className="line-clamp-2">
              {syncState.mutationError || syncState.refreshError || syncState.lastError}
            </p>
            {showErrorDetails && (
              <div className="mt-2 pt-2 border-t border-amber-200 dark:border-amber-900/40 text-[10px] font-mono space-y-1 break-all">
                {syncState.mutationError && <div><strong>Mutation error:</strong> {syncState.mutationError}</div>}
                {syncState.refreshError && <div><strong>Refresh notice:</strong> {syncState.refreshError}</div>}
                {syncState.resourceErrors.balances && <div><strong>Balances error:</strong> {syncState.resourceErrors.balances}</div>}
                {syncState.resourceErrors.transactions && <div><strong>Transactions error:</strong> {syncState.resourceErrors.transactions}</div>}
                {syncState.resourceErrors.categories && <div><strong>Categories error:</strong> {syncState.resourceErrors.categories}</div>}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 5. Actions Toolbar */}
      <div className="flex items-center gap-2 pt-1 flex-wrap">
        <button
          type="button"
          onClick={handleManualSync}
          disabled={syncState.isSyncing || !syncState.isOnline}
          className="px-3 py-1.5 text-xs font-semibold rounded-md bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] hover:bg-[var(--action-primary-hover)] active:scale-[0.99] transition-all disabled:opacity-50 cursor-pointer shadow-xs"
        >
          {syncState.isSyncing ? 'Synchronizing…' : 'Sync Now'}
        </button>

        {(syncState.failedCount > 0 || syncState.mutationError) && (
          <button
            type="button"
            onClick={handleRetryFailed}
            disabled={isRetrying || syncState.isSyncing || !syncState.isOnline}
            className="px-3 py-1.5 text-xs font-semibold rounded-md bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200 border border-rose-300 dark:border-rose-900/60 hover:bg-rose-200 dark:hover:bg-rose-900/80 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {isRetrying ? 'Retrying…' : 'Retry failed synchronization'}
          </button>
        )}
      </div>
    </div>
  );

  // 1. Standalone / Already Installed
  if (isStandalone || isInstalled) {
    return (
      <div
        data-testid="pwa-installed-card"
        className="p-4 sm:p-5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] space-y-3"
      >
        {/* Row 1: Icon, Title, Status badge */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold text-xs shrink-0">
              ✓
            </div>
            <h3 className="text-xs font-semibold text-[var(--text-primary)] truncate">
              Offline Support
            </h3>
          </div>
          <Badge variant="connected" size="sm" dot>
            Already installed
          </Badge>
        </div>

        {/* Row 2: Full-width concise description */}
        <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
          Use SpendSense offline and sync your changes when you&apos;re back online.
        </p>

        {/* Sync Status details */}
        {syncStatusSection}
      </div>
    );
  }

  // 2. Direct Install Prompt Available (Chromium, Edge, modern Android)
  if (isInstallable) {
    return (
      <div
        data-testid="pwa-installable-card"
        className="p-4 sm:p-5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] space-y-3"
      >
        {/* Row 1: Icon, Title, Status badge */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] flex items-center justify-center text-xs shrink-0">
              📲
            </div>
            <h3 className="text-xs font-semibold text-[var(--text-primary)] truncate">
              Offline Support
            </h3>
          </div>
          <Badge variant="neutral" size="sm" dot>
            {isOfflineReady ? 'Offline Ready' : 'Installable'}
          </Badge>
        </div>

        {/* Row 2: Full-width concise description */}
        <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
          Use SpendSense offline and sync your changes when you&apos;re back online. Install SpendSense on this device for standalone app access.
        </p>

        {/* Action Button */}
        <div className="flex flex-wrap items-center gap-2.5 pt-0.5">
          <button
            type="button"
            data-testid="pwa-install-button"
            onClick={handleInstallClick}
            disabled={isInstalling}
            className="min-h-10 px-4 py-2 text-xs font-semibold rounded-md bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] hover:bg-[var(--action-primary-hover)] active:scale-[0.99] transition-all disabled:opacity-50 cursor-pointer shadow-xs"
          >
            {isInstalling ? 'Installing…' : 'Install SpendSense'}
          </button>
          {(installResult === 'dismissed' || installOutcome === 'dismissed') && (
            <span className="text-[11px] text-[var(--text-muted)]">
              Prompt dismissed. You can install anytime from your browser menu.
            </span>
          )}
        </div>

        {/* Sync Status details */}
        {syncStatusSection}
      </div>
    );
  }

  // 3. iOS / iPadOS Safari Manual Installation Guidance
  if (isIos) {
    return (
      <div
        data-testid="pwa-ios-card"
        className="p-4 sm:p-5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] space-y-3"
      >
        {/* Row 1: Icon, Title, Status badge */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] flex items-center justify-center text-xs shrink-0">
              🍏
            </div>
            <h3 className="text-xs font-semibold text-[var(--text-primary)] truncate">
              Offline Support
            </h3>
          </div>
          <Badge variant="neutral" size="sm">
            {isOfflineReady ? 'Offline Ready' : 'iOS Safari'}
          </Badge>
        </div>

        {/* Row 2: Full-width concise description */}
        <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
          Use SpendSense offline and sync your changes when you&apos;re back online. Add to Home Screen in Safari.
        </p>

        {/* Guidance instructions */}
        <div className="p-2.5 bg-[var(--bg-surface-subtle)] rounded-lg border border-[var(--border-hairline)] text-[11px] text-[var(--text-secondary)] space-y-1.5 font-mono">
          <div className="flex items-center gap-2">
            <span className="text-[var(--text-primary)] font-bold">1.</span>
            <span>Tap the <strong>Share</strong> icon in Safari toolbar</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[var(--text-primary)] font-bold">2.</span>
            <span>Scroll down and select <strong>Add to Home Screen</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[var(--text-primary)] font-bold">3.</span>
            <span>Tap <strong>Add</strong> in the top right to complete</span>
          </div>
        </div>

        {/* Sync Status details */}
        {syncStatusSection}
      </div>
    );
  }

  // 4. Default Informational Card (Desktop or browser without pending prompt)
  return (
    <div
      data-testid="pwa-info-card"
      className="p-4 sm:p-5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] space-y-3"
    >
      {/* Row 1: Icon, Title, Status badge */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold text-xs shrink-0">
            ✓
          </div>
          <h3 className="text-xs font-semibold text-[var(--text-primary)] truncate">
            Offline Support
          </h3>
        </div>
        <Badge variant="connected" size="sm" dot>
          {isOfflineReady ? 'Offline Ready' : 'Enabled'}
        </Badge>
      </div>

      {/* Row 2: Full-width concise description */}
      <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
        Use SpendSense offline and sync your changes when you&apos;re back online.
      </p>

      {/* Browser Install Guidance when programmatic prompt is not exposed */}
      <div className="p-2.5 bg-[var(--bg-surface-subtle)] rounded-lg border border-[var(--border-hairline)] text-[11px] text-[var(--text-secondary)] space-y-1">
        <p className="font-semibold text-[var(--text-primary)]">
          {installOutcome === 'dismissed' ? 'Install SpendSense anytime' : 'Install SpendSense'}
        </p>
        <p className="leading-relaxed text-[var(--text-muted)]">
          To install on this device, tap the <strong>Install</strong> icon in your browser&apos;s address bar or open the browser menu and select <strong>Install app</strong> / <strong>Add to Home screen</strong>.
        </p>
      </div>

      {/* Sync Status details */}
      {syncStatusSection}
    </div>
  );
};
