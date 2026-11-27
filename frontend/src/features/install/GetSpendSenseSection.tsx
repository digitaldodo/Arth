'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArthLogo } from '@/components/brand/ArthLogo';
import { usePwaInstall } from '@/features/pwa/usePwaInstall';
import { useApkDownload } from '@/features/android/useApkDownload';
import type { AndroidReleaseInfo } from '@/lib/android-release-asset';

interface GetSpendSenseSectionProps {
  initialRelease?: AndroidReleaseInfo;
}

function formatBytesShort(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function GetSpendSenseSection({ initialRelease }: GetSpendSenseSectionProps) {
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

  // Only Android devices need to check and verify the native Android APK release & binary endpoint.
  const showAndroidCard = isHydrated && isAndroid;

  useEffect(() => {
    if (!showAndroidCard) return;

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
  }, [showAndroidCard, releaseReloadCount]);

  const apkAvailable = Boolean(showAndroidCard && release?.published && endpointVerified);
  const apkDownload = useApkDownload({
    downloadUrl: release?.downloadUrl || '/api/android/download',
    fileName: release?.apkFileName || 'SpendSense.apk',
    available: apkAvailable,
  });

  const handleApkAnchorClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    void apkDownload.startDownload();
  };

  const pwaTitle = isIos
    ? 'Add SpendSense to Home Screen'
    : isAndroid
      ? 'Install SpendSense PWA'
      : 'Install SpendSense';

  const pwaPrimaryLabel = isWindows
    ? isInstalling
      ? 'Installing SpendSense on Windows…'
      : 'Install SpendSense on Windows'
    : isInstalling
      ? 'Installing SpendSense…'
      : 'Install SpendSense';

  const pwaBadgeLabel = !isHydrated
    ? 'Web App · PWA'
    : isStandalone
      ? 'Installed App'
      : isInstalled
        ? 'Installed'
        : isIos
          ? isIpad
            ? 'iPadOS · Safari'
            : 'iPhone · Safari'
          : isWindows
            ? 'Windows Desktop · PWA'
            : platform === 'macos'
              ? 'macOS · PWA'
              : platform === 'linux' || platform === 'chromeos'
                ? 'Desktop · PWA'
                : isAndroid
                  ? 'Android · PWA'
                  : 'Web App · PWA';

  const pwaDescription = isAndroid
    ? 'Install the lightweight web application from the browser. Instant launch, standalone display, and offline ledger access.'
    : isIos
      ? `Add SpendSense directly to your ${isIpad ? 'iPad' : 'iPhone'} Home Screen for full-screen standalone access.`
      : isWindows
        ? 'Install SpendSense as a standalone Windows desktop application through supported browsers such as Microsoft Edge and Google Chrome.'
        : 'Install SpendSense as an app on your device. Access it from your home screen, dock, or application launcher.';

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
              : 'Install via browser menu'}
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

    if (isAndroid) {
      return (
        <div
          data-testid="pwa-android-instructions"
          className="p-3.5 rounded-[4px] bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] space-y-1.5 text-xs text-[var(--text-secondary)]"
        >
          <p className="font-semibold text-[var(--text-primary)]">Install from your Android browser</p>
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
      className="mt-12 sm:mt-14 pt-10 border-t border-[var(--border-hairline)] space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-2 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-[2px] bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] text-[10px] font-mono uppercase tracking-wider text-[var(--text-secondary)]">
            <span>Apps &amp; Installation</span>
          </div>
          <h2
            id="get-spendsense-heading"
            className="text-2xl sm:text-3xl font-semibold tracking-[-0.02em] text-[var(--text-primary)]"
          >
            Get SpendSense
          </h2>
          <p className="text-sm sm:text-[15px] text-[var(--text-secondary)] leading-relaxed">
            Use SpendSense wherever you manage your money. Install the app on your device or keep using it in your browser.
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

      {/* Adaptive Grid: Two cards on Android (PWA + Verified Native APK); Single prominent PWA card on Desktop, iOS & Unknown */}
      <div className={`grid gap-4 ${showAndroidCard ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 max-w-2xl'}`}>
        {/* OPTION 1 — INSTALL SPENDSENSE PWA */}
        <article
          data-testid="landing-pwa-card"
          className="rounded-[6px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-5 sm:p-6 flex flex-col justify-between gap-5 shadow-2xs min-h-[220px]"
        >
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="h-9 w-9 rounded-[4px] bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] flex items-center justify-center shrink-0">
                  <ArthLogo variant="symbol" className="h-5 w-5 text-[var(--text-primary)]" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-[var(--text-primary)] leading-tight">
                    {pwaTitle}
                  </h3>
                  <p className="text-[11px] font-mono text-[var(--text-muted)] mt-0.5">
                    {pwaBadgeLabel}
                  </p>
                </div>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] text-[10px] font-mono uppercase tracking-wider border ${
                  isInstalled
                    ? 'bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border-[var(--status-success-border)]'
                    : 'bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] border-[var(--border-hairline)]'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isInstalled ? 'bg-[var(--income-dot)]' : isInstallable ? 'bg-emerald-500' : 'bg-[var(--text-muted)]'
                  }`}
                />
                {!isHydrated
                  ? 'Web App'
                  : isStandalone
                    ? 'Active App'
                    : isInstalled
                      ? 'Installed'
                      : isInstallable
                        ? 'Ready to Install'
                        : isIos
                          ? 'Safari Guide'
                          : 'Browser Install'}
              </span>
            </div>

            <p className="text-xs sm:text-[13px] text-[var(--text-secondary)] leading-relaxed">
              {pwaDescription}
            </p>

            {isHydrated && isWindows && (
              <p className="text-xs text-[var(--text-muted)] leading-relaxed border-l-2 border-[var(--border-subtle)] pl-3">
                Runs in its own app window and can be pinned to your Windows Start menu or taskbar.
              </p>
            )}
          </div>

          <div className="space-y-3">
            {!isHydrated ? (
              <div className="p-3 rounded-[4px] bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] text-xs text-[var(--text-muted)]">
                Checking browser installation support…
              </div>
            ) : isStandalone ? (
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="inline-flex items-center min-h-[44px] px-4 py-2 rounded-[4px] bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border border-[var(--status-success-border)] text-xs font-semibold">
                  Running as Installed SpendSense App
                </span>
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 rounded-[4px] bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] hover:bg-[var(--action-primary-hover)] text-xs font-semibold transition-colors"
                >
                  Open SpendSense &rarr;
                </Link>
              </div>
            ) : isInstalled ? (
              <div className="space-y-2.5">
                <div className="p-3 rounded-[4px] bg-[var(--status-success-bg)] border border-[var(--status-success-border)] text-xs text-[var(--status-success-fg)]">
                  SpendSense is installed on this device. Open it from your{' '}
                  {isWindows ? 'Windows Start menu, taskbar, or browser apps' : 'home screen or app launcher'}.
                </div>
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 rounded-[4px] bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] hover:bg-[var(--action-primary-hover)] text-xs font-semibold transition-colors"
                >
                  Open App &rarr;
                </Link>
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
                  <span>{pwaPrimaryLabel}</span>
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
              </div>
            ) : (
              <div className="space-y-2.5">{renderBrowserInstructions()}</div>
            )}

            {isHydrated && isWindows && !isInstalled && isInstallable && (
              <details className="text-[11px] text-[var(--text-muted)]">
                <summary className="cursor-pointer hover:text-[var(--text-secondary)]">
                  Browser menu fallback instructions
                </summary>
                <div className="mt-2">{renderBrowserInstructions()}</div>
              </details>
            )}
          </div>
        </article>

        {/* OPTION 2 — DOWNLOAD SPENDSENSE ANDROID (Rendered ONLY on Android phones & tablets) */}
        {showAndroidCard && (
          <article
            data-testid="landing-android-card"
            className="rounded-[6px] bg-[var(--bg-surface)] border border-[var(--border-hairline)] p-5 sm:p-6 flex flex-col justify-between gap-5 shadow-2xs min-h-[220px]"
          >
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="h-9 w-9 rounded-[4px] bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] flex items-center justify-center shrink-0 text-[var(--text-primary)]">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <rect x="6" y="4" width="12" height="16" rx="2" />
                      <path d="M10 17h4" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-[var(--text-primary)] leading-tight">
                      Download SpendSense Android
                    </h3>
                    <p className="text-[11px] font-mono text-[var(--text-muted)] mt-0.5">
                      Native APK &middot; Android 8.0+
                    </p>
                  </div>
                </div>

                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] text-[10px] font-mono uppercase tracking-wider border ${
                    !releaseCheckDone
                      ? 'bg-[var(--bg-surface-subtle)] text-[var(--text-muted)] border-[var(--border-hairline)]'
                      : apkAvailable
                        ? 'bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] border-[var(--border-hairline)]'
                        : 'bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)] border-[var(--status-warning-border)]'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      !releaseCheckDone
                        ? 'bg-[var(--text-muted)]'
                        : apkAvailable
                          ? 'bg-[var(--income-dot)]'
                          : 'bg-amber-500'
                    }`}
                  />
                  {!releaseCheckDone
                    ? 'Verifying Release'
                    : apkAvailable
                      ? `v${release?.version} · ${release?.apkSize || 'APK'}`
                      : 'Unavailable'}
                </span>
              </div>

              <p className="text-xs sm:text-[13px] text-[var(--text-secondary)] leading-relaxed">
                Download the actual signed <code className="font-mono">.apk</code> file for native Android features,
                biometric app lock, and supported transaction capture.
              </p>

              {apkAvailable && release && (
                <div className="text-[11px] font-mono text-[var(--text-muted)] bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] rounded-[4px] px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                  <span>{release.apkFileName}</span>
                  <span>{release.applicationId}</span>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2.5">
                {!releaseCheckDone ? (
                  <span className="inline-flex items-center justify-center min-h-[44px] px-5 py-2.5 rounded-[4px] bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] text-xs font-medium text-[var(--text-muted)]">
                    Verifying Android APK release…
                  </span>
                ) : apkAvailable ? (
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
                          : `Downloading ${formatBytesShort(apkDownload.bytesReceived) || 'APK'}…`
                        : 'Download for Android'}
                    </span>
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setReleaseCheckDone(false);
                      setReleaseReloadCount((c) => c + 1);
                    }}
                    className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 rounded-[4px] bg-[var(--bg-surface-subtle)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--border-strong)] cursor-pointer"
                  >
                    Retry Release Check
                  </button>
                )}

                <Link
                  href="/download"
                  className="inline-flex items-center justify-center min-h-[44px] px-3.5 py-2 rounded-[4px] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-transparent hover:border-[var(--border-hairline)] transition-colors"
                >
                  Checksums &amp; SMS Helper &rarr;
                </Link>
              </div>

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

              {releaseCheckDone && !apkAvailable && (
                <p data-testid="landing-apk-unavailable" className="text-xs text-[var(--text-muted)]">
                  Signed Android APK release is temporarily unavailable. You can install the SpendSense PWA or retry checking the release above.
                </p>
              )}
            </div>
          </article>
        )}
      </div>
    </section>
  );
}
