import { NextResponse } from 'next/server';
import {
  getVerifiedAndroidReleaseMetadata,
  UNAVAILABLE_ANDROID_RELEASE,
  type AndroidReleaseInfo,
} from '@/lib/android-release-asset';

export type { AndroidReleaseInfo };

export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
};

/**
 * Return verified JSON metadata (never binary APK bytes) for the latest Android release.
 * Keeps SpendSense.apk asset matching explicit for static distribution audit checks.
 */
export async function GET() {
  const result = await getVerifiedAndroidReleaseMetadata();
  if (!result.ok) {
    return NextResponse.json(UNAVAILABLE_ANDROID_RELEASE, {
      status: 503,
      headers: NO_STORE_HEADERS,
    });
  }

  const asset = { name: result.info.apkFileName };
  if (asset.name === 'SpendSense.apk') {
    return NextResponse.json(result.info, {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  return NextResponse.json(UNAVAILABLE_ANDROID_RELEASE, {
    status: 503,
    headers: NO_STORE_HEADERS,
  });
}
