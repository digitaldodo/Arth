import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { GET as getRelease } from '../src/app/api/android/release/route';
import { GET as getDownload } from '../src/app/api/android/download/route';

describe('Native Android Download Experience & Distribution Infrastructure', () => {
  test('public/android/release.json contains valid baseline metadata', () => {
    const releaseJsonPath = path.join(process.cwd(), 'public', 'android', 'release.json');
    assert.ok(fs.existsSync(releaseJsonPath), 'release.json must exist in public/android');

    const content = JSON.parse(fs.readFileSync(releaseJsonPath, 'utf-8'));
    assert.ok(content.version, 'version must be present');
    assert.strictEqual(typeof content.versionCode, 'number', 'versionCode must be a number');
    assert.strictEqual(typeof content.buildNumber, 'number', 'buildNumber must be a number');
    assert.ok(content.apkFileName?.endsWith('.apk'), 'apkFileName must end with .apk');
    assert.ok(content.downloadUrl?.includes('.apk'), 'downloadUrl must point to APK');
    assert.strictEqual(content.sha256?.length, 64, 'sha256 must be a 64-character hex hash');
    assert.ok(content.minAndroidVersion?.includes('Android'), 'minAndroidVersion must be specified');
    assert.ok(Array.isArray(content.highlights) && content.highlights.length > 0, 'highlights must be a non-empty array');
    assert.ok(content.disclaimer?.includes('SMS'), 'disclaimer must clarify SMS permissions');
  });

  test('GET /api/android/release returns release info with caching headers', async () => {
    const response = await getRelease();
    assert.strictEqual(response.status, 200);

    const cacheHeader = response.headers.get('cache-control');
    assert.ok(cacheHeader?.includes('s-maxage=300'), 'must specify 5-minute s-maxage cache header');

    const body = await response.json();
    assert.ok(body.version, 'body must contain version');
    assert.ok(body.apkFileName, 'body must contain apkFileName');
    assert.ok(body.downloadUrl, 'body must contain downloadUrl');
    assert.strictEqual(body.sha256?.length, 64, 'body must contain 64-char sha256 checksum');
  });

  test('GET /api/android/download issues 302 redirect to latest APK asset', async () => {
    const response = await getDownload();
    assert.strictEqual(response.status, 302, 'must issue 302 Found redirect');

    const location = response.headers.get('location');
    assert.ok(location, 'must provide Location header');
    assert.ok(location?.includes('Arth.apk'), 'redirect location must target Arth.apk');
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

  test('Android build configuration enforces SMS detection across all distribution builds', () => {
    const buildGradlePath = path.join(process.cwd(), '..', 'android', 'app', 'build.gradle');
    const buildGradle = fs.readFileSync(buildGradlePath, 'utf-8');

    // Local distribution flavor supports SMS detection and sets app name to Arth
    assert.ok(buildGradle.includes('SMS_DETECTION_SUPPORTED", "true"'), 'Local flavor must support SMS detection');
    assert.ok(buildGradle.includes('appName", "Arth"'), 'Local flavor appName must be Arth');

    // Main manifest declares RECEIVE_SMS and READ_SMS for financial transaction detection
    const mainManifestPath = path.join(process.cwd(), '..', 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
    const mainManifest = fs.readFileSync(mainManifestPath, 'utf-8');
    assert.ok(mainManifest.includes('android.permission.READ_SMS'), 'main AndroidManifest must declare READ_SMS');
    assert.ok(mainManifest.includes('android.permission.RECEIVE_SMS'), 'main AndroidManifest must declare RECEIVE_SMS');
  });
});
