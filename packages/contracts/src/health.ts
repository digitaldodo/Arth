/**
 * Shared API contract for system health status checks.
 */
export interface HealthCheckResponse {
  status: 'ok' | 'error';
  timestamp: string;
  service: string;
  version: string;
  uptimeSeconds: number;
}
