import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { GET as getRelease } from '../src/app/api/android/release/route';
import { GET as getDownload, HEAD as headDownload } from '../src/app/api/android/download/route';
import { GET as getSmsDownload, HEAD as headSmsDownload } from '../src/app/api/android/sms-download/route';
import { GET as getInstallerDownload, HEAD as headInstallerDownload } from '../src/app/api/android/installer-download/route';

function makeApkBuffer(label: string): Buffer {
  // Minimal valid ZIP local file header signature (PK\x03\x04) + payload
  return Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]),
    Buffer.from(`mock-apk-${label}-AndroidManifest.xml`),
  ]);
}

function sha256Hex(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

describe('Android APK Binary Streaming, Redirect Safety & Metadata Separation', () => {
  test('handles 301 repo-rename redirect and streams valid APK binaries without leaking token or serving .apk.json', async () => {
    const standardApk = makeApkBuffer('standard');
    const smsApk = makeApkBuffer('sms');
    const installerApk = makeApkBuffer('installer');

    const standardSha = sha256Hex(standardApk);
    const smsSha = sha256Hex(smsApk);
    const installerSha = sha256Hex(installerApk);
    const cert = '2385b27fe940bf5cae2ddfc16d615994bef8538ed8ffcb06f58404d90e386447';

    const releaseJson = JSON.stringify({
      published: true,
      applicationId: 'com.digitaldodo.arth',
      version: '1.4.0+build.18',
      versionCode: 1024,
      buildNumber: 18,
      releaseDate: '2026-11-27',
      minAndroidVersion: 'Android 8.0 (API 26)',
      targetAndroidVersion: 'Android 15 (API 35)',
      apkFileName: 'SpendSense.apk',
      apkSize: '2.9 MB',
      downloadUrl: '/api/android/download',
      smsApkFileName: 'SpendSense-SMS.apk',
      smsApkSize: '2.9 MB',
      smsApkSha256: smsSha,
      smsDownloadUrl: '/api/android/sms-download',
      installerFileName: 'SpendSense-Installer.apk',
      installerSize: '30 KB',
      installerSha256: installerSha,
      installerDownloadUrl: '/api/android/installer-download',
      sha256: standardSha,
      signingCertificateSha256: cert,
      highlights: ['Verified build'],
      disclaimer: 'Separate native APK.',
    });

    const releasePayload = {
      html_url: 'https://github.com/digitaldodo/SpendSense1/releases/tag/android-latest',
      published_at: '2026-11-27T00:00:00Z',
      assets: [
        { id: 101, name: 'SpendSense.apk', size: standardApk.byteLength, url: 'https://api.github.com/repos/digitaldodo/Arth/releases/assets/101' },
        { id: 102, name: 'SpendSense.apk.sha256', size: 80, url: 'https://api.github.com/repos/digitaldodo/Arth/releases/assets/102' },
        { id: 103, name: 'SpendSense-SMS.apk', size: smsApk.byteLength, url: 'https://api.github.com/repos/digitaldodo/Arth/releases/assets/103' },
        { id: 104, name: 'SpendSense-SMS.apk.sha256', size: 80, url: 'https://api.github.com/repos/digitaldodo/Arth/releases/assets/104' },
        { id: 105, name: 'SpendSense-Installer.apk', size: installerApk.byteLength, url: 'https://api.github.com/repos/digitaldodo/Arth/releases/assets/105' },
        { id: 106, name: 'SpendSense-Installer.apk.sha256', size: 80, url: 'https://api.github.com/repos/digitaldodo/Arth/releases/assets/106' },
        { id: 107, name: 'release.json', size: releaseJson.length, url: 'https://api.github.com/repos/digitaldodo/Arth/releases/assets/107' },
      ],
    };

    const originalFetch = globalThis.fetch;
    const prevRepo = process.env.GITHUB_REPOSITORY;
    const prevToken = process.env.GITHUB_TOKEN;
    process.env.GITHUB_REPOSITORY = 'digitaldodo/Arth';
    process.env.GITHUB_TOKEN = 'test-secret-token';

    const cdnAuthSeen: boolean[] = [];

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const headers = (init?.headers || {}) as Record<string, string>;

      if (url === 'https://api.github.com/repos/digitaldodo/Arth/releases/tags/android-latest') {
        return new Response(null, {
          status: 301,
          headers: { location: 'https://api.github.com/repositories/1432596312/releases/tags/android-latest' },
        });
      }
      if (url === 'https://api.github.com/repositories/1432596312/releases/tags/android-latest') {
        return new Response(JSON.stringify(releasePayload), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      // Simulate 301 repo-rename redirect on asset URLs
      const oldAssetMatch = /^https:\/\/api\.github\.com\/repos\/digitaldodo\/Arth\/releases\/assets\/(\d+)$/.exec(url);
      if (oldAssetMatch) {
        return new Response(JSON.stringify({ message: 'Moved Permanently' }), {
          status: 301,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            location: `https://api.github.com/repositories/1432596312/releases/assets/${oldAssetMatch[1]}`,
          },
        });
      }

      const canonicalAssetMatch = /^https:\/\/api\.github\.com\/repositories\/1432596312\/releases\/assets\/(\d+)$/.exec(url);
      if (canonicalAssetMatch) {
        return new Response(null, {
          status: 302,
          headers: {
            location: `https://release-assets.githubusercontent.com/asset/${canonicalAssetMatch[1]}`,
          },
        });
      }

      if (url.startsWith('https://release-assets.githubusercontent.com/asset/')) {
        cdnAuthSeen.push(Boolean(headers.Authorization || headers.authorization));
        const id = url.split('/').pop();
        const method = init?.method || 'GET';
        if (id === '107') return new Response(releaseJson, { status: 200, headers: { 'content-type': 'application/octet-stream' } });
        if (id === '102') return new Response(`${standardSha}  SpendSense.apk\n`, { status: 200 });
        if (id === '104') return new Response(`${smsSha}  SpendSense-SMS.apk\n`, { status: 200 });
        if (id === '106') return new Response(`${installerSha}  SpendSense-Installer.apk\n`, { status: 200 });

        const map: Record<string, Buffer> = { '101': standardApk, '103': smsApk, '105': installerApk };
        const buf = map[id || ''];
        return new Response(method === 'HEAD' ? null : new Uint8Array(buf), {
          status: 200,
          headers: {
            'content-type': 'application/vnd.android.package-archive',
            'content-length': String(buf.byteLength),
          },
        });
      }

      throw new Error(`Unexpected fetch URL in test: ${url}`);
    }) as typeof fetch;

    try {
      // 1. Metadata endpoint returns JSON only, never APK attachment disposition
      const relRes = await getRelease();
      assert.equal(relRes.status, 200);
      assert.ok((relRes.headers.get('content-type') || '').includes('application/json'));
      assert.equal(relRes.headers.get('content-disposition'), null);
      const relJson = await relRes.json();
      assert.equal(relJson.published, true);
      assert.equal(relJson.apkFileName, 'SpendSense.apk');
      assert.equal(relJson.sha256, standardSha);

      // 2. Verify all three binary endpoints (GET and HEAD)
      const cases = [
        { name: 'SpendSense.apk', get: getDownload, head: headDownload, buf: standardApk },
        { name: 'SpendSense-SMS.apk', get: getSmsDownload, head: headSmsDownload, buf: smsApk },
        { name: 'SpendSense-Installer.apk', get: getInstallerDownload, head: headInstallerDownload, buf: installerApk },
      ];

      for (const c of cases) {
        const headRes = await c.head();
        assert.equal(headRes.status, 200, `${c.name} HEAD must return 200`);
        assert.equal(headRes.headers.get('content-type'), 'application/vnd.android.package-archive');
        assert.equal(headRes.headers.get('content-disposition'), `attachment; filename="${c.name}"`);
        assert.equal(headRes.headers.get('content-length'), String(c.buf.byteLength));

        const getRes = await c.get();
        assert.equal(getRes.status, 200, `${c.name} GET must return 200`);
        assert.equal(getRes.headers.get('content-type'), 'application/vnd.android.package-archive');
        assert.equal(getRes.headers.get('content-disposition'), `attachment; filename="${c.name}"`);
        assert.equal(getRes.headers.get('content-length'), String(c.buf.byteLength));
        const body = Buffer.from(await getRes.arrayBuffer());
        assert.deepEqual(body, c.buf);
      }

      // 3. Authorization token never leaked to CDN hosts
      assert.ok(cdnAuthSeen.length > 0 && cdnAuthSeen.every((seen) => seen === false));
    } finally {
      globalThis.fetch = originalFetch;
      if (prevRepo !== undefined) process.env.GITHUB_REPOSITORY = prevRepo;
      else delete process.env.GITHUB_REPOSITORY;
      if (prevToken !== undefined) process.env.GITHUB_TOKEN = prevToken;
      else delete process.env.GITHUB_TOKEN;
    }
  });

  test('rejects JSON or HTML disguised as an APK binary and never returns .apk.json attachment headers', async () => {
    const standardSha = sha256Hex(makeApkBuffer('standard'));
    const cert = '2385b27fe940bf5cae2ddfc16d615994bef8538ed8ffcb06f58404d90e386447';
    const releaseJson = JSON.stringify({
      published: true,
      applicationId: 'com.digitaldodo.arth',
      version: '1.4.0+build.18',
      versionCode: 1024,
      sha256: standardSha,
      signingCertificateSha256: cert,
    });
    const releasePayload = {
      assets: [
        { id: 101, name: 'SpendSense.apk', size: 1200, url: 'https://api.github.com/repositories/1432596312/releases/assets/101' },
        { id: 102, name: 'SpendSense.apk.sha256', size: 80, url: 'https://api.github.com/repositories/1432596312/releases/assets/102' },
        { id: 107, name: 'release.json', size: releaseJson.length, url: 'https://api.github.com/repositories/1432596312/releases/assets/107' },
      ],
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.endsWith('/releases/tags/android-latest')) {
        return new Response(JSON.stringify(releasePayload), { status: 200 });
      }
      if (url.endsWith('/assets/107')) {
        return new Response(releaseJson, { status: 200 });
      }
      if (url.endsWith('/assets/102')) {
        return new Response(`${standardSha}  SpendSense.apk\n`, { status: 200 });
      }
      if (url.endsWith('/assets/101')) {
        return new Response(null, {
          status: 302,
          headers: { location: 'https://release-assets.githubusercontent.com/bad-payload' },
        });
      }
      if (url === 'https://release-assets.githubusercontent.com/bad-payload') {
        // Malformed HTML/JSON masquerading as binary stream
        return new Response('<!doctype html><html><body>Error</body></html>', {
          status: 200,
          headers: { 'content-type': 'application/octet-stream' },
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    }) as typeof fetch;

    try {
      const res = await getDownload();
      assert.equal(res.status, 503);
      assert.ok((res.headers.get('content-type') || '').includes('application/json'));
      assert.equal(res.headers.get('content-disposition'), null);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
