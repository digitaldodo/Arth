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

  test('release and download routes fail closed for unconfigured/private repo without token', async () => {
    const previousToken = process.env.GITHUB_TOKEN;
    const previousRepo = process.env.GITHUB_REPOSITORY;
    delete process.env.GITHUB_TOKEN;
    process.env.GITHUB_REPOSITORY = 'digitaldodo/nonexistent-private-repo-check';
    try {
      assert.equal((await getRelease()).status, 503);
      assert.equal((await getDownload()).status, 503);
    } finally {
      if (previousToken) process.env.GITHUB_TOKEN = previousToken;
      if (previousRepo !== undefined) process.env.GITHUB_REPOSITORY = previousRepo;
      else delete process.env.GITHUB_REPOSITORY;
    }
  });

  test('GET /api/android/download fails closed with 503 JSON when upstream release is unreachable', async () => {
    const previousRepo = process.env.GITHUB_REPOSITORY;
    process.env.GITHUB_REPOSITORY = 'digitaldodo/nonexistent-private-repo-check';
    try {
      const response = await getDownload();
      assert.strictEqual(response.status, 503, 'must fail closed when release repository is unreachable');
      assert.ok((response.headers.get('content-type') || '').includes('application/json'));
      assert.equal(response.headers.get('content-disposition'), null);
    } finally {
      if (previousRepo !== undefined) process.env.GITHUB_REPOSITORY = previousRepo;
      else delete process.env.GITHUB_REPOSITORY;
    }
  });

  test('UnauthenticatedHome places verified install choices in the hero and links to /download', () => {
    const homePath = path.join(process.cwd(), 'src', 'app', 'UnauthenticatedHome.tsx');
    const content = fs.readFileSync(homePath, 'utf-8');
    const installPath = path.join(process.cwd(), 'src', 'features', 'install', 'GetSpendSenseSection.tsx');
    const installContent = fs.readFileSync(installPath, 'utf-8');

    assert.ok(content.includes('href="/download"'), 'UnauthenticatedHome must link to /download');
    assert.ok(content.includes('<GetSpendSenseSection compact />'), 'Install controls must be rendered in the hero');
    assert.ok(installContent.includes('Download Android App'), 'Hero install card must expose the native Android action');
    assert.ok(!content.includes('headerApkDownload'), 'APK download must not bypass release verification in the header');
    assert.ok(content.includes('Android App'), 'Footer must contain Android App link');
  });

  test('TransactionAppShell exposes /download in top header and More hub', () => {
    const shellPath = path.join(process.cwd(), 'src', 'features', 'transactions', 'TransactionAppShell.tsx');
    const content = fs.readFileSync(shellPath, 'utf-8');

    assert.ok(content.includes('href="/download"'), 'TransactionAppShell must link to /download');
    assert.ok(content.includes('Native Android Application'), 'More hub must feature Native Android Application card');
  });

  test('direct APK supports user-approved notification import while preserving the SMS-capable flavor', () => {
    const buildGradlePath = path.join(process.cwd(), '..', 'android', 'app', 'build.gradle');
    const buildGradle = fs.readFileSync(buildGradlePath, 'utf-8');

    assert.ok(buildGradle.includes('appName", "SpendSense"'), 'launcher name must be SpendSense');
    assert.ok(buildGradle.includes('buildConfigField "boolean", "SMS_DETECTION_SUPPORTED", "false"'), 'direct local flavor must keep inbox detection disabled');
    assert.ok(buildGradle.includes('buildConfigField "boolean", "SMS_DETECTION_SUPPORTED", "true"'), 'existing SMS-capable flavor must remain available');

    const mainManifestPath = path.join(process.cwd(), '..', 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
    const mainManifest = fs.readFileSync(mainManifestPath, 'utf-8');
    const localManifestPath = path.join(process.cwd(), '..', 'android', 'app', 'src', 'local', 'AndroidManifest.xml');
    const localManifest = fs.readFileSync(localManifestPath, 'utf-8');
    assert.ok(mainManifest.includes('android.permission.READ_SMS'), 'existing SMS-capable variant must remain intact');
    assert.ok(mainManifest.includes('android.permission.RECEIVE_SMS'), 'existing SMS-capable variant must remain intact');
    assert.ok(localManifest.includes('android.permission.READ_SMS') && localManifest.includes('tools:node="remove"'), 'direct APK must remove restricted inbox access in its merged manifest');
    assert.ok(localManifest.includes('android.permission.RECEIVE_SMS') && localManifest.includes('tools:node="remove"'), 'direct APK must remove incoming SMS access in its merged manifest');
    assert.ok(mainManifest.includes('SmsNotificationListenerService'), 'Android must register the user-approved notification listener');
    assert.ok(mainManifest.includes('android.permission.BIND_NOTIFICATION_LISTENER_SERVICE'), 'notification listener must use Android system binding protection');
    assert.ok(mainManifest.includes('android.intent.action.SEND'), 'APK must accept explicitly shared messages');
    assert.ok(mainManifest.includes('text/plain'), 'message sharing must use plain-text content');
  });
});
