import { NextResponse } from 'next/server';

type AssetSpec = {
  fileName: string;
  checksumFileName: string;
  metadataChecksumKey: 'smsApkSha256' | 'installerSha256';
};

const githubHeaders = (token: string, accept = 'application/vnd.github+json') => ({
  Accept: accept,
  Authorization: 'Bearer ' + token,
  'User-Agent': 'SpendSense-Android-Release/1.0',
  'X-GitHub-Api-Version': '2022-11-28',
});

export async function downloadVerifiedReleaseAsset(spec: AssetSpec) {
  const repo = process.env.GITHUB_REPOSITORY || 'digitaldodo/Arth';
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return NextResponse.json({ error: 'The Android download service is temporarily unavailable.' }, { status: 503 });
  }

  try {
    const headers = githubHeaders(token);
    const releaseResponse = await fetch(
      'https://api.github.com/repos/' + repo + '/releases/tags/android-latest',
      { headers, cache: 'no-store' }
    );
    if (!releaseResponse.ok) return unavailable();
    const release = await releaseResponse.json();
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const asset = assets.find((item: { name?: string }) => item.name === spec.fileName);
    const checksum = assets.find((item: { name?: string }) => item.name === spec.checksumFileName);
    const metadataAsset = assets.find((item: { name?: string }) => item.name === 'release.json');
    if (!asset?.id || !checksum?.id || !metadataAsset?.id || asset.size > 100 * 1024 * 1024) return unavailable();

    const binaryHeaders = githubHeaders(token, 'application/octet-stream');
    const [metadataResponse, checksumResponse] = await Promise.all([
      fetch('https://api.github.com/repos/' + repo + '/releases/assets/' + metadataAsset.id, {
        headers: binaryHeaders,
        cache: 'no-store',
      }),
      fetch('https://api.github.com/repos/' + repo + '/releases/assets/' + checksum.id, {
        headers: binaryHeaders,
        cache: 'no-store',
      }),
    ]);
    if (!metadataResponse.ok || !checksumResponse.ok) return unavailable();
    const metadata = await metadataResponse.json();
    const checksumText = await checksumResponse.text();
    const expectedChecksum = String(metadata?.[spec.metadataChecksumKey] || '').toLowerCase();
    const publishedChecksum = checksumText.trim().split(/\s+/)[0]?.toLowerCase();
    const certificate = String(metadata?.signingCertificateSha256 || '').replace(/:/g, '');
    if (
      metadata?.published !== true ||
      metadata?.applicationId !== 'com.digitaldodo.arth' ||
      !Number.isSafeInteger(metadata?.versionCode) ||
      metadata.versionCode <= 1005 ||
      !/^[a-f0-9]{64}$/.test(certificate) ||
      !/^[a-f0-9]{64}$/.test(expectedChecksum) ||
      expectedChecksum !== publishedChecksum
    ) return unavailable();

    const assetResponse = await fetch('https://api.github.com/repos/' + repo + '/releases/assets/' + asset.id, {
      headers: binaryHeaders,
      redirect: 'manual',
      cache: 'no-store',
    });
    const location = assetResponse.headers.get('location');
    if (assetResponse.status !== 302 || !location) return unavailable();
    const target = new URL(location);
    if (
      target.protocol !== 'https:' ||
      !['release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(target.hostname)
    ) return unavailable();
    return NextResponse.redirect(target, {
      status: 302,
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  } catch {
    return unavailable();
  }
}

function unavailable() {
  return NextResponse.json(
    { error: 'The verified Android release asset is temporarily unavailable.' },
    { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
}
