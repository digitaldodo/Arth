import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Service } from '../application/service.js';
describe('personalized-categories scaffold', () => {
  it('stays unavailable until its owner enables the module and configures a provider', async () => {
    assert.deepEqual(await new Service().evaluate({} as never), { status: 'unavailable', reason: 'feature_disabled' });
  });
});
