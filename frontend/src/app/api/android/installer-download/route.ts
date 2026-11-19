import { downloadVerifiedReleaseAsset } from '@/lib/android-release-asset';

export async function GET() {
  return downloadVerifiedReleaseAsset({
    fileName: 'SpendSense-Installer.apk',
    checksumFileName: 'SpendSense-Installer.apk.sha256',
    metadataChecksumKey: 'installerSha256',
  });
}
