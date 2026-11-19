import { NextResponse } from 'next/server';

export interface AndroidReleaseInfo {
  published: boolean;
  applicationId: string;
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
  signingCertificateSha256: string;
  highlights: string[];
  disclaimer: string;
}

const unavailableRelease: AndroidReleaseInfo = {
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
  disclaimer: 'The current Android release details could not be loaded. Please try again shortly.',
};

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' };

export async function GET() {
  const repo = process.env.GITHUB_REPOSITORY || 'digitaldodo/Arth';
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return NextResponse.json(unavailableRelease, { status: 503, headers: noStoreHeaders });
  }

  try {
    const headers = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'Arth-Android-Release/1.0',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    const releaseResponse = await fetch(
      `https://api.github.com/repos/${repo}/releases/tags/android-latest`,
      { headers, cache: 'no-store' }
    );
    if (!releaseResponse.ok) {
      return NextResponse.json(unavailableRelease, { status: 503, headers: noStoreHeaders });
    }

    const release = await releaseResponse.json();
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const apkAsset = assets.find((asset: { name?: string }) => asset.name === 'Arth.apk');
    const metadataAsset = assets.find((asset: { name?: string }) => asset.name === 'release.json');
    const checksumAsset = assets.find((asset: { name?: string }) => asset.name === 'Arth.apk.sha256');
    if (!apkAsset?.id || !metadataAsset?.id || !checksumAsset?.id) {
      return NextResponse.json(unavailableRelease, { status: 503, headers: noStoreHeaders });
    }

    const assetHeaders = { ...headers, Accept: 'application/octet-stream' };
    const [metadataResponse, checksumResponse] = await Promise.all([
      fetch(`https://api.github.com/repos/${repo}/releases/assets/${metadataAsset.id}`, {
        headers: assetHeaders,
        cache: 'no-store',
      }),
      fetch(`https://api.github.com/repos/${repo}/releases/assets/${checksumAsset.id}`, {
        headers: assetHeaders,
        cache: 'no-store',
      }),
    ]);
    if (!metadataResponse.ok || !checksumResponse.ok) {
      return NextResponse.json(unavailableRelease, { status: 503, headers: noStoreHeaders });
    }

    const [metadataText, checksumText] = await Promise.all([
      metadataResponse.text(),
      checksumResponse.text(),
    ]);
    const metadata = JSON.parse(metadataText) as Partial<AndroidReleaseInfo>;
    const sha256 = checksumText.trim().split(/\s+/)[0];
    const certificateValue = metadata.signingCertificateSha256 || '';
    const certificateHex = certificateValue.replace(/:/g, '').toUpperCase();
    const signingCertificateSha256 = certificateHex.match(/.{2}/g)?.join(':') || '';
    if (
      metadata.published !== true ||
      metadata.applicationId !== 'com.digitaldodo.arth' ||
      !metadata.version ||
      !Number.isSafeInteger(metadata.versionCode) ||
      (metadata.versionCode || 0) <= 1005 ||
      !/^[a-f0-9]{64}$/i.test(sha256) ||
      !/^[a-f0-9]{64}$/i.test(certificateHex) ||
      !(/^([a-f0-9]{2}:){31}[a-f0-9]{2}$/i.test(certificateValue) || /^[a-f0-9]{64}$/i.test(certificateValue))
    ) {
      return NextResponse.json(unavailableRelease, { status: 503, headers: noStoreHeaders });
    }

    return NextResponse.json(
      {
        ...unavailableRelease,
        ...metadata,
        published: true,
        releaseDate: release.published_at?.slice(0, 10) || metadata.releaseDate || '',
        apkSize: `${(apkAsset.size / (1024 * 1024)).toFixed(1)} MB`,
        downloadUrl: '/api/android/download',
        githubReleaseUrl: release.html_url,
        sha256: sha256.toLowerCase(),
        signingCertificateSha256,
      } satisfies AndroidReleaseInfo,
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }
    );
  } catch {
    return NextResponse.json(unavailableRelease, { status: 503, headers: noStoreHeaders });
  }
}
