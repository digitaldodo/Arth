import { NextResponse } from 'next/server';

export const DEFAULT_GITHUB_REPOSITORY = 'digitaldodo/SpendSense1';
export const ANDROID_APPLICATION_ID = 'com.digitaldodo.arth';
export const MAX_APK_SIZE_BYTES = 100 * 1024 * 1024;
export const ANDROID_APK_MIME_TYPE = 'application/vnd.android.package-archive';

const ALLOWED_API_HOSTS = new Set(['api.github.com']);
const ALLOWED_ASSET_HOSTS = new Set([
  'release-assets.githubusercontent.com',
  'objects.githubusercontent.com',
  'github-releases.githubusercontent.com',
  'github.com',
]);

const RELEASE_BUNDLE_CACHE_TTL_MS = 60_000;
const UPSTREAM_TIMEOUT_MS = 10_000;

export type AndroidArtifactKind = 'standard' | 'sms' | 'installer';

export interface AndroidArtifactSpec {
  kind: AndroidArtifactKind;
  fileName: string;
  checksumFileName: string;
  metadataChecksumKey: 'sha256' | 'smsApkSha256' | 'installerSha256';
  routePath: string;
}

export const ANDROID_APK_ARTIFACTS: Record<AndroidArtifactKind, AndroidArtifactSpec> = {
  standard: {
    kind: 'standard',
    fileName: 'SpendSense.apk',
    checksumFileName: 'SpendSense.apk.sha256',
    metadataChecksumKey: 'sha256',
    routePath: '/api/android/download',
  },
  sms: {
    kind: 'sms',
    fileName: 'SpendSense-SMS.apk',
    checksumFileName: 'SpendSense-SMS.apk.sha256',
    metadataChecksumKey: 'smsApkSha256',
    routePath: '/api/android/sms-download',
  },
  installer: {
    kind: 'installer',
    fileName: 'SpendSense-Installer.apk',
    checksumFileName: 'SpendSense-Installer.apk.sha256',
    metadataChecksumKey: 'installerSha256',
    routePath: '/api/android/installer-download',
  },
};

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
  smsApkFileName?: string;
  smsApkSize?: string;
  smsApkSha256?: string;
  smsDownloadUrl?: string;
  installerFileName?: string;
  installerSize?: string;
  installerSha256?: string;
  installerDownloadUrl?: string;
  githubReleaseUrl: string;
  sha256: string;
  signingCertificateSha256: string;
  highlights: string[];
  disclaimer: string;
}

export const UNAVAILABLE_ANDROID_RELEASE: AndroidReleaseInfo = {
  published: false,
  applicationId: ANDROID_APPLICATION_ID,
  version: '',
  versionCode: 0,
  buildNumber: 0,
  releaseDate: '',
  minAndroidVersion: 'Android 8.0 (API 26)',
  targetAndroidVersion: 'Android 15 (API 35)',
  apkFileName: 'SpendSense.apk',
  apkSize: '',
  downloadUrl: '/api/android/download',
  githubReleaseUrl: '',
  sha256: '',
  signingCertificateSha256: '',
  highlights: [],
  disclaimer: 'The current Android release details could not be loaded. Please try again shortly.',
};

interface GitHubReleaseAsset {
  id?: number;
  name?: string;
  size?: number;
  url?: string;
  browser_download_url?: string;
  content_type?: string;
}

interface GitHubReleasePayload {
  html_url?: string;
  published_at?: string;
  assets?: GitHubReleaseAsset[];
}

interface VerifiedReleaseBundle {
  ok: true;
  repo: string;
  token: string | undefined;
  release: GitHubReleasePayload;
  assets: GitHubReleaseAsset[];
  metadata: Partial<AndroidReleaseInfo>;
  standardChecksum: string;
  certificateFormatted: string;
  viaPublicReleaseDownload: boolean;
}

let cachedBundle: { cacheKey: string; expiresAt: number; bundle: VerifiedReleaseBundle } | null = null;

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
};

function getGitHubRepo(): string {
  const configured = process.env.GITHUB_REPOSITORY?.trim();
  return configured || DEFAULT_GITHUB_REPOSITORY;
}

function getGitHubToken(): string | undefined {
  const token = process.env.GITHUB_TOKEN?.trim();
  return token || undefined;
}

function buildHeadersForHost(
  hostname: string,
  token: string | undefined,
  accept: string
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: accept,
    'User-Agent': 'SpendSense-Android-Release/1.0',
  };

  if (ALLOWED_API_HOSTS.has(hostname)) {
    headers['X-GitHub-Api-Version'] = '2022-11-28';
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  return headers;
}

function isAllowedUpstreamHost(hostname: string): boolean {
  return ALLOWED_API_HOSTS.has(hostname) || ALLOWED_ASSET_HOSTS.has(hostname);
}

/**
 * Follow GitHub API and release-asset CDN redirects safely without leaking Authorization
 * headers outside api.github.com and without rejecting 301/308 repo-rename redirects.
 */
async function fetchWithSafeRedirects(
  initialUrl: string,
  options: {
    token?: string;
    accept: string;
    method?: 'GET' | 'HEAD';
    maxHops?: number;
    timeoutMs?: number;
  }
): Promise<{ response: Response; finalUrl: URL }> {
  const maxHops = options.maxHops ?? 6;
  let currentUrl = new URL(initialUrl);

  for (let hop = 0; hop <= maxHops; hop++) {
    if (currentUrl.protocol !== 'https:' || !isAllowedUpstreamHost(currentUrl.hostname)) {
      throw new Error(`Rejected untrusted upstream URL host: ${currentUrl.hostname}`);
    }

    const isCdnHost =
      currentUrl.hostname === 'release-assets.githubusercontent.com' ||
      currentUrl.hostname === 'objects.githubusercontent.com' ||
      currentUrl.hostname === 'github-releases.githubusercontent.com';
    const requestMethod = isCdnHost && options.method === 'HEAD' ? 'HEAD' : 'GET';

    const fetchOptions: RequestInit = {
      method: requestMethod,
      headers: buildHeadersForHost(currentUrl.hostname, options.token, options.accept),
      redirect: 'manual',
      cache: 'no-store',
    };
    if (options.timeoutMs && options.timeoutMs > 0) {
      fetchOptions.signal = AbortSignal.timeout(options.timeoutMs);
    }

    const response = await fetch(currentUrl.toString(), fetchOptions);

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      void response.body?.cancel().catch(() => {});
      if (!location) {
        throw new Error(`Upstream redirect (${response.status}) missing location header`);
      }
      currentUrl = new URL(location, currentUrl);
      continue;
    }

    return { response, finalUrl: currentUrl };
  }

  throw new Error('Exceeded maximum upstream redirect hops');
}

export function formatAssetSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeCertificateFingerprint(raw: unknown): { hex: string; formatted: string } | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  const matchesFormat =
    /^([a-f0-9]{2}:){31}[a-f0-9]{2}$/i.test(trimmed) || /^[a-f0-9]{64}$/i.test(trimmed);
  if (!matchesFormat) return null;
  const hex = trimmed.replace(/:/g, '').toUpperCase();
  if (!/^[A-F0-9]{64}$/.test(hex)) return null;
  const formatted = hex.match(/.{2}/g)?.join(':') || '';
  return { hex, formatted };
}

function parseSha256Line(text: string): string {
  const candidate = text.trim().split(/\s+/)[0]?.toLowerCase() || '';
  return /^[a-f0-9]{64}$/.test(candidate) ? candidate : '';
}

function isDisallowedBinaryContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const normalized = contentType.toLowerCase();
  return (
    normalized.includes('application/json') ||
    normalized.includes('text/json') ||
    normalized.includes('+json') ||
    normalized.includes('text/html') ||
    normalized.includes('application/xhtml+xml') ||
    normalized.includes('text/plain')
  );
}

function resolveAssetApiUrl(repo: string, asset: GitHubReleaseAsset): string {
  if (typeof asset.url === 'string' && asset.url.startsWith('https://api.github.com/')) {
    return asset.url;
  }
  if (asset.id) {
    return `https://api.github.com/repos/${repo}/releases/assets/${asset.id}`;
  }
  return `https://github.com/${repo}/releases/download/android-latest/${asset.name}`;
}

function validateMetadataAndChecksum(
  metadata: Partial<AndroidReleaseInfo>,
  standardChecksum: string
): { ok: true; certificateFormatted: string } | { ok: false; error: string } {
  const cert = normalizeCertificateFingerprint(metadata.signingCertificateSha256);
  if (
    metadata.published !== true ||
    metadata.applicationId !== ANDROID_APPLICATION_ID ||
    !metadata.version ||
    !Number.isSafeInteger(metadata.versionCode) ||
    (metadata.versionCode || 0) <= 1005 ||
    !standardChecksum ||
    !cert
  ) {
    return { ok: false, error: 'The current Android release is not verified for distribution.' };
  }

  if (typeof metadata.sha256 === 'string' && metadata.sha256.trim()) {
    if (metadata.sha256.trim().toLowerCase() !== standardChecksum) {
      return { ok: false, error: 'The Android release checksum could not be verified.' };
    }
  }

  return { ok: true, certificateFormatted: cert.formatted };
}

/**
 * Fallback for public GitHub repositories when the unauthenticated REST API rate limit
 * (60 req/hr) is exhausted. Still validates release.json, .sha256 files, and certificate
 * over HTTPS and fails closed (404/503) for private or missing repositories.
 */
async function fetchPublicReleaseFallback(
  repo: string
): Promise<VerifiedReleaseBundle | { ok: false; error: string }> {
  const baseDownload = `https://github.com/${repo}/releases/download/android-latest`;
  const [metaResult, shaResult] = await Promise.all([
    fetchWithSafeRedirects(`${baseDownload}/release.json`, {
      accept: 'application/octet-stream',
      timeoutMs: UPSTREAM_TIMEOUT_MS,
    }),
    fetchWithSafeRedirects(`${baseDownload}/SpendSense.apk.sha256`, {
      accept: 'application/octet-stream',
      timeoutMs: UPSTREAM_TIMEOUT_MS,
    }),
  ]);

  if (!metaResult.response.ok || !shaResult.response.ok) {
    return { ok: false, error: 'The current Android release is not available.' };
  }

  const [metadataText, checksumText] = await Promise.all([
    metaResult.response.text(),
    shaResult.response.text(),
  ]);

  const metadata = JSON.parse(metadataText) as Partial<AndroidReleaseInfo>;
  const standardChecksum = parseSha256Line(checksumText);
  const validated = validateMetadataAndChecksum(metadata, standardChecksum);
  if (!validated.ok) return validated;

  // Probe asset availability & sizes with lightweight HEAD checks for public release assets
  const candidateNames = [
    'SpendSense.apk',
    'SpendSense.apk.sha256',
    ...(metadata.smsApkSha256 ? ['SpendSense-SMS.apk', 'SpendSense-SMS.apk.sha256'] : []),
    ...(metadata.installerSha256 ? ['SpendSense-Installer.apk', 'SpendSense-Installer.apk.sha256'] : []),
  ];

  const probedAssets = await Promise.all(
    candidateNames.map(async (name, index): Promise<GitHubReleaseAsset | null> => {
      const url = `${baseDownload}/${name}`;
      const res = await fetchWithSafeRedirects(url, {
        accept: 'application/octet-stream',
        method: 'HEAD',
        timeoutMs: UPSTREAM_TIMEOUT_MS,
      }).catch(() => null);
      if (!res || !res.response.ok) return null;
      const len = Number(res.response.headers.get('content-length') || 0);
      return {
        id: index + 1,
        name,
        size: Number.isFinite(len) && len > 0 ? len : 1,
        browser_download_url: url,
      };
    })
  );

  const assets = probedAssets.filter((item): item is GitHubReleaseAsset => item !== null);
  const standardAsset = assets.find((a) => a.name === 'SpendSense.apk');
  if (!standardAsset) {
    return { ok: false, error: 'The current Android package is not available.' };
  }

  return {
    ok: true,
    repo,
    token: undefined,
    release: {
      html_url: metadata.githubReleaseUrl || `https://github.com/${repo}/releases/tag/android-latest`,
      published_at: metadata.releaseDate,
      assets,
    },
    assets,
    metadata,
    standardChecksum,
    certificateFormatted: validated.certificateFormatted,
    viaPublicReleaseDownload: true,
  };
}

async function fetchVerifiedReleaseBundle(): Promise<
  VerifiedReleaseBundle | { ok: false; error: string }
> {
  const repo = getGitHubRepo();
  const token = getGitHubToken();
  const useCache = process.env.NODE_ENV !== 'test';
  const cacheKey = `${repo}:${Boolean(token)}`;

  if (useCache && cachedBundle && cachedBundle.cacheKey === cacheKey && cachedBundle.expiresAt > Date.now()) {
    return cachedBundle.bundle;
  }

  try {
    const { response: releaseResponse } = await fetchWithSafeRedirects(
      `https://api.github.com/repos/${repo}/releases/tags/android-latest`,
      {
        token,
        accept: 'application/vnd.github+json',
        timeoutMs: UPSTREAM_TIMEOUT_MS,
      }
    );

    if (!releaseResponse.ok) {
      // Unauthenticated GitHub REST API rate-limit fallback for public repos
      if (!token && (releaseResponse.status === 403 || releaseResponse.status === 429)) {
        const fallbackBundle = await fetchPublicReleaseFallback(repo);
        if (fallbackBundle.ok && useCache) {
          cachedBundle = {
            cacheKey,
            expiresAt: Date.now() + RELEASE_BUNDLE_CACHE_TTL_MS,
            bundle: fallbackBundle,
          };
        }
        return fallbackBundle;
      }
      return { ok: false, error: 'The current Android release is not available.' };
    }

    const release = (await releaseResponse.json()) as GitHubReleasePayload;
    const assets = Array.isArray(release.assets) ? release.assets : [];

    const apkAsset = assets.find((asset) => asset.name === 'SpendSense.apk');
    const metadataAsset = assets.find((asset) => asset.name === 'release.json');
    const checksumAsset = assets.find((asset) => asset.name === 'SpendSense.apk.sha256');

    if (!apkAsset?.id || !metadataAsset?.id || !checksumAsset?.id) {
      return { ok: false, error: 'The current Android package is not available.' };
    }

    const [metadataResult, checksumResult] = await Promise.all([
      fetchWithSafeRedirects(resolveAssetApiUrl(repo, metadataAsset), {
        token,
        accept: 'application/octet-stream',
        timeoutMs: UPSTREAM_TIMEOUT_MS,
      }),
      fetchWithSafeRedirects(resolveAssetApiUrl(repo, checksumAsset), {
        token,
        accept: 'application/octet-stream',
        timeoutMs: UPSTREAM_TIMEOUT_MS,
      }),
    ]);

    if (!metadataResult.response.ok || !checksumResult.response.ok) {
      return { ok: false, error: 'The Android release could not be verified.' };
    }

    const [metadataText, checksumText] = await Promise.all([
      metadataResult.response.text(),
      checksumResult.response.text(),
    ]);

    const metadata = JSON.parse(metadataText) as Partial<AndroidReleaseInfo>;
    const standardChecksum = parseSha256Line(checksumText);
    const validated = validateMetadataAndChecksum(metadata, standardChecksum);
    if (!validated.ok) return validated;

    const bundle: VerifiedReleaseBundle = {
      ok: true,
      repo,
      token,
      release,
      assets,
      metadata,
      standardChecksum,
      certificateFormatted: validated.certificateFormatted,
      viaPublicReleaseDownload: false,
    };

    if (useCache) {
      cachedBundle = {
        cacheKey,
        expiresAt: Date.now() + RELEASE_BUNDLE_CACHE_TTL_MS,
        bundle,
      };
    }

    return bundle;
  } catch {
    return { ok: false, error: 'The Android release service is temporarily unavailable.' };
  }
}

export async function getVerifiedAndroidReleaseMetadata(): Promise<{
  ok: boolean;
  status: number;
  info: AndroidReleaseInfo;
}> {
  const bundle = await fetchVerifiedReleaseBundle();
  if (!bundle.ok) {
    return {
      ok: false,
      status: 503,
      info: UNAVAILABLE_ANDROID_RELEASE,
    };
  }

  const { assets, metadata, release, standardChecksum, certificateFormatted } = bundle;
  const apkAsset = assets.find((asset) => asset.name === 'SpendSense.apk');
  const smsApkAsset = assets.find((asset) => asset.name === 'SpendSense-SMS.apk');
  const smsChecksumAsset = assets.find((asset) => asset.name === 'SpendSense-SMS.apk.sha256');
  const installerAsset = assets.find((asset) => asset.name === 'SpendSense-Installer.apk');
  const installerChecksumAsset = assets.find((asset) => asset.name === 'SpendSense-Installer.apk.sha256');

  const smsSha = typeof metadata.smsApkSha256 === 'string' ? metadata.smsApkSha256.trim().toLowerCase() : '';
  const hasSms = Boolean(smsApkAsset?.id && smsChecksumAsset?.id && /^[a-f0-9]{64}$/.test(smsSha));

  const installerSha =
    typeof metadata.installerSha256 === 'string' ? metadata.installerSha256.trim().toLowerCase() : '';
  const hasInstaller = Boolean(
    installerAsset?.id && installerChecksumAsset?.id && /^[a-f0-9]{64}$/.test(installerSha)
  );

  const info: AndroidReleaseInfo = {
    ...UNAVAILABLE_ANDROID_RELEASE,
    ...metadata,
    published: true,
    applicationId: ANDROID_APPLICATION_ID,
    apkFileName: 'SpendSense.apk',
    apkSize: apkAsset?.size ? formatAssetSize(apkAsset.size) : metadata.apkSize || '',
    downloadUrl: '/api/android/download',
    releaseDate: metadata.releaseDate || release.published_at?.slice(0, 10) || '',
    githubReleaseUrl: release.html_url || metadata.githubReleaseUrl || '',
    sha256: standardChecksum,
    signingCertificateSha256: certificateFormatted,
    smsApkFileName: hasSms ? 'SpendSense-SMS.apk' : undefined,
    smsApkSize: hasSms && smsApkAsset?.size ? formatAssetSize(smsApkAsset.size) : undefined,
    smsApkSha256: hasSms ? smsSha : undefined,
    smsDownloadUrl: hasSms ? '/api/android/sms-download' : undefined,
    installerFileName: hasInstaller ? 'SpendSense-Installer.apk' : undefined,
    installerSize: hasInstaller && installerAsset?.size ? formatAssetSize(installerAsset.size) : undefined,
    installerSha256: hasInstaller ? installerSha : undefined,
    installerDownloadUrl: hasInstaller ? '/api/android/installer-download' : undefined,
  };

  return {
    ok: true,
    status: 200,
    info,
  };
}

/**
 * Inspect the leading 4 bytes of an upstream ReadableStream to verify ZIP/APK magic bytes
 * (PK\x03\x04) without buffering the rest of the APK in server memory.
 */
async function createVerifiedApkStream(
  upstreamBody: ReadableStream<Uint8Array>
): Promise<{ stream: ReadableStream<Uint8Array> }> {
  const reader = upstreamBody.getReader();
  const initialChunks: Uint8Array[] = [];
  let collectedBytes = 0;

  while (collectedBytes < 4) {
    const { done, value } = await reader.read();
    if (done) {
      await reader.cancel().catch(() => {});
      throw new Error('Upstream APK stream ended prematurely');
    }
    if (value && value.byteLength > 0) {
      initialChunks.push(value);
      collectedBytes += value.byteLength;
    }
  }

  const header = new Uint8Array(4);
  let offset = 0;
  for (const chunk of initialChunks) {
    for (let i = 0; i < chunk.byteLength && offset < 4; i++) {
      header[offset++] = chunk[i];
    }
  }

  // Every valid Android APK is a ZIP archive starting with local file header signature PK\x03\x04.
  if (header[0] !== 0x50 || header[1] !== 0x4b || header[2] !== 0x03 || header[3] !== 0x04) {
    await reader.cancel().catch(() => {});
    throw new Error('Upstream response is not a valid APK/ZIP binary');
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of initialChunks) {
        controller.enqueue(chunk);
      }
    },
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        if (value && value.byteLength > 0) {
          controller.enqueue(value);
        }
      } catch (err) {
        controller.error(err);
      }
    },
    async cancel(reason) {
      await reader.cancel(reason).catch(() => {});
    },
  });

  return { stream };
}

export async function downloadVerifiedReleaseAsset(
  specOrKind:
    | AndroidArtifactKind
    | {
        fileName: string;
        checksumFileName: string;
        metadataChecksumKey: 'sha256' | 'smsApkSha256' | 'installerSha256';
      },
  method: 'GET' | 'HEAD' = 'GET'
): Promise<Response> {
  const spec =
    typeof specOrKind === 'string'
      ? ANDROID_APK_ARTIFACTS[specOrKind]
      : specOrKind;

  if (!spec.fileName.endsWith('.apk')) {
    return unavailable('Invalid Android package target.');
  }

  const bundle = await fetchVerifiedReleaseBundle();
  if (!bundle.ok) {
    return unavailable(bundle.error);
  }

  const { repo, token, assets, metadata, viaPublicReleaseDownload } = bundle;
  const asset = assets.find((item) => item.name === spec.fileName);
  const checksumAsset = assets.find((item) => item.name === spec.checksumFileName);

  if (
    !asset?.id ||
    !checksumAsset?.id ||
    typeof asset.size !== 'number' ||
    asset.size <= 0 ||
    asset.size > MAX_APK_SIZE_BYTES
  ) {
    return unavailable(`${spec.fileName} is not available in the current release.`);
  }

  try {
    const checksumUrl = viaPublicReleaseDownload
      ? `https://github.com/${repo}/releases/download/android-latest/${spec.checksumFileName}`
      : resolveAssetApiUrl(repo, checksumAsset);

    const checksumResult = await fetchWithSafeRedirects(checksumUrl, {
      token,
      accept: 'application/octet-stream',
      timeoutMs: UPSTREAM_TIMEOUT_MS,
    });
    if (!checksumResult.response.ok) {
      return unavailable(`Checksum verification failed for ${spec.fileName}.`);
    }

    const publishedChecksum = parseSha256Line(await checksumResult.response.text());
    const expectedChecksum = String(metadata?.[spec.metadataChecksumKey] || '').trim().toLowerCase();

    if (!publishedChecksum || !/^[a-f0-9]{64}$/.test(expectedChecksum) || expectedChecksum !== publishedChecksum) {
      return unavailable(`${spec.fileName} failed release checksum verification.`);
    }

    const binaryUrl = viaPublicReleaseDownload
      ? `https://github.com/${repo}/releases/download/android-latest/${spec.fileName}`
      : resolveAssetApiUrl(repo, asset);

    const { response: assetResponse } = await fetchWithSafeRedirects(binaryUrl, {
      token,
      accept: 'application/octet-stream',
      method,
      timeoutMs: method === 'HEAD' ? UPSTREAM_TIMEOUT_MS : undefined,
    });

    if (!assetResponse.ok) {
      void assetResponse.body?.cancel().catch(() => {});
      return unavailable(`${spec.fileName} could not be fetched from release storage.`);
    }

    const upstreamContentType = assetResponse.headers.get('content-type');
    if (isDisallowedBinaryContentType(upstreamContentType)) {
      void assetResponse.body?.cancel().catch(() => {});
      return unavailable(`Upstream returned non-APK content (${upstreamContentType}) for ${spec.fileName}.`);
    }

    const upstreamLength = assetResponse.headers.get('content-length');
    const resolvedLength =
      upstreamLength && /^\d+$/.test(upstreamLength) && Number(upstreamLength) > 0
        ? upstreamLength
        : String(asset.size);

    const responseHeaders: Record<string, string> = {
      'Content-Type': ANDROID_APK_MIME_TYPE,
      'Content-Disposition': `attachment; filename="${spec.fileName}"`,
      'Content-Length': resolvedLength,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    };

    if (method === 'HEAD') {
      void assetResponse.body?.cancel().catch(() => {});
      return new Response(null, { status: 200, headers: responseHeaders });
    }

    if (!assetResponse.body) {
      return unavailable(`Empty binary stream received for ${spec.fileName}.`);
    }

    const { stream } = await createVerifiedApkStream(assetResponse.body);
    return new Response(stream, {
      status: 200,
      headers: responseHeaders,
    });
  } catch {
    return unavailable(`The verified Android release asset (${spec.fileName}) is temporarily unavailable.`);
  }
}

function unavailable(message = 'The verified Android release asset is temporarily unavailable.') {
  return NextResponse.json(
    { error: message },
    { status: 503, headers: NO_STORE_HEADERS }
  );
}
