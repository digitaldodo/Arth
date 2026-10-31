import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateSalt,
  derivePasscodeHash,
  verifyPasscode,
  timingSafeEqual,
} from '../src/features/app-lock/passcode-crypto';
import { timeoutToMs } from '../src/features/app-lock/inactivity-lock';
import { newAppLockPreferences } from '../src/features/app-lock/storage';

describe('App Lock PBKDF2 Passcode Cryptography & Verification', () => {
  test('generateSalt generates 16-byte cryptographically random hex salt', () => {
    const salt1 = generateSalt();
    const salt2 = generateSalt();

    assert.equal(salt1.length, 32, '16 bytes must produce 32 hex chars');
    assert.equal(salt2.length, 32, '16 bytes must produce 32 hex chars');
    assert.match(salt1, /^[0-9a-f]{32}$/, 'Salt must be valid lowercase hex');
    assert.notEqual(salt1, salt2, 'Subsequent salts must be distinct and random');
  });

  test('derivePasscodeHash produces deterministic 256-bit SHA-256 hash for identical salt', async () => {
    const passcode = '7492';
    const salt = generateSalt();

    const result1 = await derivePasscodeHash(passcode, salt);
    const result2 = await derivePasscodeHash(passcode, salt);

    assert.equal(result1.saltHex, salt);
    assert.equal(result2.saltHex, salt);
    assert.equal(result1.hashHex.length, 64, '256-bit key must be 64 hex characters');
    assert.equal(result1.hashHex, result2.hashHex, 'Derivation must be completely deterministic');
  });

  test('derivePasscodeHash produces different hashes for different passcodes with same salt', async () => {
    const salt = generateSalt();
    const resultA = await derivePasscodeHash('1234', salt);
    const resultB = await derivePasscodeHash('1235', salt);

    assert.notEqual(resultA.hashHex, resultB.hashHex);
  });

  test('timingSafeEqual validates strings correctly', () => {
    assert.equal(timingSafeEqual('abcdef', 'abcdef'), true);
    assert.equal(timingSafeEqual('abcdef', 'abcdeg'), false);
    assert.equal(timingSafeEqual('abcdef', 'abcde'), false);
    assert.equal(timingSafeEqual('', ''), true);
    assert.equal(timingSafeEqual('', 'a'), false);
  });

  test('verifyPasscode succeeds for correct passcode and fails for wrong passcode', async () => {
    const correctPasscode = 'SecurePass890!';
    const wrongPasscode = 'WrongPass890!';

    const { saltHex, hashHex } = await derivePasscodeHash(correctPasscode);

    const isCorrectValid = await verifyPasscode(correctPasscode, saltHex, hashHex);
    assert.equal(isCorrectValid, true, 'Correct passcode must verify successfully');

    const isWrongValid = await verifyPasscode(wrongPasscode, saltHex, hashHex);
    assert.equal(isWrongValid, false, 'Incorrect passcode must fail verification');

    const isEmptyValid = await verifyPasscode('', saltHex, hashHex);
    assert.equal(isEmptyValid, false, 'Empty passcode must fail verification');
  });

  test('timeoutToMs maps autoLockTimeout settings to correct millisecond intervals', () => {
    assert.equal(timeoutToMs('immediate'), 0);
    assert.equal(timeoutToMs('1m'), 60_000);
    assert.equal(timeoutToMs('5m'), 300_000);
    assert.equal(timeoutToMs('15m'), 900_000);
    assert.equal(timeoutToMs(undefined), 300_000);
  });

  test('newAppLockPreferences initializes safe defaults with zero plaintext credentials', () => {
    const prefs = newAppLockPreferences();

    assert.equal(prefs.enabled, false);
    assert.equal(prefs.passcodeHash, undefined);
    assert.equal(prefs.passcodeSalt, undefined);
    assert.equal(prefs.autoLockTimeout, '5m');
    assert.equal(prefs.lockOnBackground, true);
    assert.equal(prefs.biometricsEnabled, false);
    assert.ok(prefs.deviceId && prefs.deviceId.length > 0, 'Unique deviceId generated');
  });
});
