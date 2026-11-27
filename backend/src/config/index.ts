/**
 * Backend environment configuration and validation.
 */
export interface AppConfig {
  env: 'development' | 'production' | 'test';
  port: number;
  host: string;
  corsOrigin: string | string[];
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supabaseJwtSecret?: string;
  jwtAudience: string;
  jwtIssuer?: string;
}

export function loadConfig(): AppConfig {
  const env = (process.env.NODE_ENV as AppConfig['env']) || 'development';
  const rawPort = process.env.PORT || '3001';
  const port = parseInt(rawPort, 10);
  const host = process.env.HOST || '0.0.0.0';
  const rawCors = process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:3002';
  const corsOrigin = rawCors.includes(',')
    ? rawCors.split(',').map((o) => o.trim())
    : rawCors;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseJwtSecret = process.env.SUPABASE_JWT_SECRET;
  const jwtAudience = process.env.JWT_AUDIENCE || 'authenticated';
  const jwtIssuer =
    process.env.JWT_ISSUER ||
    (supabaseUrl ? `${supabaseUrl.replace(/\/$/, '')}/auth/v1` : undefined);

  return {
    env,
    port: isNaN(port) ? 3001 : port,
    host,
    corsOrigin,
    supabaseUrl,
    supabaseAnonKey,
    supabaseJwtSecret,
    jwtAudience,
    jwtIssuer,
  };
}
