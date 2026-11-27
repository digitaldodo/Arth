import type { Metadata } from 'next';
import { DownloadClient } from './DownloadClient';
import {
  getVerifiedAndroidReleaseMetadata,
  UNAVAILABLE_ANDROID_RELEASE,
} from '@/lib/android-release-asset';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Download SpendSense for Android',
  description: 'Download the official signed SpendSense Android application and verify its release checksum.',
  applicationName: 'SpendSense',
};

export default async function DownloadPage() {
  const result = await getVerifiedAndroidReleaseMetadata().catch(() => ({
    ok: false,
    status: 503,
    info: UNAVAILABLE_ANDROID_RELEASE,
  }));
  return <DownloadClient initialRelease={result.info} />;
}
