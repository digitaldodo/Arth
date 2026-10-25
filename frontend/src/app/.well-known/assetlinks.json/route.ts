import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Serves the Android Digital Asset Links statement for Trusted Web Activity (TWA) verification.
 * Enables full-screen standalone PWA/TWA mode without the browser URL bar on Android devices.
 * Reads production signing certificate SHA-256 fingerprints from the ANDROID_RELEASE_CERT_SHA256
 * environment variable when configured in Vercel.
 */
export async function GET() {
  const envFingerprints = process.env.ANDROID_RELEASE_CERT_SHA256;
  const fingerprints: string[] = envFingerprints
    ? envFingerprints
        .split(',')
        .map((f) => f.trim().toUpperCase())
        .filter(Boolean)
    : [];

  const assetLinks = [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: 'com.digitaldodo.arth',
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];

  return NextResponse.json(assetLinks, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
