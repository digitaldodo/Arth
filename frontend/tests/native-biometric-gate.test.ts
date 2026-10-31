import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Android biometric gate', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../android/app/src/main/java/com/digitaldodo/arth/BiometricGateActivity.kt'), 'utf8');
  it('checks fingerprint feature and strong biometric availability', () => {
    assert.match(source, /hasSystemFeature\("android\.hardware\.fingerprint"\)/);
    assert.match(source, /canAuthenticate\(BiometricManager\.Authenticators\.BIOMETRIC_STRONG\)/);
  });
  it('uses the AndroidX system prompt without device credential fallback', () => {
    assert.match(source, /BiometricPrompt\(this/);
    assert.match(source, /setAllowedAuthenticators\(BiometricManager\.Authenticators\.BIOMETRIC_STRONG\)/);
    assert.doesNotMatch(source, /DEVICE_CREDENTIAL|setDeviceCredentialAllowed\(true\)/);
  });
  it('describes the actual modality limitation', () => {
    assert.match(source, /cannot guarantee fingerprint-only matching/);
    assert.match(source, /BIOMETRIC_ERROR_NONE_ENROLLED/);
    assert.match(source, /BIOMETRIC_ERROR_HW_UNAVAILABLE/);
  });
});
