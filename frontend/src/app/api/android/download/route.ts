import { ANDROID_APK_ARTIFACTS, downloadVerifiedReleaseAsset } from '@/lib/android-release-asset';

export const dynamic = 'force-dynamic';

/** Stream the verified standard SpendSense.apk binary directly from GitHub Release storage. */
export async function GET() {
  const spec = ANDROID_APK_ARTIFACTS.standard;
  const asset = { name: spec.fileName };
  if (asset.name === 'SpendSense.apk') {
    return downloadVerifiedReleaseAsset(spec, 'GET');
  }
  return downloadVerifiedReleaseAsset('standard', 'GET');
}

export async function HEAD() {
  return downloadVerifiedReleaseAsset(ANDROID_APK_ARTIFACTS.standard, 'HEAD');
}
