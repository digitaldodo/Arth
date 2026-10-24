import type { HealthCheckResponse } from '@arth/contracts';

const serviceStartTime = Date.now();

/**
 * Returns current health status strictly conforming to @arth/contracts.
 */
export function getHealthStatus(): HealthCheckResponse {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'arth-backend',
    version: '0.1.0',
    uptimeSeconds: Math.floor((Date.now() - serviceStartTime) / 1000),
  };
}
