import type { Metadata } from 'next';
import fs from 'node:fs';
import path from 'node:path';
import { DownloadClient } from './DownloadClient';
import type { AndroidReleaseInfo } from '@/app/api/android/release/route';

export const metadata: Metadata = {
  title: 'Take Arth with you — Download Native Android App',
  description:
    'Manage your finances with the official native Arth Android application. Built with Kotlin and Jetpack Compose for speed, offline-first reliability, and biometric app lock.',
  applicationName: 'Arth',
};

function getInitialRelease(): AndroidReleaseInfo {
  try {
    const filePath = path.join(process.cwd(), 'public', 'android', 'release.json');
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as AndroidReleaseInfo;
    }
  } catch {
    // Return fallback
  }

  return {
    version: '1.2.0',
    versionCode: 1003,
    buildNumber: 3,
    releaseDate: '2026-11-03',
    minAndroidVersion: 'Android 8.0 (API 26)',
    targetAndroidVersion: 'Android 15 (API 35)',
    apkFileName: 'Arth.apk',
    apkSize: '13.5 MB',
    downloadUrl: 'https://github.com/digitaldodo/Arth/releases/download/android-latest/Arth.apk',
    githubReleaseUrl: 'https://github.com/digitaldodo/Arth/releases/tag/android-latest',
    sha256: '181e5108ae27373c087ff4933f002646310f4990fe819669f98c422effb5b588',
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

export default function DownloadPage() {
  const initialRelease = getInitialRelease();
  return <DownloadClient initialRelease={initialRelease} />;
}
