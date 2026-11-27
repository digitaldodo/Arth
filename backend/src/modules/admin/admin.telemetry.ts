import type { AdminReleaseMonitorDTO } from '@arth/contracts';

interface RequestSample {
  timestamp: number;
  durationMs: number;
  statusCode: number;
}

const MAX_SAMPLES = 500;
const samples: RequestSample[] = [];
const serverStartedAt = Date.now();
let authErrorsLast24h = 0;

export function recordApiSample(durationMs: number, statusCode: number, isAuthError = false): void {
  samples.push({
    timestamp: Date.now(),
    durationMs,
    statusCode,
  });
  if (isAuthError) authErrorsLast24h += 1;
  if (samples.length > MAX_SAMPLES) {
    samples.splice(0, samples.length - MAX_SAMPLES);
  }
}

export function getApiTelemetrySummary(): {
  uptimeSeconds: number;
  avgResponseMs: number;
  p95ResponseMs: number;
  errorRatePercent: number;
  authErrorsLast24h: number;
} {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const recent = samples.filter((s) => s.timestamp >= cutoff);
  if (recent.length === 0) {
    return {
      uptimeSeconds: Math.floor((Date.now() - serverStartedAt) / 1000),
      avgResponseMs: 0,
      p95ResponseMs: 0,
      errorRatePercent: 0,
      authErrorsLast24h,
    };
  }
  const durations = recent.map((s) => s.durationMs).sort((a, b) => a - b);
  const sum = durations.reduce((acc, v) => acc + v, 0);
  const p95Index = Math.min(durations.length - 1, Math.floor(durations.length * 0.95));
  const errors = recent.filter((s) => s.statusCode >= 500).length;

  return {
    uptimeSeconds: Math.floor((Date.now() - serverStartedAt) / 1000),
    avgResponseMs: Math.round(sum / durations.length),
    p95ResponseMs: Math.round(durations[p95Index] || 0),
    errorRatePercent: Number(((errors / recent.length) * 100).toFixed(2)),
    authErrorsLast24h,
  };
}

export async function fetchReadOnlyReleaseMonitor(): Promise<AdminReleaseMonitorDTO> {
  const generatedAt = new Date().toISOString();
  const repo = process.env.GITHUB_REPOSITORY || 'digitaldodo/Arth';
  const token = process.env.GITHUB_TOKEN;

  const baseFallback: AdminReleaseMonitorDTO = {
    generatedAt,
    webVersion: '0.1.0 (Next.js 16.4.6)',
    pwaVersion: 'v1 (Service Worker managed)',
    androidStandard: {
      published: false,
      version: '',
      apkFileName: 'SpendSense.apk',
      apkSize: '',
      sha256: '',
      minAndroidVersion: 'Android 8.0 (API 26)',
      targetAndroidVersion: 'Android 15 (API 35)',
      releaseDate: '',
    },
    androidDirectSms: {
      published: false,
      apkFileName: 'SpendSense-SMS.apk',
      apkSize: '',
      sha256: '',
      installerFileName: 'SpendSense-Installer.apk',
      installerSize: '',
      installerSha256: '',
    },
    releaseNotes: [],
    githubReleaseUrl: '',
    availabilityNote: token
      ? 'GitHub Release query returned no active verified release.'
      : 'GITHUB_TOKEN is not configured in local environment; GitHub Release artifact inspection unavailable.',
  };

  if (!token) return baseFallback;

  try {
    const headers = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'SpendSense-Admin-ReleaseMonitor/1.0',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    const relRes = await fetch(`https://api.github.com/repos/${repo}/releases/tags/android-latest`, {
      headers,
    });
    if (!relRes.ok) return baseFallback;
    const rel = (await relRes.json()) as {
      html_url?: string;
      published_at?: string;
      assets?: Array<{ name?: string; id?: number; size?: number }>;
    };
    const assets = Array.isArray(rel.assets) ? rel.assets : [];
    const metaAsset = assets.find((a) => a.name === 'release.json');
    if (!metaAsset?.id) return baseFallback;

    const metaRes = await fetch(`https://api.github.com/repos/${repo}/releases/assets/${metaAsset.id}`, {
      headers: { ...headers, Accept: 'application/octet-stream' },
    });
    if (!metaRes.ok) return baseFallback;
    const meta = (await metaRes.json()) as Record<string, unknown>;
    const formatSize = (bytes?: number) =>
      typeof bytes === 'number' ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : '';

    const apkAsset = assets.find((a) => a.name === 'SpendSense.apk');
    const smsAsset = assets.find((a) => a.name === 'SpendSense-SMS.apk');
    const instAsset = assets.find((a) => a.name === 'SpendSense-Installer.apk');

    return {
      generatedAt,
      webVersion: '0.1.0 (Next.js 16.4.6)',
      pwaVersion: 'v1 (Service Worker managed)',
      androidStandard: {
        published: meta.published === true,
        version: String(meta.version || ''),
        apkFileName: 'SpendSense.apk',
        apkSize: formatSize(apkAsset?.size),
        sha256: String(meta.sha256 || ''),
        minAndroidVersion: String(meta.minAndroidVersion || 'Android 8.0 (API 26)'),
        targetAndroidVersion: String(meta.targetAndroidVersion || 'Android 15 (API 35)'),
        releaseDate: String(meta.releaseDate || rel.published_at?.slice(0, 10) || ''),
      },
      androidDirectSms: {
        published: Boolean(smsAsset && meta.smsApkSha256),
        apkFileName: 'SpendSense-SMS.apk',
        apkSize: formatSize(smsAsset?.size),
        sha256: String(meta.smsApkSha256 || ''),
        installerFileName: 'SpendSense-Installer.apk',
        installerSize: formatSize(instAsset?.size),
        installerSha256: String(meta.installerSha256 || ''),
      },
      releaseNotes: Array.isArray(meta.highlights) ? meta.highlights.map(String) : [],
      githubReleaseUrl: rel.html_url || '',
      availabilityNote: 'Verified live read-only metadata from GitHub Releases (no signing or publishing actions enabled).',
    };
  } catch {
    return baseFallback;
  }
}
