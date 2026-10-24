import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import type { HealthCheckResponse } from '@arth/contracts';

describe('Health Module', () => {
  test('GET /health returns 200 with valid health status contract', async () => {
    const app = await buildApp({ env: 'test' });

    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    assert.equal(response.statusCode, 200);
    const payload: HealthCheckResponse = JSON.parse(response.body);

    assert.equal(payload.status, 'ok');
    assert.equal(payload.service, 'arth-backend');
    assert.equal(payload.version, '0.1.0');
    assert.equal(typeof payload.uptimeSeconds, 'number');
    assert.ok(!isNaN(Date.parse(payload.timestamp)));

    await app.close();
  });
});
