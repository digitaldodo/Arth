import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

export interface AndroidReleaseInfo {
  version: string;
  versionCode: number;
  buildNumber: number;
  releaseDate: string;
  minAndroidVersion: string;
  targetAndroidVersion: string;
  apkFileName: string;
  apkSize: string;
  downloadUrl: string;
  githubReleaseUrl: string;
  sha256: string;
  highlights: string[];
  disclaimer: string;
}

function getFallbackMetadata(): AndroidReleaseInfo {
  try {
    const filePath = path.join(process.cwd(), 'public', 'android', 'release.json');
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as AndroidReleaseInfo;
    }
  } catch {
    // Fall back to default constant
  }

  return {
    version: '1.2.0',
    versionCode: 1003,
    buildNumber: 3,
    releaseDate: '2026-11-03',
    minAndroidVersion: 'Android 8.0 (API 26)',
    targetAndroidVersion: 'Android 15 (API 35)',
    apkFileName: 'Arth.apk',
    apkSize: '8.4 MB',
    downloadUrl: 'https://github.com/digitaldodo/Arth/releases/download/android-latest/Arth.apk',
    githubReleaseUrl: 'https://github.com/digitaldodo/Arth/releases/tag/android-latest',
    sha256: '4b611ddf4fa5e3e29f3d6dbf4369a84497914040f7b0df0200ca16215c0e181d',
    highlights: [
      'Native Kotlin and Jetpack Compose interface adhering to the Arth Ledger Minimal design system',
      'Offline-first transaction management with local Room database and Supabase synchronization',
      'Biometric Fingerprint & Device Credential app lock with AndroidX BiometricPrompt',
      'Direct distribution build with zero sensitive SMS permissions for user privacy and security',
    ],
    disclaimer:
      'This direct APK release does not request or include SMS permissions. Financial transaction auto-detection from SMS is exclusive to the upcoming Google Play Store release.',
  };
}

export async function GET() {
  const fallback = getFallbackMetadata();

  try {
    // Attempt fetching the dynamic release asset metadata from GitHub
    const repo = process.env.GITHUB_REPOSITORY || 'digitaldodo/Arth';
    const res = await fetch(`https://api.github.com/repos/${repo}/releases/tags/android-latest`, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'Arth-Web-Download/1.0',
        ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      },
      next: { revalidate: 300 }, // 5-minute cache
    });

    if (res.ok) {
      const data = await res.json();
      const apkAsset = data.assets?.find(
        (a: { name: string }) => a.name.endsWith('.apk') || a.name === 'Arth.apk'
      );
      const shaAsset = data.assets?.find(
        (a: { name: string }) => a.name.endsWith('.sha256') || a.name === 'Arth.apk.sha256'
      );

      let sha256 = fallback.sha256;
      if (shaAsset?.browser_download_url) {
        try {
          const shaRes = await fetch(shaAsset.browser_download_url, { next: { revalidate: 300 } });
          if (shaRes.ok) {
            const shaText = await shaRes.text();
            const hash = shaText.trim().split(/\s+/)[0];
            if (hash && hash.length === 64) {
              sha256 = hash;
            }
          }
        } catch {
          // Keep fallback sha256
        }
      }

      const releaseDate = data.published_at ? data.published_at.slice(0, 10) : fallback.releaseDate;
      const sizeBytes = apkAsset?.size;
      const apkSize = sizeBytes ? `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB` : fallback.apkSize;
      const downloadUrl = apkAsset?.browser_download_url || fallback.downloadUrl;

      return NextResponse.json(
        {
          ...fallback,
          releaseDate,
          apkSize,
          downloadUrl,
          githubReleaseUrl: data.html_url || fallback.githubReleaseUrl,
          sha256,
        },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
          },
        }
      );
    }
  } catch {
    // Non-blocking fallback
  }

  return NextResponse.json(fallback, {
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  });
}
