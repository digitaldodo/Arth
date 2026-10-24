/**
 * Backend environment configuration and validation.
 */
export interface AppConfig {
  env: 'development' | 'production' | 'test';
  port: number;
  host: string;
  corsOrigin: string | string[];
}

export function loadConfig(): AppConfig {
  const env = (process.env.NODE_ENV as AppConfig['env']) || 'development';
  const rawPort = process.env.PORT || '3001';
  const port = parseInt(rawPort, 10);
  const host = process.env.HOST || '0.0.0.0';
  const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';

  return {
    env,
    port: isNaN(port) ? 3001 : port,
    host,
    corsOrigin: corsOrigin.includes(',')
      ? corsOrigin.split(',').map((o) => o.trim())
      : corsOrigin,
  };
}
