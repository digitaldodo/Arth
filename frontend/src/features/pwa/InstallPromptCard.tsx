'use client';

import React, { useState } from 'react';
import { usePwaInstall } from './usePwaInstall';

export const InstallPromptCard: React.FC = () => {
  const { isStandalone, isInstallable, isInstalled, isIos, installApp } = usePwaInstall();
  const [isInstalling, setIsInstalling] = useState(false);
  const [installResult, setInstallResult] = useState<'accepted' | 'dismissed' | null>(null);

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
        className="p-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-mono text-sm">
            ✓
          </div>
          <div>
            <h3 className="text-xs font-semibold text-[var(--text-primary)]">
              Offline Support
            </h3>
            <p className="text-[11px] text-[var(--text-muted)]">
              Installed in standalone mode. Use Arth offline and synchronize your changes when you&apos;re back online.
            </p>
          </div>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100/60 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 border border-emerald-300/40 dark:border-emerald-700/40 shrink-0">
          Installed
        </span>
      </div>
    );
  }

  // 2. Direct Install Prompt Available (Chromium, Edge, modern Android)
  if (isInstallable) {
    return (
      <div
        data-testid="pwa-installable-card"
        className="p-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] space-y-3"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] flex items-center justify-center text-[var(--text-primary)] font-mono text-sm">
              📲
            </div>
            <div>
              <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                Offline Support
              </h3>
              <p className="text-[11px] text-[var(--text-muted)]">
                Use Arth offline and synchronize your changes when you&apos;re back online. Install on your device for standalone access.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            data-testid="pwa-install-button"
            onClick={handleInstallClick}
            disabled={isInstalling}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] hover:opacity-90 active:scale-[0.99] transition-all disabled:opacity-50 cursor-pointer shadow-xs"
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
        className="p-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] space-y-2.5"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] flex items-center justify-center text-[var(--text-primary)] text-sm">
            🍏
          </div>
          <div>
            <h3 className="text-xs font-semibold text-[var(--text-primary)]">
              Offline Support
            </h3>
            <p className="text-[11px] text-[var(--text-muted)]">
              Use Arth offline and synchronize your changes when you&apos;re back online. Add to Home Screen in Safari.
            </p>
          </div>
        </div>

        <div className="p-3 bg-[var(--bg-surface-subtle)] rounded-lg border border-[var(--border-hairline)] text-[11px] text-[var(--text-secondary)] space-y-1.5 font-mono">
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
      className="p-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] flex items-center justify-between"
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] flex items-center justify-center text-[var(--text-muted)] text-sm">
          📱
        </div>
        <div>
          <h3 className="text-xs font-semibold text-[var(--text-primary)]">
            Offline Support
          </h3>
          <p className="text-[11px] text-[var(--text-muted)]">
            Use Arth offline and synchronize your changes when you&apos;re back online. Install via your browser address bar or menu.
          </p>
        </div>
      </div>
      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] border border-[var(--border-hairline)] shrink-0">
        Offline Ready
      </span>
    </div>
  );
};
