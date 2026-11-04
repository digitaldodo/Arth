import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Android biometric gate', () => {
  const biometricFile = path.resolve(__dirname, '../../android/app/src/main/java/com/digitaldodo/arth/core/security/BiometricAuthManager.kt');
  const source = fs.readFileSync(biometricFile, 'utf8');

  it('checks strong biometric availability and enrollment', () => {
    assert.match(source, /canAuthenticate\(BiometricManager\.Authenticators\.BIOMETRIC_STRONG\)/);
    assert.match(source, /BIOMETRIC_ERROR_NONE_ENROLLED/);
    assert.match(source, /BIOMETRIC_ERROR_HW_UNAVAILABLE/);
  });

  it('uses AndroidX BiometricPrompt with device credential fallback', () => {
    assert.match(source, /BiometricPrompt/);
    assert.match(source, /DEVICE_CREDENTIAL/);
    assert.match(source, /hasDeviceCredential/);
  });
});
