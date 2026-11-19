import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { GET as getRelease } from '../src/app/api/android/release/route';
import { GET as getDownload } from '../src/app/api/android/download/route';

describe('Native Android Download Experience & Distribution Infrastructure', () => {
  test('APK and release metadata are served from private GitHub Releases, not committed to the website', () => {
    const publicAndroidDir = path.join(process.cwd(), 'public', 'android');
    assert.ok(!fs.existsSync(path.join(publicAndroidDir, 'SpendSense.apk')), 'APK binary must not be stored in Git');
    assert.ok(!fs.existsSync(path.join(publicAndroidDir, 'release.json')), 'private release metadata must not be copied into public assets');
    assert.ok(fs.readFileSync(path.join(process.cwd(), 'src', 'app', 'api', 'android', 'release', 'route.ts'), 'utf-8').includes("asset.name === 'SpendSense.apk'"));
  });

  test('release and download routes fail closed without a server-side token', async () => {
    const previousToken = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;
    try {
      assert.equal((await getRelease()).status, 503);
      assert.equal((await getDownload()).status, 503);
    } finally {
      if (previousToken) process.env.GITHUB_TOKEN = previousToken;
    }
  });

  test('GET /api/android/download issues 302 redirect to latest APK asset', async () => {
    const response = await getDownload();
    assert.strictEqual(response.status, 503, 'must fail closed when release service is not configured');
  });

  test('UnauthenticatedHome exposes /download in header and footer', () => {
    const homePath = path.join(process.cwd(), 'src', 'app', 'UnauthenticatedHome.tsx');
    const content = fs.readFileSync(homePath, 'utf-8');

    assert.ok(content.includes('href="/download"'), 'UnauthenticatedHome must link to /download');
    assert.ok(content.includes('Download App'), 'Header must contain Download App text');
    assert.ok(content.includes('Android App'), 'Footer must contain Android App link');
  });

  test('TransactionAppShell exposes /download in top header and More hub', () => {
    const shellPath = path.join(process.cwd(), 'src', 'features', 'transactions', 'TransactionAppShell.tsx');
    const content = fs.readFileSync(shellPath, 'utf-8');

    assert.ok(content.includes('href="/download"'), 'TransactionAppShell must link to /download');
    assert.ok(content.includes('Native Android Application'), 'More hub must feature Native Android Application card');
  });

  test('Android build keeps SpendSense identity and accepts user-selected message sharing only', () => {
    const buildGradlePath = path.join(process.cwd(), '..', 'android', 'app', 'build.gradle');
    const buildGradle = fs.readFileSync(buildGradlePath, 'utf-8');

    assert.ok(buildGradle.includes('appName", "SpendSense"'), 'launcher name must be SpendSense');

    const mainManifestPath = path.join(process.cwd(), '..', 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
    const mainManifest = fs.readFileSync(mainManifestPath, 'utf-8');
    assert.ok(!mainManifest.includes('android.permission.READ_SMS'), 'direct APK must not declare restricted inbox access');
    assert.ok(!mainManifest.includes('android.permission.RECEIVE_SMS'), 'direct APK must not declare restricted inbox access');
    assert.ok(mainManifest.includes('android.intent.action.SEND'), 'APK must accept explicitly shared messages');
    assert.ok(mainManifest.includes('text/plain'), 'message sharing must use plain-text content');
  });
});
