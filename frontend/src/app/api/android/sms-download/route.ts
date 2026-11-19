import { downloadVerifiedReleaseAsset } from '@/lib/android-release-asset';

export async function GET() {
  return downloadVerifiedReleaseAsset({
    fileName: 'SpendSense-SMS.apk',
    checksumFileName: 'SpendSense-SMS.apk.sha256',
    metadataChecksumKey: 'smsApkSha256',
  });
}
