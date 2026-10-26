import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

/**
 * GET /api/version
 * Returns the current production build version and timestamp for automatic PWA update checks.
 * Enforces strict no-cache headers.
 */
export async function GET() {
  let versionInfo = {
    version: '0.1.0',
    buildId: process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 7) || 'live',
    builtAt: new Date().toISOString(),
  };

  try {
    const versionPath = path.join(process.cwd(), 'public/version.json');
    if (fs.existsSync(versionPath)) {
      const data = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
      versionInfo = { ...versionInfo, ...data };
    }
  } catch {
    // Graceful fallback to default version info
  }

  return NextResponse.json(versionInfo, {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
    },
  });
}
