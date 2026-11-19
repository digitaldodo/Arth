'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArthLogo } from '@/components/brand/ArthLogo';
import type { AndroidReleaseInfo } from '@/app/api/android/release/route';

interface DownloadClientProps {
  initialRelease: AndroidReleaseInfo;
}

export function DownloadClient({ initialRelease }: DownloadClientProps) {
  const [release, setRelease] = useState<AndroidReleaseInfo>(initialRelease);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'install' | 'verify'>('install');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/android/release');
        if (res.ok) {
          const data = (await res.json()) as AndroidReleaseInfo;
          if (!cancelled && data.version) {
            setRelease(data);
          }
        }
      } catch {
        // Retain initialRelease
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCopyChecksum = async () => {
    try {
      await navigator.clipboard.writeText(release.sha256);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] flex flex-col justify-between selection:bg-[var(--action-primary-bg)] selection:text-[var(--action-primary-fg)] transition-colors">
      {/* Top Header */}
      <header className="w-full max-w-4xl mx-auto px-6 py-5 flex items-center justify-between border-b border-[var(--border-hairline)]">
        <Link href="/" className="flex items-center gap-2 group">
          <ArthLogo
            variant="full"
            className="h-6 w-auto text-[var(--text-primary)] group-hover:opacity-90 transition-opacity"
          />
          <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-[2px] bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] border border-[var(--border-hairline)]">
            Android
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-[13px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors px-2.5 py-1.5 rounded-[3px]"
          >
            &larr; Web App
          </Link>
          <Link
            href="/login?mode=signup"
            className="text-[13px] font-medium text-[var(--text-primary)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-subtle)] border border-[var(--border-subtle)] transition-colors px-3 py-1.5 rounded-[3px] shadow-2xs"
          >
            Sign Up
          </Link>
          <Link
            href="/login"
            className="text-[13px] font-medium px-3 py-1.5 rounded-[3px] bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] transition-colors"
          >
            Log In
          </Link>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="w-full max-w-3xl mx-auto px-6 py-10 sm:py-14 space-y-10">
        {/* Hero Section */}
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-[var(--bg-surface-subtle)] border border-[var(--border-subtle)] flex items-center justify-center shadow-2xs">
              <ArthLogo variant="symbol" className="h-7 w-7 text-[var(--text-primary)]" />
            </div>
            <div>
              <div className="text-[11px] font-mono uppercase tracking-widest text-[var(--text-muted)]">
                Native Android Application
              </div>
              <div className="text-xs font-mono text-[var(--text-secondary)]">
                {release.published ? `v${release.version} · Build ${release.buildNumber}` : 'Release information unavailable'}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-[-0.025em] text-[var(--text-primary)] leading-[1.2]">
              Download SpendSense for Android.
            </h1>
            <p className="text-[15px] sm:text-[16px] text-[var(--text-secondary)] leading-relaxed max-w-xl">
              Install the native SpendSense application on an Android phone. This APK is distributed separately from the SpendSense web app and installable PWA.
            </p>

            {/* Dedicated Android Exclusivity Notice */}
            <div className="p-3.5 rounded-[4px] bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] flex items-start gap-3 text-xs text-[var(--text-secondary)]">
              <span className="w-2 h-2 rounded-full bg-[var(--income-fg)] shrink-0 mt-1" />
              <p className="leading-relaxed">
                <strong className="text-[var(--text-primary)] font-semibold">Intended for Android Phones:</strong> This native package (.apk) is built specifically for devices running Android 8.0 (Oreo, API 26) or higher. iOS (iPhone/iPad) and desktop users should use the official SpendSense web application or install the PWA.
              </p>
            </div>
          </div>

          {/* Primary Action Button Bar */}
          <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <a
              href={release.published ? '/api/android/download' : undefined}
              download={release.apkFileName || 'SpendSense.apk'}
              aria-disabled={!release.published}
              className={`inline-flex items-center justify-center gap-2.5 h-11 px-6 rounded-[4px] text-[14px] font-semibold transition-all shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${release.published ? 'bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] hover:bg-[var(--action-primary-hover)] active:scale-[0.99] cursor-pointer' : 'bg-[var(--bg-surface-subtle)] text-[var(--text-muted)] cursor-not-allowed'}`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>{release.published ? 'Download SpendSense for Android' : 'APK temporarily unavailable'}</span>
              {release.published && <span className="text-[11px] font-mono font-normal opacity-75 border-l border-current/25 pl-2 ml-0.5">{release.apkSize}</span>}
            </a>

            <Link href="/" className="inline-flex items-center justify-center h-11 px-4 rounded-[4px] bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[13px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Use SpendSense Web or PWA</Link>
          </div>

          {/* Metadata Specs Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3">
            <div className="p-3 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-[4px]">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
                Package
              </div>
              <div className="text-xs font-semibold text-[var(--text-primary)] mt-1 truncate">
                {release.published ? release.apkFileName : 'Not published'}
              </div>
            </div>
            <div className="p-3 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-[4px]">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
                Minimum OS
              </div>
              <div className="text-xs font-semibold text-[var(--text-primary)] mt-1 truncate">
                {release.minAndroidVersion}
              </div>
            </div>
            <div className="p-3 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-[4px]">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
                Release Date
              </div>
              <div className="text-xs font-semibold text-[var(--text-primary)] mt-1 truncate">
                {release.published ? release.releaseDate : '—'}
              </div>
            </div>
            <div className="p-3 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-[4px]">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
                Signature
              </div>
              <div className="text-xs font-semibold text-[var(--text-primary)] mt-1 flex items-center gap-1">
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${release.published ? 'bg-emerald-500' : 'bg-[var(--text-muted)]'}`} />
                {release.published ? 'Signed Release' : 'Unavailable'}
              </div>
            </div>
          </div>
        </div>

        {/* Sensitive Permissions & Play Protect Transparency Notice */}
        <div className="p-4 rounded-[4px] bg-[var(--bg-surface-subtle)] border border-[var(--border-subtle)] space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm">🛡️</span>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-primary)]">
              Privacy and Permission Scope
            </h3>
          </div>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            {release.disclaimer} Install updates over the existing SpendSense app; do not uninstall it, because Android preserves local data during a valid signed update.
          </p>
        </div>

        {/* SHA-256 Checksum Card */}
        <div className="p-4 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-[4px] space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider font-medium text-[var(--text-secondary)]">
              SHA-256 Checksum
            </span>
            <button
              type="button"
              onClick={handleCopyChecksum}
              disabled={!release.published}
              className="inline-flex items-center gap-1.5 text-[11px] font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2 py-0.5 rounded-[2px] bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] transition-colors cursor-pointer"
            >
              {copied ? (
                <>
                  <span className="text-emerald-500 font-bold">✓</span>
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  <span>Copy Checksum</span>
                </>
              )}
            </button>
          </div>
          <div className="p-2.5 bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] rounded-[2px] font-mono text-[11px] sm:text-[12px] text-[var(--text-primary)] break-all select-all">
            {release.published ? release.sha256 : 'Checksum is available when a release is published.'}
          </div>
        </div>

        {/* Tabbed Guide: Installation & Verification */}
        <div className="space-y-4">
          <div className="flex border-b border-[var(--border-hairline)] text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveTab('install')}
              className={`pb-2 px-3 border-b-2 transition-colors cursor-pointer ${
                activeTab === 'install'
                  ? 'border-[var(--text-primary)] text-[var(--text-primary)] font-semibold'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              Installation Steps
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('verify')}
              className={`pb-2 px-3 border-b-2 transition-colors cursor-pointer ${
                activeTab === 'verify'
                  ? 'border-[var(--text-primary)] text-[var(--text-primary)] font-semibold'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              Verify Checksum
            </button>
          </div>

          {activeTab === 'install' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="p-4 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-[4px] space-y-1.5">
                <div className="text-[10px] font-mono text-[var(--text-muted)]">STEP 01</div>
                <h4 className="text-xs font-semibold text-[var(--text-primary)]">Download APK</h4>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Tap <strong>Download for Android</strong> above to save the verified{' '}
                  <code className="text-[11px] font-mono">SpendSense.apk</code> file to your device.
                </p>
              </div>

              <div className="p-4 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-[4px] space-y-1.5">
                <div className="text-[10px] font-mono text-[var(--text-muted)]">STEP 02</div>
                <h4 className="text-xs font-semibold text-[var(--text-primary)]">Open Installer</h4>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Open the completed download from your browser tray or phone notification shade.
                </p>
              </div>

              <div className="p-4 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-[4px] space-y-1.5">
                <div className="text-[10px] font-mono text-[var(--text-muted)]">STEP 03</div>
                <h4 className="text-xs font-semibold text-[var(--text-primary)]">Enable Permission</h4>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  If Android displays <em>Install unknown apps</em>, tap <strong>Settings</strong> and
                  toggle <strong>Allow from this source</strong> ON.
                </p>
              </div>

              <div className="p-4 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-[4px] space-y-1.5">
                <div className="text-[10px] font-mono text-[var(--text-muted)]">STEP 04</div>
                  <h4 className="text-xs font-semibold text-[var(--text-primary)]">Install or Update</h4>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    Confirm the install or update in Android. Keep the existing app installed so Android can preserve its local data. Your account and cloud records remain available after signing in.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-[4px] space-y-3">
              <h4 className="text-xs font-semibold text-[var(--text-primary)]">
                Verify Package Integrity
              </h4>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                You can ensure that the downloaded APK has not been tampered with by verifying its
                cryptographic hash before installing:
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
        </div>

        {/* Feature Highlights */}
        <div className="space-y-3 pt-4 border-t border-[var(--border-hairline)]">
          <h3 className="text-xs font-mono uppercase tracking-wider text-[var(--text-muted)]">
            What&apos;s New
          </h3>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {release.highlights.map((highlight, idx) => (
              <div
                key={idx}
                className="p-3 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-[4px] flex items-start gap-2.5"
              >
                <span className="text-xs text-[var(--text-muted)] font-mono shrink-0 mt-0.5">
                  0{idx + 1}
                </span>
                <span className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  {highlight}
                </span>
              </div>
            ))}
          </div>
        </div>

        {release.published && <section className="space-y-2 border-t border-[var(--border-hairline)] pt-4">
          <h3 className="text-xs font-mono uppercase tracking-wider text-[var(--text-muted)]">Signing certificate</h3>
          <p className="break-all rounded-[2px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-2.5 font-mono text-[11px] text-[var(--text-secondary)]">SHA-256 · {release.signingCertificateSha256}</p>
          <p className="text-xs leading-relaxed text-[var(--text-secondary)]">Android checks the signing identity when an update is installed. Compare the APK checksum with this HTTPS release page to detect file changes.</p>
        </section>}
      </main>

      {/* Slim Minimal Footer */}
      <footer className="w-full max-w-4xl mx-auto px-6 py-5 border-t border-[var(--border-hairline)] flex flex-wrap items-center justify-between gap-4 text-[11px] font-mono text-[var(--text-muted)]">
        <div className="flex items-center gap-4">
          <span>SpendSense &middot; Ledger Minimal</span>
          <a
            href={release.githubReleaseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[var(--text-primary)] underline-offset-4 hover:underline transition-colors"
          >
            GitHub Releases &rarr;
          </a>
          <Link href="/privacy" className="hover:text-[var(--text-primary)] underline-offset-4 hover:underline transition-colors">Privacy</Link>
        </div>
        <span>IST (Asia/Kolkata)</span>
      </footer>
    </div>
  );
}
