'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArthLogo } from '@/components/brand/ArthLogo';
import { usePwaInstall } from '@/features/pwa/usePwaInstall';
import { useApkDownload } from '@/features/android/useApkDownload';
import type { AndroidReleaseInfo } from '@/lib/android-release-asset';

interface GetSpendSenseSectionProps {
  initialRelease?: AndroidReleaseInfo;
  compact?: boolean;
}

function formatBytesShort(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function GetSpendSenseSection({ initialRelease, compact = false }: GetSpendSenseSectionProps) {
  const {
    isHydrated,
    isStandalone,
    isInstallable,
    isInstalled,
    isInstalling,
    isIos,
    isIpad,
    isWindows,
    isAndroid,
    platform,
    browser,
    installOutcome,
    installError,
    installApp,
  } = usePwaInstall();

  const [release, setRelease] = useState<AndroidReleaseInfo | null>(initialRelease ?? null);
  const [endpointVerified, setEndpointVerified] = useState<boolean>(Boolean(initialRelease?.published));
  const [releaseCheckDone, setReleaseCheckDone] = useState<boolean>(Boolean(initialRelease));
  const [releaseReloadCount, setReleaseReloadCount] = useState(0);
  const [showBrowserFallback, setShowBrowserFallback] = useState(false);

  // Only Android devices verify the signed Android application release endpoint.
  const isAndroidDevice = isHydrated && isAndroid;

  useEffect(() => {
    if (!isAndroidDevice) return;

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/android/release', { cache: 'no-store' });
        const data = (await res.json()) as AndroidReleaseInfo;
        if (!res.ok || !data.published) {
          if (!cancelled) {
            setRelease(null);
            setEndpointVerified(false);
            setReleaseCheckDone(true);
          }
          return;
        }

        const downloadUrl = data.downloadUrl || '/api/android/download';
        const headRes = await fetch(downloadUrl, { method: 'HEAD', cache: 'no-store' });
        const contentType = (headRes.headers.get('content-type') || '').toLowerCase();
        const isBinaryApk =
          headRes.ok && contentType.includes('application/vnd.android.package-archive');

        if (!cancelled) {
          setRelease(isBinaryApk ? data : null);
          setEndpointVerified(isBinaryApk);
          setReleaseCheckDone(true);
        }
      } catch {
        if (!cancelled) {
          setRelease(null);
          setEndpointVerified(false);
          setReleaseCheckDone(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAndroidDevice, releaseReloadCount]);

  const apkAvailable = Boolean(isAndroidDevice && release?.published && endpointVerified);
  const apkDownload = useApkDownload({
    downloadUrl: release?.downloadUrl || '/api/android/download',
    fileName: release?.apkFileName || 'SpendSense.apk',
    available: apkAvailable,
  });

  const handleApkAnchorClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    void apkDownload.startDownload();
  };

  const isAlreadyInstalled = isHydrated && (isStandalone || isInstalled);

  const cardTitle = isAlreadyInstalled
    ? 'Already installed'
    : isIos
      ? 'Add SpendSense to Home Screen'
      : 'Install SpendSense';

  const platformBadge = !isHydrated
    ? 'Preparing option'
    : isAlreadyInstalled
      ? 'Ready to open'
      : isAndroidDevice
        ? apkAvailable && release?.version
          ? `Android · v${release.version}${release.apkSize ? ` (${release.apkSize})` : ''}`
          : 'Android Device'
        : isIos
          ? isIpad
            ? 'iPad · Safari'
            : 'iPhone · Safari'
          : isWindows
            ? 'Windows Desktop'
            : platform === 'macos'
              ? 'macOS Desktop'
              : platform === 'linux' || platform === 'chromeos'
                ? 'Desktop App'
                : 'Add to your device';

  const cardDescription = isAlreadyInstalled
    ? 'SpendSense is already installed.'
    : isAndroidDevice && apkAvailable
      ? 'Install the Android app for offline ledger access, fingerprint lock, and automatic notification capture.'
      : isAndroidDevice
        ? 'Add SpendSense directly from your Android browser for quick access to your financial ledger.'
        : isIos
          ? `Add SpendSense to your ${isIpad ? 'iPad' : 'iPhone'} Home Screen for quick, full-screen access.`
          : isWindows
            ? 'Install SpendSense on Windows to open it in its own application window and pin it to your Start menu or taskbar.'
            : 'Add SpendSense to your device for quick access from your home screen, dock, or application launcher.';

  const renderBrowserInstructions = () => {
    if (isIos) {
      return (
        <div
          data-testid="pwa-ios-instructions"
          className="p-3.5 rounded-[4px] bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] space-y-2 text-xs text-[var(--text-secondary)]"
        >
          <p className="font-semibold text-[var(--text-primary)]">
            Add SpendSense to your {isIpad ? 'iPad' : 'iPhone'} Home Screen
          </p>
          <ol className="space-y-1.5 font-mono text-[11px] leading-relaxed">
            <li>1. Open this page in <strong>Safari</strong> if you are viewing it in another browser.</li>
            <li>2. Tap the <strong>Share</strong> icon in the Safari toolbar.</li>
            <li>3. Scroll down and select <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.</li>
          </ol>
        </div>
      );
    }

    if (isWindows) {
      return (
        <div
          data-testid="pwa-windows-instructions"
          className="p-3.5 rounded-[4px] bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] space-y-1.5 text-xs text-[var(--text-secondary)]"
        >
          <p className="font-semibold text-[var(--text-primary)]">
            {browser === 'firefox'
              ? 'Use Microsoft Edge or Google Chrome on Windows'
              : 'Install from your browser menu'}
          </p>
          {browser === 'edge' ? (
            <p className="leading-relaxed">
              Click the <strong>App available</strong> icon in the Edge address bar, or open{' '}
              <strong>Settings and more (&hellip;) &rarr; Apps &rarr; Install this site as an app</strong>.
            </p>
          ) : browser === 'chrome' ? (
            <p className="leading-relaxed">
              Click the <strong>Install SpendSense</strong> icon in the Chrome address bar, or open{' '}
              <strong>Menu (&vellip;) &rarr; Cast, save, and share &rarr; Install page as app</strong>.
            </p>
          ) : (
            <p className="leading-relaxed">
              Open SpendSense in <strong>Microsoft Edge</strong> or <strong>Google Chrome</strong> on Windows to install
              it in its own application window and pin it to your Start menu or taskbar.
            </p>
          )}
        </div>
      );
    }

    if (isAndroidDevice) {
      return (
        <div
          data-testid="pwa-android-instructions"
          className="p-3.5 rounded-[4px] bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] space-y-1.5 text-xs text-[var(--text-secondary)]"
        >
          <p className="font-semibold text-[var(--text-primary)]">Add website to Home Screen</p>
          <p className="leading-relaxed">
            {browser === 'samsung'
              ? 'Tap the Menu (≡) or the Install icon in Samsung Internet and select Add page to → Home screen.'
              : browser === 'firefox'
                ? 'Open the Firefox menu (⋮) and choose Install or Add app to Home screen.'
                : 'Open your browser menu (⋮) and tap Install app or Add to Home screen.'}
          </p>
        </div>
      );
    }

    return (
      <div
        data-testid="pwa-desktop-instructions"
        className="p-3.5 rounded-[4px] bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] space-y-1.5 text-xs text-[var(--text-secondary)]"
      >
        <p className="font-semibold text-[var(--text-primary)]">Install from a supported browser</p>
        <p className="leading-relaxed">
          {browser === 'safari'
            ? 'In Safari on macOS, choose File → Add to Dock to launch SpendSense in its own application window.'
            : browser === 'firefox'
              ? 'Open SpendSense in Google Chrome, Microsoft Edge, or Safari (macOS) to install it as a standalone app.'
              : 'Click the Install icon in your browser address bar, or open the browser menu and select Install SpendSense.'}
        </p>
      </div>
    );
  };

  return (
    <section
      id="get-spendsense"
      aria-labelledby="get-spendsense-heading"
      className={compact ? 'mt-3 space-y-3' : 'mt-12 sm:mt-14 pt-10 border-t border-[var(--border-hairline)] space-y-6'}
    >
      {!compact ? (
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-[2px] bg-[var(--brand-evergreen-soft)] border border-[var(--brand-evergreen-border)] text-[10px] font-mono uppercase tracking-wider text-[var(--brand-evergreen-fg)]">
              <span>Add SpendSense to your device</span>
            </div>
            <h2
              id="get-spendsense-heading"
              className="text-2xl sm:text-3xl font-semibold tracking-[-0.02em] text-[var(--text-primary)]"
            >
              Get SpendSense
            </h2>
            <p className="text-sm sm:text-[15px] text-[var(--text-secondary)] leading-relaxed">
              Take SpendSense with you. Install it on your device for convenient access to your personal financial ledger.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-end shrink-0">
            <div className="h-10 w-10 rounded-[6px] bg-[var(--bg-surface)] border border-[var(--border-hairline)] flex items-center justify-center shrink-0">
              <ArthLogo variant="symbol" className="h-6 w-6 text-[var(--text-primary)]" />
            </div>
            <div className="text-[11px] font-mono text-[var(--text-muted)] leading-snug">
              <span className="block text-[var(--text-primary)] font-semibold">Official SpendSense</span>
              <span>Synced Ledger &middot; Offline Capable</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <h2
              id="get-spendsense-heading"
              className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)]"
            >
              Get SpendSense
            </h2>
            <span className="text-[10px] text-[var(--text-muted)]">Add to your device</span>
          </div>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            Take SpendSense with you. Install it on your device for convenient access to your personal financial ledger.
          </p>
        </div>
      )}

      {/* Unified Single Card Installation Experience */}
      <div className="max-w-2xl">
        <article
          data-testid={isAndroidDevice && apkAvailable && !isAlreadyInstalled ? 'landing-android-card' : 'landing-pwa-card'}
          className={`rounded-[6px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] border-t-2 border-t-[var(--brand-evergreen)] ${
            compact ? 'p-4' : 'p-5 sm:p-6'
          } flex flex-col justify-between gap-4 shadow-2xs`}
        >
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="h-9 w-9 rounded-[4px] bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] flex items-center justify-center shrink-0">
                  <ArthLogo variant="symbol" className="h-5 w-5 text-[var(--text-primary)]" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-[var(--text-primary)] leading-tight">
                    {cardTitle}
                  </h3>
                  <p className="text-[11px] font-mono text-[var(--text-muted)] mt-0.5 truncate">
                    {platformBadge}
                  </p>
                </div>
              </div>

              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] text-[10px] font-mono uppercase tracking-wider border ${
                  isAlreadyInstalled
                    ? 'bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border-[var(--status-success-border)]'
                    : 'bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] border-[var(--border-hairline)]'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isAlreadyInstalled
                      ? 'bg-[var(--income-dot)]'
                      : apkAvailable || isInstallable
                        ? 'bg-[var(--accent-emerald)]'
                        : 'bg-[var(--text-muted)]'
                  }`}
                />
                {!isHydrated
                  ? 'Checking device'
                  : isAlreadyInstalled
                    ? 'Already installed'
                    : isAndroidDevice
                      ? !releaseCheckDone
                        ? 'Checking release'
                        : apkAvailable
                          ? 'Android App'
                          : 'Browser Install'
                      : isInstallable
                        ? 'Ready to install'
                        : isIos
                          ? 'Safari Guide'
                          : 'Browser Install'}
              </span>
            </div>

            <p className="text-xs sm:text-[13px] text-[var(--text-secondary)] leading-relaxed">
              {cardDescription}
            </p>
          </div>

          <div className="space-y-3">
            {!isHydrated ? (
              <div className="p-3 rounded-[4px] bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] text-xs text-[var(--text-muted)]">
                Checking installation options for your device…
              </div>
            ) : isAlreadyInstalled ? (
              <div className="flex flex-wrap items-center gap-2.5">
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center min-h-[44px] px-5 py-2.5 rounded-[4px] bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] hover:bg-[var(--action-primary-hover)] text-[13px] font-semibold transition-colors"
                >
                  Open SpendSense &rarr;
                </Link>
              </div>
            ) : isAndroidDevice ? (
              <div className="space-y-3">
                {!releaseCheckDone ? (
                  <div className="p-3 rounded-[4px] bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] text-xs text-[var(--text-muted)]">
                    Verifying signed Android release…
                  </div>
                ) : apkAvailable ? (
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <a
                        href="/api/android/download"
                        onClick={handleApkAnchorClick}
                        aria-disabled={apkDownload.isDownloading}
                        data-testid="landing-android-apk-btn"
                        className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-[4px] text-[13px] font-semibold transition-colors cursor-pointer bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] hover:bg-[var(--action-primary-hover)] ${
                          apkDownload.isDownloading ? 'opacity-70 pointer-events-none' : ''
                        }`}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        <span>
                          {apkDownload.isDownloading
                            ? apkDownload.progressPercent !== null
                              ? `Downloading ${apkDownload.progressPercent}%…`
                              : `Downloading ${formatBytesShort(apkDownload.bytesReceived) || 'app'}…`
                            : 'Install SpendSense'}
                        </span>
                      </a>

                      <Link
                        href="/download"
                        className="inline-flex items-center justify-center min-h-[44px] px-3 py-2 rounded-[4px] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-transparent hover:border-[var(--border-hairline)] transition-colors"
                      >
                        Checksums &amp; SMS option &rarr;
                      </Link>
                    </div>

                    {release && (
                      <div className="text-[11px] font-mono text-[var(--text-muted)] bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] rounded-[4px] px-3 py-1.5 flex flex-wrap items-center justify-between gap-2">
                        <span>{release.apkFileName}</span>
                        <span>v{release.version}</span>
                      </div>
                    )}

                    {/* Discreet secondary browser-shortcut fallback (does not compete with primary install card) */}
                    <div className="pt-1 border-t border-[var(--border-hairline)]">
                      <button
                        type="button"
                        onClick={() => setShowBrowserFallback((prev) => !prev)}
                        className="text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline underline-offset-2 cursor-pointer"
                      >
                        Or add website to Home Screen
                      </button>

                      {showBrowserFallback && (
                        <div className="mt-2.5 space-y-2 p-3 rounded-[4px] bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)]">
                          <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                            Browser shortcuts open SpendSense directly in Chrome or Edge without Android notification capture or fingerprint app lock.
                          </p>
                          {isInstallable ? (
                            <button
                              type="button"
                              data-testid="landing-pwa-install-btn"
                              onClick={() => void installApp()}
                              disabled={isInstalling}
                              className="inline-flex items-center justify-center min-h-[38px] px-3.5 py-1.5 rounded-[4px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-primary)] hover:border-[var(--border-strong)] cursor-pointer disabled:opacity-60"
                            >
                              {isInstalling ? 'Adding…' : 'Add website to Home Screen'}
                            </button>
                          ) : (
                            renderBrowserInstructions()
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {isInstallable ? (
                      <button
                        type="button"
                        data-testid="landing-pwa-install-btn"
                        onClick={() => void installApp()}
                        disabled={isInstalling}
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-[4px] bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] hover:bg-[var(--action-primary-hover)] text-[13px] font-semibold transition-colors cursor-pointer disabled:opacity-60"
                      >
                        {isInstalling ? 'Installing…' : 'Install SpendSense'}
                      </button>
                    ) : (
                      renderBrowserInstructions()
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
                      <span data-testid="landing-apk-unavailable">
                        Direct Android installer is temporarily unavailable.
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setReleaseCheckDone(false);
                          setReleaseReloadCount((c) => c + 1);
                        }}
                        className="font-semibold text-[var(--text-primary)] underline underline-offset-2 cursor-pointer"
                      >
                        Retry release check
                      </button>
                    </div>
                  </div>
                )}

                {apkDownload.status === 'complete' && (
                  <p
                    data-testid="landing-apk-complete"
                    role="status"
                    className="text-xs text-[var(--status-success-fg)] bg-[var(--status-success-bg)] border border-[var(--status-success-border)] rounded-[4px] px-3 py-2"
                  >
                    Download complete: <strong>{apkDownload.downloadedFileName}</strong>. Open the file on your Android device to install.
                  </p>
                )}

                {apkDownload.status === 'failed' && apkDownload.errorMessage && (
                  <div
                    data-testid="landing-apk-error"
                    role="alert"
                    className="text-xs text-[var(--status-error-fg)] bg-[var(--status-error-bg)] border border-[var(--status-error-border)] rounded-[4px] px-3 py-2 flex flex-wrap items-center justify-between gap-2"
                  >
                    <span>{apkDownload.errorMessage}</span>
                    <button
                      type="button"
                      onClick={() => void apkDownload.startDownload()}
                      className="underline font-semibold cursor-pointer"
                    >
                      Retry
                    </button>
                  </div>
                )}
              </div>
            ) : isInstallable ? (
              <div className="space-y-2.5">
                <button
                  type="button"
                  data-testid="landing-pwa-install-btn"
                  onClick={() => void installApp()}
                  disabled={isInstalling}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-[4px] bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] hover:bg-[var(--action-primary-hover)] text-[13px] font-semibold transition-colors cursor-pointer disabled:opacity-60"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="3" y="4" width="18" height="14" rx="2" />
                    <path d="M12 8v6" />
                    <path d="m9 11 3 3 3-3" />
                    <path d="M8 21h8" />
                  </svg>
                  <span>{isInstalling ? 'Installing SpendSense…' : 'Install SpendSense'}</span>
                </button>

                {installOutcome === 'dismissed' && (
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Installation prompt dismissed. You can retry above or install anytime from your browser menu.
                  </p>
                )}
                {installError && (
                  <p className="text-[11px] text-[var(--status-error-fg)]" role="alert">
                    {installError}
                  </p>
                )}

                {isWindows && (
                  <details className="text-[11px] text-[var(--text-muted)]">
                    <summary className="cursor-pointer hover:text-[var(--text-secondary)]">
                      Browser menu instructions
                    </summary>
                    <div className="mt-2">{renderBrowserInstructions()}</div>
                  </details>
                )}
              </div>
            ) : (
              <div className="space-y-2.5">{renderBrowserInstructions()}</div>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}
