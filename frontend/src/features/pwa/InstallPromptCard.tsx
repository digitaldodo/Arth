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
  const { isStandalone, isInstallable, isInstalled, isIos, installApp } = usePwaInstall();
  const [isInstalling, setIsInstalling] = useState(false);
  const [installResult, setInstallResult] = useState<'accepted' | 'dismissed' | null>(null);
  const [syncState, setSyncState] = useState<SyncState>(() => syncEngine.getState());

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

  // Live Sync & Offline Status Section component
  const syncStatusSection = (
    <div className="pt-2 border-t border-[var(--border-hairline)] space-y-2">
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-[var(--text-secondary)]">Network:</span>
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

        <div className="flex items-center gap-2">
          {syncState.isSyncing ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-secondary)]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
              Syncing…
            </span>
          ) : syncState.pendingCount > 0 ? (
            <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
              {syncState.pendingCount} pending sync
            </span>
          ) : (
            <span className="text-[11px] text-[var(--text-muted)]">
              All changes synced
            </span>
          )}

          {syncState.pendingCount > 0 && (
            <button
              type="button"
              onClick={handleManualSync}
              disabled={syncState.isSyncing || !syncState.isOnline}
              className="px-2 py-0.5 text-[10px] font-semibold border border-[var(--border-subtle)] rounded text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            >
              Sync Now
            </button>
          )}
        </div>
      </div>

      {syncState.lastSyncedAt && (
        <div className="text-[10px] text-[var(--text-muted)] font-mono">
          Last synced:{' '}
          {new Date(syncState.lastSyncedAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })}
        </div>
      )}

      {syncState.lastError && (
        <div className="text-[10px] text-red-600 dark:text-red-400">
          Sync notice: {syncState.lastError}
        </div>
      )}
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
            Installed
          </Badge>
        </div>

        {/* Row 2: Full-width concise description */}
        <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
          Use Arth offline and sync your changes when you&apos;re back online.
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
          Use Arth offline and sync your changes when you&apos;re back online. Install on your device for standalone access.
        </p>

        {/* Action Button */}
        <div className="flex items-center gap-2 pt-0.5">
          <button
            type="button"
            data-testid="pwa-install-button"
            onClick={handleInstallClick}
            disabled={isInstalling}
            className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] hover:bg-[var(--action-primary-hover)] active:scale-[0.99] transition-all disabled:opacity-50 cursor-pointer shadow-xs"
          >
            {isInstalling ? 'Installing…' : 'Install on this Device'}
          </button>
          {installResult === 'dismissed' && (
            <span className="text-[11px] text-[var(--text-muted)]">
              Prompt dismissed. You can install anytime.
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
          Use Arth offline and sync your changes when you&apos;re back online. Add to Home Screen in Safari.
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
        Use Arth offline and sync your changes when you&apos;re back online.
      </p>

      {/* Sync Status details */}
      {syncStatusSection}
    </div>
  );
};
