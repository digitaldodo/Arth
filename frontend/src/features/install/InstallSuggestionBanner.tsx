'use client';

import React, { useEffect, useState } from 'react';
import { ArthLogo } from '@/components/brand/ArthLogo';
import { usePwaInstall } from '@/features/pwa/usePwaInstall';

const DISMISS_STORAGE_KEY = 'spendsense:install-banner-dismissed:v1';

/**
 * Calm, non-blocking installation suggestion rendered inside the authenticated workspace
 * when the browser can install SpendSense (or on iOS/iPadOS Safari) and the user hasn't
 * already installed or dismissed the prompt. Never requests notification permissions.
 */
export function InstallSuggestionBanner() {
  const {
    isHydrated,
    isStandalone,
    isInstalled,
    isInstallable,
    isInstalling,
    isIos,
    isIpad,
    isAndroid,
    browser,
    installApp,
  } = usePwaInstall();

  const [dismissed, setDismissed] = useState(true);
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(DISMISS_STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDismissed(stored === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  if (!isHydrated || dismissed || isStandalone || isInstalled) {
    return null;
  }

  const supportsGuidedAccess =
    isInstallable ||
    isIos ||
    isAndroid ||
    browser === 'chrome' ||
    browser === 'edge' ||
    browser === 'samsung';

  if (!supportsGuidedAccess) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_STORAGE_KEY, '1');
    } catch {
      // ignore storage failure
    }
  };

  const handlePrimaryAction = async () => {
    if (isInstallable) {
      const accepted = await installApp();
      if (accepted) {
        setDismissed(true);
      }
      return;
    }
    setShowInstructions((prev) => !prev);
  };

  return (
    <section
      data-testid="install-suggestion-banner"
      aria-label="Add SpendSense to home screen suggestion"
      className="mb-4 rounded-[6px] bg-[var(--bg-surface)] border border-[var(--border-hairline)] border-l-2 border-l-[var(--brand-evergreen)] p-3.5 sm:px-4 sm:py-3.5 space-y-2.5"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-[4px] bg-[var(--brand-evergreen-soft)] border border-[var(--brand-evergreen-border)] flex items-center justify-center shrink-0">
            <ArthLogo variant="symbol" className="h-4.5 w-4.5 text-[var(--brand-evergreen-fg)]" />
          </div>
          <div className="min-w-0 space-y-0.5">
            <h2 className="text-xs font-semibold text-[var(--text-primary)]">
              Make SpendSense easier to access
            </h2>
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
              Add SpendSense to your home screen for quick access whenever you need it.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            data-testid="install-suggestion-action"
            onClick={() => void handlePrimaryAction()}
            disabled={isInstalling}
            className="min-h-9 px-3.5 py-1.5 rounded-[4px] bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] hover:bg-[var(--action-primary-hover)] text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60"
          >
            {isInstalling ? 'Installing…' : 'Add to Home Screen'}
          </button>
          <button
            type="button"
            data-testid="install-suggestion-dismiss"
            onClick={handleDismiss}
            className="min-h-9 px-3 py-1.5 rounded-[4px] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] transition-colors cursor-pointer"
          >
            Not now
          </button>
        </div>
      </div>

      {showInstructions && !isInstallable && (
        <div className="p-2.5 rounded-[4px] bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] text-[11px] text-[var(--text-secondary)] leading-relaxed">
          {isIos
            ? `In Safari on your ${isIpad ? 'iPad' : 'iPhone'}, tap Share and choose Add to Home Screen.`
            : browser === 'edge'
              ? 'Click the App available icon in your Edge address bar, or open Settings and more (…) → Apps → Install this site as an app.'
              : 'Open your browser menu and choose Install SpendSense or Add to Home screen.'}
        </div>
      )}
    </section>
  );
}
