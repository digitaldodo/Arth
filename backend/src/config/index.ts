/**
 * Backend environment configuration and validation.
 */
export interface AppConfig {
  env: 'development' | 'production' | 'test';
  port: number;
  host: string;
  corsOrigin: string | string[];
  supabaseUrl?: string;
  supabaseJwtSecret?: string;
  jwtAudience: string;
  jwtIssuer?: string;
}

export function loadConfig(): AppConfig {
  const env = (process.env.NODE_ENV as AppConfig['env']) || 'development';
  const rawPort = process.env.PORT || '3001';
  const port = parseInt(rawPort, 10);
  const host = process.env.HOST || '0.0.0.0';
  const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseJwtSecret = process.env.SUPABASE_JWT_SECRET;
  const jwtAudience = process.env.JWT_AUDIENCE || 'authenticated';
  const jwtIssuer =
    process.env.JWT_ISSUER ||
    (supabaseUrl ? `${supabaseUrl.replace(/\/$/, '')}/auth/v1` : undefined);

  return {
    env,
    port: isNaN(port) ? 3001 : port,
    host,
    corsOrigin: corsOrigin.includes(',')
      ? corsOrigin.split(',').map((o) => o.trim())
      : corsOrigin,
    supabaseUrl,
    supabaseJwtSecret,
    jwtAudience,
    jwtIssuer,
  };
}
