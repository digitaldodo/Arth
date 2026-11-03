import { NextResponse } from 'next/server';

export async function GET() {
  const repo = process.env.GITHUB_REPOSITORY || 'digitaldodo/Arth';
  let targetUrl = `https://github.com/${repo}/releases/download/android-latest/Arth.apk`;

  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases/tags/android-latest`, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'Arth-Web-Download/1.0',
        ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      },
      next: { revalidate: 300 },
    });

    if (res.ok) {
      const data = await res.json();
      const apkAsset = data.assets?.find(
        (a: { name: string }) => a.name.endsWith('.apk') || a.name === 'Arth.apk'
      );
      if (apkAsset?.browser_download_url) {
        targetUrl = apkAsset.browser_download_url;
      }
    }
  } catch {
    // Fall back to default direct tag URL
  }

  return NextResponse.redirect(targetUrl, 302);
}
