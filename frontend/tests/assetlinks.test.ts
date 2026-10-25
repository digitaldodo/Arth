import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('Android Digital Asset Links Endpoint & TWA Association', () => {
  test('assetlinks route handler returns valid specification for com.digitaldodo.arth', async () => {
    // Dynamic import of Next.js Route Handler
    const { GET } = await import('../src/app/.well-known/assetlinks.json/route.js');

    const response = await GET();
    assert.equal(response.status, 200);

    const contentType = response.headers.get('content-type');
    assert.ok(contentType?.includes('application/json'), 'Content-Type must be application/json');

    const data = await response.json();
    assert.ok(Array.isArray(data), 'Response must be a JSON array');
    assert.equal(data.length, 1);

    const statement = data[0];
    assert.deepEqual(statement.relation, ['delegate_permission/common.handle_all_urls']);
    assert.equal(statement.target.namespace, 'android_app');
    assert.equal(statement.target.package_name, 'com.digitaldodo.arth');
    assert.ok(Array.isArray(statement.target.sha256_cert_fingerprints));
  });

  test('parses ANDROID_RELEASE_CERT_SHA256 env variable into uppercase fingerprint array', async () => {
    const originalEnv = process.env.ANDROID_RELEASE_CERT_SHA256;
    try {
      process.env.ANDROID_RELEASE_CERT_SHA256 =
        '14:6d:e9:cd:ab:23:45:67:89:01:23:45:67:89:ab:cd:ef:12:34:56:78:90:ab:cd:ef:12:34:56:78:90:ab:cd';

      const { GET } = await import('../src/app/.well-known/assetlinks.json/route.js');
      const response = await GET();
      const data = await response.json();

      assert.equal(data[0].target.sha256_cert_fingerprints.length, 1);
      assert.equal(
        data[0].target.sha256_cert_fingerprints[0],
        '14:6D:E9:CD:AB:23:45:67:89:01:23:45:67:89:AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90:AB:CD'
      );
    } finally {
      if (originalEnv !== undefined) {
        process.env.ANDROID_RELEASE_CERT_SHA256 = originalEnv;
      } else {
        delete process.env.ANDROID_RELEASE_CERT_SHA256;
      }
    }
  });
});
