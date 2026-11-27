'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArthLogo } from '@/components/brand/ArthLogo';
import { useStandalonePwa } from '@/features/pwa/useStandalonePwa';
import { usePwaInstall } from '@/features/pwa/usePwaInstall';
import { useApkDownload } from '@/features/android/useApkDownload';
import type { AndroidReleaseInfo } from '@/app/api/android/release/route';

interface DownloadClientProps {
  initialRelease: AndroidReleaseInfo;
}

type PreviewTabId = 'dashboard' | 'ledger' | 'quickadd' | 'categories' | 'capture';
type GuideTabId = 'standard' | 'sms' | 'verify';

const PREVIEW_SCREENS: Array<{
  id: PreviewTabId;
  label: string;
  screenTitle: string;
  composeModule: string;
  summary: string;
  verifiedCapabilities: string[];
}> = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    screenTitle: 'Financial Overview',
    composeModule: 'DashboardScreen.kt',
    summary:
      'Displays total available balance, Cash vs Online split, Net Cash Flow, income/expense summary cards, necessity discipline bar, spending composition, and pending captured-alert banners.',
    verifiedCapabilities: [
      'This Month, 30D, and Lifetime period selectors',
      'Honest sync status & Cached / Offline resilience via Room v4',
      'Pending notification/SMS review banner deep-link',
    ],
  },
  {
    id: 'ledger',
    label: 'Transaction Ledger',
    screenTitle: 'Searchable & Filterable Ledger',
    composeModule: 'LedgerScreen.kt',
    summary:
      'Searchable, filterable chronological ledger with dual-encoded income/expense figures, payment badges, necessity tags, detail sheet inspection, and soft delete.',
    verifiedCapabilities: [
      'Filter pills: All, Expense, Income, Cash, Online, Essential, Optional, Luxury',
      'Instant search across counterparty, category, and notes',
      'Bank CSV / Text statement import entry point',
    ],
  },
  {
    id: 'quickadd',
    label: 'Quick Add',
    screenTitle: 'Quick Transaction Entry Sheet',
    composeModule: 'QuickAddSheet.kt',
    summary:
      'Streamlined modal bottom sheet for rapid Expense/Income recording using tabular INR numeric input, category chips, Online/Cash toggle, and necessity classifier.',
    verifiedCapabilities: [
      'Adaptive form hides Necessity tier automatically for Income',
      'On-device category suggestion engine with confidence score',
      'Unsaved-change confirmation guard before dismissal',
    ],
  },
  {
    id: 'categories',
    label: 'Categories',
    screenTitle: 'Category Taxonomy Manager',
    composeModule: 'CategoriesScreen.kt',
    summary:
      'Clean taxonomy manager split into Expense and Income tabs, pre-seeded with canonical SpendSense defaults and support for custom user categories.',
    verifiedCapabilities: [
      'Canonical Expense & Income defaults synced with web Supabase schema',
      'Create custom categories or delete non-system categories',
      'Respects server-synced sort order across quick entry',
    ],
  },
  {
    id: 'capture',
    label: 'Capture & Review',
    screenTitle: 'Automatic Capture & Review Queue',
    composeModule: 'SmsSettingsScreen.kt + SmsReviewScreen.kt',
    summary:
      'Consent-driven local transaction capture from supported banking/payment notifications, Android Share Sheet snippets, or optional signed installer inbox SMS.',
    verifiedCapabilities: [
      'Strict on-device parsing; raw payloads are discarded after extraction',
      'Review queue with Edit, Duplicate warning, Confirm, and Dismiss',
      'Per-source notification allowlist + Share-to-SpendSense fallback',
    ],
  },
];

const VERIFIED_FEATURES: Array<{ code: string; title: string; detail: string }> = [
  {
    code: '01',
    title: 'Personal financial ledger',
    detail:
      'Exact integer-paise INR math formatted in Indian numbering with dual-encoded income/expense indicators and necessity tiers.',
  },
  {
    code: '02',
    title: 'Offline transaction support',
    detail:
      'Local Room database with background WorkManager outbox sync preserves entries offline and reconciles with your account.',
  },
  {
    code: '03',
    title: 'Automatic transaction capture',
    detail:
      'Opt-in capture reads eligible banking/UPI/Messages notifications locally, with optional SMS inbox capture via SpendSense Installer.',
  },
  {
    code: '04',
    title: 'Explicit transaction review',
    detail:
      'Captured alerts land in an unconfirmed review queue with UTR/amount duplicate checks so nothing enters your ledger silently.',
  },
  {
    code: '05',
    title: 'Secure account synchronization',
    detail:
      'Biometric & device-credential app lock, encrypted local token storage, and end-to-end HTTPS sync to your SpendSense backend.',
  },
  {
    code: '06',
    title: 'Financial summaries & reports',
    detail:
      'Track Cash vs Online balances, People & Debt settlements, and export printable PDF financial statements directly on device.',
  },
];

export function DownloadClient({ initialRelease }: DownloadClientProps) {
  const [release, setRelease] = useState<AndroidReleaseInfo>(initialRelease);
  const [releaseReloadNonce, setReleaseReloadNonce] = useState(0);
  const [copiedKey, setCopiedKey] = useState<'apk' | 'installer' | 'sms' | null>(null);
  const [activePreview, setActivePreview] = useState<PreviewTabId>('dashboard');
  const [activeGuide, setActiveGuide] = useState<GuideTabId>('standard');

  const isStandalonePwa = useStandalonePwa();
  const {
    isInstallable: isPwaInstallable,
    isInstalled: isPwaInstalled,
    isInstalling: isPwaInstalling,
    isWindows,
    isIos,
    installApp,
  } = usePwaInstall();

  const standardDownload = useApkDownload({
    downloadUrl: '/api/android/download',
    fileName: release.apkFileName || 'SpendSense.apk',
    available: release.published,
  });

  const installerDownload = useApkDownload({
    downloadUrl: release.installerDownloadUrl || '/api/android/installer-download',
    fileName: release.installerFileName || 'SpendSense-Installer.apk',
    available: Boolean(release.published && release.installerDownloadUrl),
  });

  const smsDownload = useApkDownload({
    downloadUrl: release.smsDownloadUrl || '/api/android/sms-download',
    fileName: release.smsApkFileName || 'SpendSense-SMS.apk',
    available: Boolean(release.published && release.smsDownloadUrl),
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/android/release', { cache: 'no-store' });
        if (res.ok) {
          const data = (await res.json()) as AndroidReleaseInfo;
          if (!cancelled && data.version) {
            setRelease(data);
          }
        }
      } catch {
        // Retain initialRelease fallback metadata when offline or unpublished
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [releaseReloadNonce]);

  const handleCopyChecksum = async (value: string, key: 'apk' | 'installer' | 'sms') => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2500);
    } catch {
      // Clipboard unavailable in restricted context
    }
  };

  const selectedPreview = PREVIEW_SCREENS.find((item) => item.id === activePreview) ?? PREVIEW_SCREENS[0];

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] flex flex-col justify-between selection:bg-[var(--action-primary-bg)] selection:text-[var(--action-primary-fg)] transition-colors">
      {/* Top Header aligned with SpendSense Ledger Minimal */}
      <header className="sticky top-0 z-30 glass-nav border-b border-[var(--border-hairline)]">
        <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-2">
          <Link href="/" className="flex items-center gap-1.5 sm:gap-2 group shrink-0">
            <ArthLogo
              variant="full"
              className="h-6 w-auto text-[var(--text-primary)] group-hover:opacity-90 transition-opacity"
            />
            <span className="hidden min-[380px]:inline-flex text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-[2px] bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] border border-[var(--border-hairline)]">
              Android
            </span>
          </Link>
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            <Link
              href="/"
              className="text-xs sm:text-[13px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors px-2 sm:px-2.5 py-1.5 rounded-[3px] whitespace-nowrap"
            >
              &larr; Web App
            </Link>
            <Link
              href="/login?mode=signup"
              className="text-xs sm:text-[13px] font-medium text-[var(--text-primary)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-subtle)] border border-[var(--border-subtle)] transition-colors px-2.5 sm:px-3 py-1.5 rounded-[3px] whitespace-nowrap"
            >
              Sign Up
            </Link>
            <Link
              href="/login"
              className="hidden min-[420px]:inline-flex text-xs sm:text-[13px] font-medium px-2.5 sm:px-3 py-1.5 rounded-[3px] bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] transition-colors whitespace-nowrap"
            >
              Log In
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-12">
        {/* SECTION 1 — HERO */}
        <section className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-[6px] bg-[var(--bg-surface)] border border-[var(--border-hairline)] flex items-center justify-center shrink-0">
                <ArthLogo variant="symbol" className="h-7 w-7 text-[var(--text-primary)]" />
              </div>
              <div>
                <div className="text-[11px] font-mono uppercase tracking-widest text-[var(--text-muted)]">
                  Native Android Application · {release.applicationId}
                </div>
                <div className="text-xs font-mono text-[var(--text-secondary)]">
                  {release.published
                    ? `v${release.version} · Build ${release.buildNumber}`
                    : 'No published APK release detected in current environment'}
                </div>
              </div>
            </div>

            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[3px] text-[11px] font-mono bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-secondary)]">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  release.published ? 'bg-[var(--income-dot)]' : 'bg-[var(--text-muted)]'
                }`}
              />
              {release.published ? 'Verified Release Available' : 'Release Artifact Unavailable'}
            </span>
          </div>

          <div className="space-y-3">
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-[-0.025em] text-[var(--text-primary)] leading-[1.15]">
              Your finances. With you everywhere.
            </h1>
            <p className="text-[15px] sm:text-base text-[var(--text-secondary)] leading-relaxed max-w-2xl">
              Take SpendSense with you. Track transactions, manage your ledger and stay connected to your finances from
              your Android device.
            </p>
          </div>

          {/* Primary Action Bar — Only render APK download CTA when a valid release artifact is available */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3">
              {release.published ? (
                <a
                  href={'/api/android/download'}
                  onClick={(e) => {
                    e.preventDefault();
                    void standardDownload.startDownload();
                  }}
                  aria-disabled={standardDownload.isDownloading}
                  className={`inline-flex items-center justify-center gap-2.5 min-h-[44px] px-5 py-2.5 rounded-[4px] bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] hover:bg-[var(--action-primary-hover)] text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] cursor-pointer ${
                    standardDownload.isDownloading ? 'opacity-70 pointer-events-none' : ''
                  }`}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="17"
                    height="17"
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
                    {standardDownload.isDownloading
                      ? standardDownload.progressPercent !== null
                        ? `Downloading ${standardDownload.progressPercent}%…`
                        : 'Downloading APK…'
                      : 'Download for Android'}
                  </span>
                  {release.apkSize && (
                    <span className="text-[11px] font-mono font-normal opacity-80 border-l border-current/25 pl-2">
                      {release.apkSize}
                    </span>
                  )}
                </a>
              ) : (
                <div className="p-3.5 rounded-[4px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] flex-1 min-w-0 flex flex-wrap items-center justify-between gap-3">
                  <span>
                    <strong className="text-[var(--text-primary)] font-semibold">Release download unavailable:</strong>{' '}
                    No verified signed APK release artifact is currently reachable. Check connectivity or retry.
                  </span>
                  <button
                    type="button"
                    onClick={() => setReleaseReloadNonce((n) => n + 1)}
                    className="px-3 py-1.5 rounded-[3px] bg-[var(--bg-surface-subtle)] border border-[var(--border-subtle)] font-semibold text-[var(--text-primary)] cursor-pointer"
                  >
                    Retry
                  </button>
                </div>
              )}

              <Link
                href="/"
                className="inline-flex items-center justify-center min-h-[44px] px-4 rounded-[4px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[13px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] transition-colors"
              >
                Open SpendSense
              </Link>

              {isPwaInstallable && !isStandalonePwa && !isPwaInstalled && (
                <button
                  type="button"
                  onClick={() => void installApp()}
                  disabled={isPwaInstalling}
                  className="inline-flex items-center justify-center min-h-[44px] px-4 rounded-[4px] bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] text-[13px] font-medium text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-colors cursor-pointer disabled:opacity-60"
                >
                  {isPwaInstalling
                    ? 'Installing…'
                    : isWindows
                      ? 'Install SpendSense on Windows'
                      : 'Add to Home Screen'}
                </button>
              )}
            </div>

            {standardDownload.status === 'complete' && (
              <p
                role="status"
                className="text-xs text-[var(--status-success-fg)] bg-[var(--status-success-bg)] border border-[var(--status-success-border)] rounded-[4px] px-3 py-2"
              >
                Download complete: <strong>{standardDownload.downloadedFileName}</strong>.
              </p>
            )}

            {standardDownload.status === 'failed' && standardDownload.errorMessage && (
              <div
                role="alert"
                className="text-xs text-[var(--status-error-fg)] bg-[var(--status-error-bg)] border border-[var(--status-error-border)] rounded-[4px] px-3 py-2 flex flex-wrap items-center justify-between gap-2"
              >
                <span>{standardDownload.errorMessage}</span>
                <button
                  type="button"
                  onClick={() => void standardDownload.startDownload()}
                  className="underline font-semibold cursor-pointer"
                >
                  Retry Download
                </button>
              </div>
            )}
          </div>

          {/* Explicit Distinction: Native Android APK vs Browser Web / PWA */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="p-4 rounded-[4px] bg-[var(--bg-surface)] border border-[var(--border-hairline)] space-y-1.5">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
                Native Android APK · Android Phones
              </div>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                <strong className="text-[var(--text-primary)] font-semibold">Built for Android 8.0 (API 26)+</strong> in
                Kotlin &amp; Jetpack Compose. Supports Room offline storage, Biometric App Lock, and on-device financial
                notification / optional SMS capture.
              </p>
            </div>
            <div className="p-4 rounded-[4px] bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] space-y-1.5">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
                {isStandalonePwa ? 'Already installed' : 'Browser Installation'}
              </div>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                {isStandalonePwa
                  ? 'SpendSense is already installed on this device. The native Android download on this page installs the companion Android app with notification capture.'
                  : isIos
                    ? 'On iPhone and iPad, add SpendSense directly from Safari via Share → Add to Home Screen.'
                    : 'On Windows, macOS, Linux, and mobile browsers you can also install SpendSense directly from your browser without downloading an installer file.'}
              </p>
            </div>
          </div>

          {/* Optional Direct SMS Helper & SMS APK Banner (only when verified assets are published) */}
          {release.published && (release.installerDownloadUrl || release.smsDownloadUrl) && (
            <section
              className="rounded-[4px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 sm:p-5 space-y-4"
              aria-labelledby="sms-installer-title"
            >
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)]">
                    Optional Direct Variant · Inbox SMS Import
                  </p>
                  <h2 id="sms-installer-title" className="text-base font-semibold text-[var(--text-primary)]">
                    Install SMS-enabled build with SpendSense Installer
                  </h2>
                  <p className="text-xs leading-relaxed text-[var(--text-secondary)] max-w-2xl">
                    Android restricts <code className="font-mono">READ_SMS</code> and{' '}
                    <code className="font-mono">RECEIVE_SMS</code> for standard browser-downloaded APKs. The signed
                    helper verifies <code className="font-mono">SpendSense-SMS.apk</code> and allowlists only those two
                    permissions during Android&apos;s user-confirmed install session.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {release.installerDownloadUrl && (
                    <a
                      href={release.installerDownloadUrl}
                      onClick={(e) => {
                        e.preventDefault();
                        void installerDownload.startDownload();
                      }}
                      aria-disabled={installerDownload.isDownloading}
                      className={`inline-flex min-h-10 shrink-0 items-center justify-center rounded-[4px] border border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] px-4 py-2 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-canvas)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] cursor-pointer ${
                        installerDownload.isDownloading ? 'opacity-70 pointer-events-none' : ''
                      }`}
                    >
                      {installerDownload.isDownloading ? 'Downloading Installer…' : 'Download Installer'}
                      {release.installerSize && (
                        <span className="ml-2 text-[11px] font-mono font-normal text-[var(--text-muted)]">
                          {release.installerSize}
                        </span>
                      )}
                    </a>
                  )}
                  {release.smsDownloadUrl && (
                    <a
                      href={release.smsDownloadUrl}
                      onClick={(e) => {
                        e.preventDefault();
                        void smsDownload.startDownload();
                      }}
                      aria-disabled={smsDownload.isDownloading}
                      className={`inline-flex min-h-10 shrink-0 items-center justify-center rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] cursor-pointer ${
                        smsDownload.isDownloading ? 'opacity-70 pointer-events-none' : ''
                      }`}
                    >
                      {smsDownload.isDownloading ? 'Downloading SMS APK…' : 'Direct-SMS APK'}
                      {release.smsApkSize && (
                        <span className="ml-2 text-[11px] font-mono font-normal text-[var(--text-muted)]">
                          {release.smsApkSize}
                        </span>
                      )}
                    </a>
                  )}
                </div>
              </div>

              {(installerDownload.status === 'complete' || smsDownload.status === 'complete') && (
                <p
                  role="status"
                  className="text-xs text-[var(--status-success-fg)] bg-[var(--status-success-bg)] border border-[var(--status-success-border)] rounded-[4px] px-3 py-2"
                >
                  Downloaded{' '}
                  <strong>
                    {installerDownload.downloadedFileName || smsDownload.downloadedFileName}
                  </strong>
                  .
                </p>
              )}

              {(installerDownload.status === 'failed' || smsDownload.status === 'failed') && (
                <div
                  role="alert"
                  className="text-xs text-[var(--status-error-fg)] bg-[var(--status-error-bg)] border border-[var(--status-error-border)] rounded-[4px] px-3 py-2 flex flex-wrap items-center justify-between gap-2"
                >
                  <span>{installerDownload.errorMessage || smsDownload.errorMessage}</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (installerDownload.status === 'failed') void installerDownload.startDownload();
                      if (smsDownload.status === 'failed') void smsDownload.startDownload();
                    }}
                    className="underline font-semibold cursor-pointer"
                  >
                    Retry
                  </button>
                </div>
              )}

              {release.installerSha256 && (
                <details className="text-xs text-[var(--text-secondary)]">
                  <summary className="cursor-pointer font-medium text-[var(--text-primary)]">
                    Installer &amp; SMS package checksums
                  </summary>
                  <div className="mt-2 space-y-1.5 font-mono text-[11px] break-all">
                    <div>
                      <span className="text-[var(--text-muted)]">Installer SHA-256: </span>
                      {release.installerSha256}
                    </div>
                    {release.smsApkSha256 && (
                      <div>
                        <span className="text-[var(--text-muted)]">SMS APK SHA-256: </span>
                        {release.smsApkSha256}
                      </div>
                    )}
                  </div>
                </details>
              )}
            </section>
          )}
        </section>

        {/* SECTION 2 — GENUINE APP PREVIEW (Honest Native Screen Explorer) */}
        <section className="space-y-4 pt-4 border-t border-[var(--border-hairline)]" aria-labelledby="app-preview-heading">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)]">
                Native Jetpack Compose Architecture
              </p>
              <h2 id="app-preview-heading" className="text-xl font-semibold text-[var(--text-primary)] tracking-[-0.015em]">
                App Preview &amp; Core Screens
              </h2>
            </div>
            <span className="text-[11px] font-mono text-[var(--text-muted)]">
              Ledger Minimal · Warm Paper &amp; Obsidian Dark
            </span>
          </div>

          <div className="flex overflow-x-auto gap-1.5 pb-1 scrollbar-none" role="tablist" aria-label="Android app screens">
            {PREVIEW_SCREENS.map((screen) => {
              const active = screen.id === activePreview;
              return (
                <button
                  key={screen.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActivePreview(screen.id)}
                  className={`shrink-0 min-h-[38px] px-3 py-1.5 rounded-[3px] text-xs font-medium border transition-colors cursor-pointer ${
                    active
                      ? 'bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] border-[var(--action-primary-bg)]'
                      : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-hairline)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {screen.label}
                </button>
              );
            })}
          </div>

          <div className="rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--border-hairline)]">
              <div>
                <h3 className="text-base font-semibold text-[var(--text-primary)]">{selectedPreview.screenTitle}</h3>
                <p className="text-[11px] font-mono text-[var(--text-muted)]">{selectedPreview.composeModule}</p>
              </div>
              <span className="px-2 py-0.5 rounded-[2px] bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] text-[10px] font-mono uppercase tracking-wider text-[var(--text-secondary)]">
                Verified Native Screen
              </span>
            </div>

            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{selectedPreview.summary}</p>

            <ul className="grid gap-2 sm:grid-cols-3">
              {selectedPreview.verifiedCapabilities.map((item) => (
                <li
                  key={item}
                  className="p-3 rounded-[3px] bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] text-xs text-[var(--text-primary)] leading-relaxed"
                >
                  {item}
                </li>
              ))}
            </ul>

            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed pt-1 border-t border-[var(--border-hairline)]">
              Device screenshots are withheld until captured from a verified physical Android build; no simulated mockups
              or unrelated web screenshots are displayed here.
            </p>
          </div>
        </section>

        {/* SECTION 3 — VERIFIED CAPABILITIES */}
        <section className="space-y-4 pt-4 border-t border-[var(--border-hairline)]" aria-labelledby="features-heading">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)]">
              Built for Everyday Financial Discipline
            </p>
            <h2 id="features-heading" className="text-xl font-semibold text-[var(--text-primary)] tracking-[-0.015em]">
              What&apos;s Included on Android
            </h2>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {VERIFIED_FEATURES.map((feat) => (
              <div
                key={feat.code}
                className="p-4 rounded-[4px] bg-[var(--bg-surface)] border border-[var(--border-hairline)] space-y-1.5"
              >
                <div className="text-[10px] font-mono text-[var(--text-muted)]">{feat.code}</div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">{feat.title}</h3>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{feat.detail}</p>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION 4 — DOWNLOAD METADATA & INTEGRITY */}
        <section className="space-y-4 pt-4 border-t border-[var(--border-hairline)]" aria-labelledby="metadata-heading">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)]">
              Release Specification &amp; Checksums
            </p>
            <h2 id="metadata-heading" className="text-xl font-semibold text-[var(--text-primary)] tracking-[-0.015em]">
              Download Information
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="p-3 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-[4px]">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)]">Version</div>
              <div className="text-xs font-mono font-semibold text-[var(--text-primary)] mt-1 truncate">
                {release.published ? `v${release.version}` : 'Not published'}
              </div>
            </div>
            <div className="p-3 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-[4px]">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)]">Minimum OS</div>
              <div className="text-xs font-semibold text-[var(--text-primary)] mt-1 truncate">
                {release.minAndroidVersion}
              </div>
            </div>
            <div className="p-3 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-[4px]">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)]">Package ID</div>
              <div className="text-xs font-mono font-semibold text-[var(--text-primary)] mt-1 truncate">
                {release.applicationId}
              </div>
            </div>
            <div className="p-3 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-[4px]">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)]">Variant</div>
              <div className="text-xs font-semibold text-[var(--text-primary)] mt-1 truncate">
                {release.smsDownloadUrl ? 'Standard + SMS Helper' : 'Standard APK'}
              </div>
            </div>
            <div className="p-3 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-[4px]">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)]">File Size</div>
              <div className="text-xs font-mono font-semibold text-[var(--text-primary)] mt-1 truncate">
                {release.published && release.apkSize ? release.apkSize : '—'}
              </div>
            </div>
            <div className="p-3 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-[4px]">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)]">Release Date</div>
              <div className="text-xs font-mono font-semibold text-[var(--text-primary)] mt-1 truncate">
                {release.published && release.releaseDate ? release.releaseDate : '—'}
              </div>
            </div>
          </div>

          {release.published && release.highlights.length > 0 && (
            <div className="p-4 rounded-[4px] bg-[var(--bg-surface)] border border-[var(--border-hairline)] space-y-2.5">
              <h3 className="text-xs font-mono uppercase tracking-wider text-[var(--text-muted)]">Release Notes</h3>
              <ul className="space-y-1.5">
                {release.highlights.map((note, idx) => (
                  <li key={idx} className="text-xs text-[var(--text-secondary)] flex items-start gap-2 leading-relaxed">
                    <span className="font-mono text-[var(--text-muted)] shrink-0">0{idx + 1}</span>
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Checksums */}
          <div className="p-4 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-[4px] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-mono uppercase tracking-wider font-medium text-[var(--text-secondary)]">
                SHA-256 Package Checksum ({release.apkFileName})
              </span>
              <button
                type="button"
                onClick={() => void handleCopyChecksum(release.sha256, 'apk')}
                disabled={!release.published}
                className="inline-flex items-center gap-1.5 text-[11px] font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2.5 py-1 rounded-[2px] bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] transition-colors cursor-pointer disabled:opacity-50"
              >
                {copiedKey === 'apk' ? 'Copied' : 'Copy Checksum'}
              </button>
            </div>
            <div className="p-2.5 bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] rounded-[2px] font-mono text-[11px] text-[var(--text-primary)] break-all select-all">
              {release.published ? release.sha256 : 'Checksum appears automatically when a signed release is published.'}
            </div>
            {release.published && release.signingCertificateSha256 && (
              <p className="break-all font-mono text-[11px] text-[var(--text-secondary)]">
                Signing Certificate SHA-256: {release.signingCertificateSha256}
              </p>
            )}
          </div>
        </section>

        {/* SECTION 5 — INSTALLATION INSTRUCTIONS */}
        <section className="space-y-4 pt-4 border-t border-[var(--border-hairline)]" aria-labelledby="install-guide-heading">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)]">
              Transparent Sideload &amp; Permission Review
            </p>
            <h2 id="install-guide-heading" className="text-xl font-semibold text-[var(--text-primary)] tracking-[-0.015em]">
              Installation Instructions
            </h2>
          </div>

          <div className="flex flex-wrap border-b border-[var(--border-hairline)] text-xs font-medium gap-1">
            <button
              type="button"
              onClick={() => setActiveGuide('standard')}
              className={`pb-2.5 px-3 border-b-2 transition-colors cursor-pointer ${
                activeGuide === 'standard'
                  ? 'border-[var(--text-primary)] text-[var(--text-primary)] font-semibold'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              Standard APK (Notification &amp; Share)
            </button>
            <button
              type="button"
              onClick={() => setActiveGuide('sms')}
              className={`pb-2.5 px-3 border-b-2 transition-colors cursor-pointer ${
                activeGuide === 'sms'
                  ? 'border-[var(--text-primary)] text-[var(--text-primary)] font-semibold'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              Direct SMS Variant (Helper App)
            </button>
            <button
              type="button"
              onClick={() => setActiveGuide('verify')}
              className={`pb-2.5 px-3 border-b-2 transition-colors cursor-pointer ${
                activeGuide === 'verify'
                  ? 'border-[var(--text-primary)] text-[var(--text-primary)] font-semibold'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              Verify Checksum
            </button>
          </div>

          {activeGuide === 'standard' && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="p-4 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-[4px] space-y-1.5">
                  <div className="text-[10px] font-mono text-[var(--text-muted)]">STEP 01</div>
                  <h3 className="text-xs font-semibold text-[var(--text-primary)]">Download SpendSense.apk</h3>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    Use <strong>Download for Android</strong> above on your Android phone. This standard build requests{' '}
                    <strong>no SMS inbox permissions</strong> and supports Notification Capture + Share import.
                  </p>
                </div>
                <div className="p-4 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-[4px] space-y-1.5">
                  <div className="text-[10px] font-mono text-[var(--text-muted)]">STEP 02</div>
                  <h3 className="text-xs font-semibold text-[var(--text-primary)]">Confirm browser install prompt</h3>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    Open the downloaded APK. If Android prompts <em>Install unknown apps</em>, allow only your current
                    browser for this install — never disable Android security protections globally.
                  </p>
                </div>
                <div className="p-4 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-[4px] space-y-1.5">
                  <div className="text-[10px] font-mono text-[var(--text-muted)]">STEP 03</div>
                  <h3 className="text-xs font-semibold text-[var(--text-primary)]">Keep existing app for updates</h3>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    Always install signed updates over your existing SpendSense app so Android preserves your local Room
                    database and offline state.
                  </p>
                </div>
                <div className="p-4 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-[4px] space-y-1.5">
                  <div className="text-[10px] font-mono text-[var(--text-muted)]">STEP 04</div>
                  <h3 className="text-xs font-semibold text-[var(--text-primary)]">Android 13+ Restricted Settings</h3>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    If you enable optional Notification Capture on Android 13+, unlock it via{' '}
                    <strong>App Info &rarr; (&vellip;) &rarr; Allow restricted settings</strong>, then toggle only
                    desired banking/UPI/SMS sources inside SpendSense.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeGuide === 'sms' && (
            <div className="p-4 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-[4px] space-y-3">
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Android 10+ marks <code className="font-mono">READ_SMS</code> and{' '}
                <code className="font-mono">RECEIVE_SMS</code> as hard-restricted permissions. If you explicitly want
                on-device SMS inbox capture:
              </p>
              <ol className="grid gap-2 text-xs text-[var(--text-secondary)] sm:grid-cols-2 leading-relaxed">
                <li>
                  <strong className="text-[var(--text-primary)]">1. Install SpendSense Installer:</strong> Download the
                  separate signed helper (<code className="font-mono">SpendSense-Installer.apk</code>) when published.
                </li>
                <li>
                  <strong className="text-[var(--text-primary)]">2. Confirm verified install:</strong> The helper checks
                  package ID, certificate, and SHA-256, then opens Android&apos;s user-confirmed install prompt with
                  SMS permissions allowlisted.
                </li>
                <li>
                  <strong className="text-[var(--text-primary)]">3. Separate runtime consent:</strong> Inside
                  SpendSense, review the privacy disclosure and choose whether to grant runtime SMS access.
                </li>
                <li>
                  <strong className="text-[var(--text-primary)]">4. Review queue always required:</strong> Parsed alerts
                  never modify your ledger without explicit confirmation.
                </li>
              </ol>
            </div>
          )}

          {activeGuide === 'verify' && (
            <div className="p-4 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-[4px] space-y-3">
              <h3 className="text-xs font-semibold text-[var(--text-primary)]">Verify Package Integrity</h3>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Compare your downloaded file hash against the SHA-256 published above before installing:
              </p>
              <div className="space-y-2 font-mono text-[11px]">
                <div className="p-2.5 bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] rounded-[2px] text-[var(--text-primary)]">
                  <span className="text-[var(--text-muted)]"># Linux / macOS / Android Termux</span>
                  <br />
                  sha256sum {release.apkFileName}
                </div>
                <div className="p-2.5 bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] rounded-[2px] text-[var(--text-primary)]">
                  <span className="text-[var(--text-muted)]"># Windows PowerShell</span>
                  <br />
                  Get-FileHash {release.apkFileName} -Algorithm SHA256
                </div>
              </div>
            </div>
          )}

          <div className="p-4 rounded-[4px] bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] text-xs text-[var(--text-secondary)] leading-relaxed">
            <strong className="text-[var(--text-primary)] font-semibold">Privacy &amp; Scope Notice:</strong>{' '}
            {release.disclaimer}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-5 border-t border-[var(--border-hairline)] flex flex-wrap items-center justify-between gap-4 text-[11px] font-mono text-[var(--text-muted)]">
        <div className="flex flex-wrap items-center gap-4">
          <span>SpendSense &middot; Ledger Minimal</span>
          {release.githubReleaseUrl && (
            <a
              href={release.githubReleaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--text-primary)] underline-offset-4 hover:underline transition-colors"
            >
              GitHub Releases &rarr;
            </a>
          )}
          <Link href="/privacy" className="hover:text-[var(--text-primary)] underline-offset-4 hover:underline transition-colors">
            Privacy
          </Link>
        </div>
        <span>IST (Asia/Kolkata)</span>
      </footer>
    </div>
  );
}
