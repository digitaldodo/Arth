import type { Metadata } from 'next';
import { DownloadClient } from './DownloadClient';
import type { AndroidReleaseInfo } from '@/app/api/android/release/route';

export const metadata: Metadata = {
  title: 'Download Arth for Android',
  description: 'Download the official signed Arth Android application and verify its release checksum.',
  applicationName: 'Arth',
};

function getInitialRelease(): AndroidReleaseInfo {
  return {
    published: false,
    applicationId: 'com.digitaldodo.arth',
    version: '',
    versionCode: 0,
    buildNumber: 0,
    releaseDate: '',
    minAndroidVersion: 'Android 8.0 (API 26)',
    targetAndroidVersion: 'Android 15 (API 35)',
    apkFileName: 'Arth.apk',
    apkSize: '',
    downloadUrl: '/api/android/download',
    githubReleaseUrl: '',
    sha256: '',
    signingCertificateSha256: '',
    highlights: [],
    disclaimer: 'Release information is loading. The web app and installable PWA remain available independently.',
  };
}

export default function DownloadPage() {
  const initialRelease = getInitialRelease();
  return <DownloadClient initialRelease={initialRelease} />;
}
