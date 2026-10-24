import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseINRToPaise,
  paiseToDecimal,
  formatPaiseToINR,
  MAX_SAFE_PAISE,
} from '@arth/contracts';

describe('Financial Utility & Exact Money Calculations', () => {
  test('parses whole integer rupee string to paise', () => {
    assert.equal(parseINRToPaise('250'), 25000n);
    assert.equal(parseINRToPaise('1'), 100n);
    assert.equal(parseINRToPaise('1000'), 100000n);
  });

  test('parses single fractional digit rupee string to paise (e.g. 250.5 -> 25050)', () => {
    assert.equal(parseINRToPaise('250.5'), 25050n);
    assert.equal(parseINRToPaise('0.5'), 50n);
  });

  test('parses two fractional digits rupee string to paise (e.g. 250.50 -> 25050)', () => {
    assert.equal(parseINRToPaise('250.50'), 25050n);
    assert.equal(parseINRToPaise('0.01'), 1n);
    assert.equal(parseINRToPaise('0.99'), 99n);
    assert.equal(parseINRToPaise('1234567.89'), 123456789n);
  });

  test('rejects zero amounts', () => {
    assert.throws(() => parseINRToPaise('0'), /strictly greater than zero/);
    assert.throws(() => parseINRToPaise('0.0'), /strictly greater than zero/);
    assert.throws(() => parseINRToPaise('0.00'), /strictly greater than zero/);
  });

  test('rejects negative amounts', () => {
    assert.throws(() => parseINRToPaise('-10'), /Invalid amount format/);
    assert.throws(() => parseINRToPaise('-0.50'), /Invalid amount format/);
  });

  test('rejects excessive fractional precision (> 2 decimal digits)', () => {
    assert.throws(() => parseINRToPaise('250.555'), /Invalid amount format/);
    assert.throws(() => parseINRToPaise('10.1234'), /Invalid amount format/);
  });

  test('rejects malformed or non-numeric strings', () => {
    assert.throws(() => parseINRToPaise(''), /cannot be empty/);
    assert.throws(() => parseINRToPaise('abc'), /Invalid amount format/);
    assert.throws(() => parseINRToPaise('12.3.4'), /Invalid amount format/);
    assert.throws(() => parseINRToPaise('10,000'), /Invalid amount format/);
    assert.throws(() => parseINRToPaise('$50'), /Invalid amount format/);
    assert.throws(() => parseINRToPaise('₹50'), /Invalid amount format/);
  });

  test('rejects numbers exceeding MAX_SAFE_PAISE limit', () => {
    // MAX_SAFE_PAISE is 9,007,199,254,740,991n (~90 trillion INR)
    const tooLargeRupees = '9007199254740992'; // exceeds limit when multiplied by 100
    assert.throws(() => parseINRToPaise(tooLargeRupees), /maximum allowable financial limit/);
  });

  test('converts paise to exact decimal strings without float drift', () => {
    assert.equal(paiseToDecimal(25000n), '250.00');
    assert.equal(paiseToDecimal(25050n), '250.50');
    assert.equal(paiseToDecimal(1n), '0.01');
    assert.equal(paiseToDecimal(50n), '0.50');
    assert.equal(paiseToDecimal(123456789n), '1234567.89');
  });

  test('formats paise into Indian Rupee notation with proper grouping', () => {
    assert.equal(formatPaiseToINR(25000n), '₹250.00');
    assert.equal(formatPaiseToINR(25050n), '₹250.50');
    assert.equal(formatPaiseToINR(1n), '₹0.01');
    assert.equal(formatPaiseToINR(123456789n), '₹12,34,567.89'); // 12 lakh 34 thousand 567 rupees 89 paise
  });
});
