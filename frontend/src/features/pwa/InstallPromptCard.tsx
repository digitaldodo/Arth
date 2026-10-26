'use client';

import React, { useState, useSyncExternalStore } from 'react';
import { usePwaInstall } from './usePwaInstall';

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

export const InstallPromptCard: React.FC = () => {
  const { isStandalone, isInstallable, isInstalled, isIos, installApp } = usePwaInstall();
  const [isInstalling, setIsInstalling] = useState(false);
  const [installResult, setInstallResult] = useState<'accepted' | 'dismissed' | null>(null);

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

  // 1. Standalone / Already Installed
  if (isStandalone || isInstalled) {
    return (
      <div
        data-testid="pwa-installed-card"
        className="p-4 sm:p-5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] space-y-2"
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
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-100/70 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 border border-emerald-300/40 dark:border-emerald-700/40 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Installed
          </span>
        </div>

        {/* Row 2: Full-width concise description */}
        <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
          Use Arth offline and sync your changes when you&apos;re back online.
        </p>
      </div>
    );
  }

  // 2. Direct Install Prompt Available (Chromium, Edge, modern Android)
  if (isInstallable) {
    return (
      <div
        data-testid="pwa-installable-card"
        className="p-4 sm:p-5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] space-y-2.5"
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
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            {isOfflineReady ? 'Offline Ready' : 'Installable'}
          </span>
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
      </div>
    );
  }

  // 3. iOS / iPadOS Safari Manual Installation Guidance
  if (isIos) {
    return (
      <div
        data-testid="pwa-ios-card"
        className="p-4 sm:p-5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] space-y-2.5"
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
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] border border-[var(--border-hairline)] shrink-0">
            {isOfflineReady ? 'Offline Ready' : 'iOS Safari'}
          </span>
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
      </div>
    );
  }

  // 4. Default Informational Card (Desktop or browser without pending prompt)
  return (
    <div
      data-testid="pwa-info-card"
      className="p-4 sm:p-5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] space-y-2"
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
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          {isOfflineReady ? 'Offline Ready' : 'Enabled'}
        </span>
      </div>

      {/* Row 2: Full-width concise description */}
      <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
        Use Arth offline and sync your changes when you&apos;re back online.
      </p>
    </div>
  );
};
