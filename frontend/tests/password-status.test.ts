import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getPasswordStatus } from '../src/lib/auth/password-status';

describe('explicit password status marker', () => {
  it('recognizes only explicit true and false markers', () => {
    assert.equal(getPasswordStatus({ has_password: true }), 'configured');
    assert.equal(getPasswordStatus({ has_password: false }), 'not_configured');
    assert.equal(getPasswordStatus({}), 'unknown');
    assert.equal(getPasswordStatus(null), 'unknown');
    assert.equal(getPasswordStatus({ email: 'user@example.com' }), 'unknown');
  });
});
