'use client';

import React, { useState, useEffect } from 'react';

const DEFAULT_APK_DOWNLOAD_URL =
  process.env.NEXT_PUBLIC_ANDROID_APK_URL ||
  'https://github.com/digitaldodo/Arth/releases/latest/download/Arth.apk';

const GITHUB_RELEASES_URL =
  'https://github.com/digitaldodo/Arth/releases';

const APK_VERSION = process.env.NEXT_PUBLIC_ANDROID_VERSION || 'v1.0.0';

export const AndroidDownloadCard: React.FC = () => {
  const [platform, setPlatform] = useState<'android' | 'ios' | 'desktop'>('desktop');
  const [showInstructions, setShowInstructions] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    const ua = navigator.userAgent || '';
    if (/android/i.test(ua)) {
      setPlatform('android');
    } else if (/iphone|ipad|ipod/i.test(ua)) {
      setPlatform('ios');
    } else {
      setPlatform('desktop');
    }
  }, []);

  const handleDownloadClick = () => {
    setIsDownloading(true);
    setDownloadError(null);

    try {
      // Direct browser navigation to triggering APK download
      window.location.href = DEFAULT_APK_DOWNLOAD_URL;
      setTimeout(() => {
        setIsDownloading(false);
      }, 2500);
    } catch {
      setIsDownloading(false);
      setDownloadError(
        'Unable to initiate download automatically. Please visit the GitHub Releases page to download the latest APK.'
      );
    }
  };

  // On iOS, users cannot install Android APKs; render a concise platform notice
  if (platform === 'ios') {
    return (
      <div
        data-testid="android-download-ios-notice"
        className="p-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] flex items-center justify-center text-[var(--text-muted)] text-sm">
            🤖
          </div>
          <div>
            <h3 className="text-xs font-semibold text-[var(--text-primary)]">
              Android APK Available
            </h3>
            <p className="text-[11px] text-[var(--text-muted)]">
              You are browsing from an iOS device. Use Safari&rsquo;s &ldquo;Add to Home Screen&rdquo; to install Arth.
            </p>
          </div>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] border border-[var(--border-hairline)]">
          iOS Device
        </span>
      </div>
    );
  }

  return (
    <div
      data-testid="android-download-card"
      className="p-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] space-y-3.5"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] flex items-center justify-center text-[var(--text-primary)] font-mono text-sm">
            🤖
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                Download Arth for Android
              </h3>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-xs bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] border border-[var(--border-hairline)] font-medium">
                {APK_VERSION} APK
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
              Install the Arth Android app for convenient access from your phone&rsquo;s home screen.
            </p>
          </div>
        </div>
      </div>

      {downloadError && (
        <div className="p-2.5 text-xs bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 rounded-md">
          {downloadError}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        <button
          type="button"
          data-testid="download-apk-button"
          onClick={handleDownloadClick}
          disabled={isDownloading}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] hover:bg-[var(--action-primary-hover)] active:scale-[0.99] transition-all disabled:opacity-50 cursor-pointer shadow-xs"
        >
          {isDownloading ? (
            <>
              <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
              <span>Starting Download…</span>
            </>
          ) : (
            <>
              <span>⬇</span>
              <span>Download APK</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() => setShowInstructions(!showInstructions)}
          className="px-3 py-2 text-xs font-medium rounded-lg border border-[var(--border-hairline)] hover:bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
        >
          {showInstructions ? 'Hide Instructions' : 'Installation Guide'}
        </button>

        <a
          href={GITHUB_RELEASES_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] underline underline-offset-2 transition-colors ml-auto"
        >
          View Releases &amp; Checksums &rarr;
        </a>
      </div>

      {/* Installation Instructions Accordion */}
      {showInstructions && (
        <div className="p-3.5 bg-[var(--bg-surface-subtle)] rounded-lg border border-[var(--border-hairline)] text-[11px] text-[var(--text-secondary)] space-y-2 animate-in fade-in duration-200">
          <div className="font-semibold text-[var(--text-primary)] flex items-center justify-between">
            <span>How to install on Android</span>
            <span className="text-[10px] font-normal text-[var(--text-muted)]">
              Package: com.digitaldodo.arth
            </span>
          </div>
          <ol className="list-decimal list-inside space-y-1.5 font-mono text-[10.5px]">
            <li>
              Tap <strong className="text-[var(--text-primary)]">Download APK</strong> to download <code className="text-[var(--text-primary)] font-bold">Arth.apk</code> to your device.
            </li>
            <li>
              Open the downloaded file from your browser downloads or Files app.
            </li>
            <li>
              If prompted with <em>&ldquo;For your security, your phone is not allowed to install unknown apps&rdquo;</em>, tap <strong className="text-[var(--text-primary)]">Settings</strong> and toggle on <strong className="text-[var(--text-primary)]">Allow from this source</strong>.
            </li>
            <li>
              Tap <strong className="text-[var(--text-primary)]">Install</strong> when the system installer appears.
            </li>
            <li>
              Launch <strong className="text-[var(--text-primary)]">Arth</strong> directly from your home screen or application drawer.
            </li>
          </ol>
          <div className="pt-1 border-t border-[var(--border-hairline)] flex items-center justify-between text-[10px] text-[var(--text-muted)]">
            <span>SHA-256 Checksum available with each release</span>
            <a
              href={`${DEFAULT_APK_DOWNLOAD_URL}.sha256`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--text-primary)] hover:underline"
            >
              Verify Checksum (.sha256)
            </a>
          </div>
        </div>
      )}
    </div>
  );
};
