import { NextResponse } from 'next/server';

/** Resolve a private GitHub Release asset to its short-lived HTTPS download URL. */
export async function GET() {
  const repo = process.env.GITHUB_REPOSITORY || 'digitaldodo/Arth';
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return NextResponse.json({ error: 'The Android download service is temporarily unavailable.' }, { status: 503 });
  }

  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'User-Agent': 'Arth-Android-Release/1.0',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  try {
    const releaseResponse = await fetch(
      `https://api.github.com/repos/${repo}/releases/tags/android-latest`,
      { headers, cache: 'no-store' }
    );
    if (!releaseResponse.ok) {
      return NextResponse.json({ error: 'The current Android release is not available.' }, { status: 503 });
    }

    const release = await releaseResponse.json();
    const apkAsset = release.assets?.find((asset: { name?: string; id?: number }) => asset.name === 'Arth.apk');
    const metadataAsset = release.assets?.find((asset: { name?: string; id?: number }) => asset.name === 'release.json');
    if (!apkAsset?.id || !metadataAsset?.id) {
      return NextResponse.json({ error: 'The current Android package is not available.' }, { status: 503 });
    }

    const metadataResponse = await fetch(
      `https://api.github.com/repos/${repo}/releases/assets/${metadataAsset.id}`,
      { headers: { ...headers, Accept: 'application/octet-stream' }, cache: 'no-store' }
    );
    if (!metadataResponse.ok) {
      return NextResponse.json({ error: 'The Android release could not be verified.' }, { status: 503 });
    }
    const metadata = await metadataResponse.json();
    const certificate = metadata?.signingCertificateSha256;
    const certificateHex = typeof certificate === 'string' ? certificate.replace(/:/g, '') : '';
    if (
      metadata?.published !== true ||
      metadata?.applicationId !== 'com.digitaldodo.arth' ||
      !Number.isSafeInteger(metadata?.versionCode) ||
      metadata.versionCode <= 1005 ||
      !/^[a-f0-9]{64}$/i.test(certificateHex) ||
      !(/^([a-f0-9]{2}:){31}[a-f0-9]{2}$/i.test(certificate || '') || /^[a-f0-9]{64}$/i.test(certificate || ''))
    ) {
      return NextResponse.json({ error: 'The current Android release is not verified for distribution.' }, { status: 503 });
    }

    const assetResponse = await fetch(
      `https://api.github.com/repos/${repo}/releases/assets/${apkAsset.id}`,
      {
        headers: { ...headers, Accept: 'application/octet-stream' },
        redirect: 'manual',
        cache: 'no-store',
      }
    );
    if (assetResponse.status === 200 && assetResponse.body) {
      return new Response(assetResponse.body, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.android.package-archive',
          'Content-Disposition': 'attachment; filename="Arth.apk"',
          'Content-Length': String(apkAsset.size),
          'Cache-Control': 'private, no-store, max-age=0',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }
    const signedDownloadUrl = assetResponse.headers.get('location');
    if (assetResponse.status !== 302 || !signedDownloadUrl || !signedDownloadUrl.startsWith('https://')) {
      return NextResponse.json({ error: 'The Android package could not be prepared for download.' }, { status: 503 });
    }

    return NextResponse.redirect(signedDownloadUrl, {
      status: 302,
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  } catch {
    return NextResponse.json({ error: 'The Android download service is temporarily unavailable.' }, { status: 503 });
  }
}
