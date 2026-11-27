import { ANDROID_APK_ARTIFACTS, downloadVerifiedReleaseAsset } from '@/lib/android-release-asset';

export const dynamic = 'force-dynamic';

export async function GET() {
  return downloadVerifiedReleaseAsset(ANDROID_APK_ARTIFACTS.sms, 'GET');
}

export async function HEAD() {
  return downloadVerifiedReleaseAsset(ANDROID_APK_ARTIFACTS.sms, 'HEAD');
}
