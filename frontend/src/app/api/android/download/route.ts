import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Direct APK download route.
 * Dynamically resolves the latest published APK asset from GitHub Releases via
 * authenticated asset API (redirecting to the time-limited signed Amazon S3 URL),
 * or falls back cleanly to the verified public local APK asset.
 * Never redirects unauthenticated visitors to private GitHub repository release pages.
 */
export async function GET(request?: Request) {
  const repo = process.env.GITHUB_REPOSITORY || 'digitaldodo/Arth';
  const token = process.env.GITHUB_TOKEN;

  // 1. If GitHub token is configured in server environment, resolve latest release asset S3 URL
  if (token) {
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/releases/tags/android-latest`, {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'Arth-Web-Download/1.0',
          Authorization: `Bearer ${token}`,
        },
        next: { revalidate: 300 },
      });

      if (res.ok) {
        const data = await res.json();
        const apkAsset = data.assets?.find(
          (a: { name: string }) => a.name.endsWith('.apk') || a.name === 'Arth.apk'
        );

        if (apkAsset?.id) {
          // Request asset download stream/redirect URL using octet-stream
          const assetRes = await fetch(
            `https://api.github.com/repos/${repo}/releases/assets/${apkAsset.id}`,
            {
              headers: {
                Accept: 'application/octet-stream',
                'User-Agent': 'Arth-Web-Download/1.0',
                Authorization: `Bearer ${token}`,
              },
              redirect: 'manual',
            }
          );

          const s3Location = assetRes.headers.get('location');
          if (s3Location) {
            return NextResponse.redirect(s3Location, 302);
          }
        }
      }
    } catch {
      // Proceed to local fallback
    }
  }

  // 2. Direct public static asset fallback from web server
  const candidates = [
    path.join(process.cwd(), 'public', 'android', 'Arth.apk'),
    path.join(process.cwd(), 'frontend', 'public', 'android', 'Arth.apk'),
  ];
  const localApkPath = candidates.find((p) => fs.existsSync(p));

  if (localApkPath) {
    const origin = request?.url ? new URL(request.url).origin : 'http://localhost:3000';
    const directUrl = new URL('/android/Arth.apk', origin);
    return NextResponse.redirect(directUrl, 302);
  }

  return NextResponse.json(
    { error: 'No published APK available at this time.' },
    { status: 404 }
  );
}
