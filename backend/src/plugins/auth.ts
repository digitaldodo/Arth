import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  createRemoteJWKSet,
  jwtVerify,
  decodeProtectedHeader,
  decodeJwt,
  errors,
} from 'jose';
import type { AppConfig } from '../config/index.js';

export interface AuthenticatedUser {
  userId: string;
  email: string | null;
  role: string;
  exp: number;
}

declare module 'fastify' {
  interface FastifyInstance {
    verifyAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    user?: AuthenticatedUser;
    token?: string;
  }
}

export type TokenVerifier = (token: string) => Promise<AuthenticatedUser>;

interface CachedUser {
  user: AuthenticatedUser;
  expiresAt: number;
}

// In-memory short-lived cache for remote Supabase Auth user validations (TTL: 60s max)
const remoteVerificationCache = new Map<string, CachedUser>();

/**
 * Validates a JWT against Supabase Auth's authoritative /auth/v1/user endpoint.
 * Acts as an authoritative, zero-configuration verification fallback when local
 * symmetric secrets are missing, misconfigured, or when using asymmetric Supabase keys.
 */
async function verifyWithSupabaseAuthUser(
  token: string,
  supabaseUrl: string,
  supabaseAnonKey: string
): Promise<AuthenticatedUser> {
  const now = Date.now();
  const cached = remoteVerificationCache.get(token);
  if (cached && cached.expiresAt > now) {
    return cached.user;
  }

  const cleanUrl = supabaseUrl.replace(/\/$/, '');
  const endpoint = `${cleanUrl}/auth/v1/user`;

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
    },
  });

  if (!response.ok) {
    let errorMsg = `Supabase Auth rejected token with HTTP ${response.status}`;
    try {
      const data = (await response.json()) as Record<string, unknown>;
      if (typeof data?.msg === 'string') errorMsg = data.msg;
      else if (typeof data?.message === 'string') errorMsg = data.message;
      else if (typeof data?.error_description === 'string') errorMsg = data.error_description;
    } catch {
      // response body was not JSON
    }

    if (/expired/i.test(errorMsg)) {
      throw new errors.JWTExpired('Token has expired', {});
    }
    throw new Error(errorMsg);
  }

  const userData = (await response.json()) as {
    id: string;
    email?: string | null;
    role?: string;
  };

  if (!userData?.id || typeof userData.id !== 'string') {
    throw new Error('Supabase Auth user payload is missing valid user ID');
  }

  let exp = 0;
  try {
    const unverifiedPayload = decodeJwt(token);
    if (typeof unverifiedPayload.exp === 'number') {
      exp = unverifiedPayload.exp;
    }
  } catch {
    // ignore undecodable payload for exp
  }

  const user: AuthenticatedUser = {
    userId: userData.id,
    email: typeof userData.email === 'string' ? userData.email : null,
    role: typeof userData.role === 'string' ? userData.role : 'authenticated',
    exp,
  };

  // Cache verified user: 60s or until token exp
  const ttlMs = exp > 0 ? Math.max(5000, Math.min(60_000, exp * 1000 - now)) : 60_000;
  remoteVerificationCache.set(token, { user, expiresAt: now + ttlMs });

  // Bound cache size
  if (remoteVerificationCache.size > 1000) {
    for (const [k, v] of remoteVerificationCache.entries()) {
      if (v.expiresAt <= now) remoteVerificationCache.delete(k);
    }
  }

  return user;
}

/**
 * Creates a robust JWT verification function based on application configuration.
 * Supports:
 *  1. Local symmetric HS256 verification (fastest, zero network).
 *  2. Local asymmetric JWKS verification (RS256, ES256, EdDSA).
 *  3. Authoritative Supabase Auth /user endpoint verification fallback.
 */
export function createTokenVerifier(config: AppConfig): TokenVerifier {
  const cleanedSecret = config.supabaseJwtSecret
    ? config.supabaseJwtSecret.trim().replace(/^["']|["']$/g, '')
    : undefined;
  const secretBytes = cleanedSecret ? new TextEncoder().encode(cleanedSecret) : null;

  const remoteJwks = config.supabaseUrl
    ? createRemoteJWKSet(
        new URL(`${config.supabaseUrl.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`),
        {
          cacheMaxAge: 10 * 60 * 1000, // 10 minutes cache
          cooldownDuration: 30 * 1000, // 30 seconds cooldown between refreshes
        }
      )
    : null;

  return async (token: string): Promise<AuthenticatedUser> => {
    let header;
    try {
      header = decodeProtectedHeader(token);
    } catch {
      throw new Error('Malformed or undecodable token header');
    }

    const alg = header.alg || 'HS256';

    const verifyOptions: Record<string, unknown> = {};
    if (config.jwtAudience) verifyOptions.audience = config.jwtAudience;
    if (config.jwtIssuer) {
      // Supabase tokens may declare iss = `${url}/auth/v1` OR iss = 'supabase'
      verifyOptions.issuer = [config.jwtIssuer, 'supabase'];
    }

    // 1. Symmetric tokens (HS256)
    if (alg.startsWith('HS')) {
      if (secretBytes) {
        try {
          const { payload } = await jwtVerify(token, secretBytes, verifyOptions);

          if (!payload.sub || typeof payload.sub !== 'string') {
            throw new Error('Token subject (sub) is missing or invalid');
          }

          return {
            userId: payload.sub,
            email: typeof payload.email === 'string' ? payload.email : null,
            role: typeof payload.role === 'string' ? payload.role : 'authenticated',
            exp: typeof payload.exp === 'number' ? payload.exp : 0,
          };
        } catch (err) {
          // If token is explicitly expired or claim validation failed, rethrow authoritative error
          if (err instanceof errors.JWTExpired || err instanceof errors.JWTClaimValidationFailed) {
            throw err;
          }

          // If signature verification failed, attempt authoritative remote Supabase verification if configured
          if (config.supabaseUrl && config.supabaseAnonKey) {
            return await verifyWithSupabaseAuthUser(
              token,
              config.supabaseUrl,
              config.supabaseAnonKey
            );
          }
          throw err;
        }
      }

      // If secret is not provided locally, verify against Supabase Auth API
      if (config.supabaseUrl && config.supabaseAnonKey) {
        return await verifyWithSupabaseAuthUser(
          token,
          config.supabaseUrl,
          config.supabaseAnonKey
        );
      }

      throw new Error('JWT verification is not configured for HS256 tokens on the backend');
    }

    // 2. Asymmetric tokens (RS256, ES256, EdDSA)
    if (remoteJwks) {
      try {
        const { payload } = await jwtVerify(token, remoteJwks, verifyOptions);

        if (!payload.sub || typeof payload.sub !== 'string') {
          throw new Error('Token subject (sub) is missing or invalid');
        }

        return {
          userId: payload.sub,
          email: typeof payload.email === 'string' ? payload.email : null,
          role: typeof payload.role === 'string' ? payload.role : 'authenticated',
          exp: typeof payload.exp === 'number' ? payload.exp : 0,
        };
      } catch (err) {
        if (err instanceof errors.JWTExpired || err instanceof errors.JWTClaimValidationFailed) {
          throw err;
        }

        if (config.supabaseUrl && config.supabaseAnonKey) {
          return await verifyWithSupabaseAuthUser(
            token,
            config.supabaseUrl,
            config.supabaseAnonKey
          );
        }
        throw err;
      }
    }

    // 3. Fallback to Supabase Auth if JWKS is not reachable/configured
    if (config.supabaseUrl && config.supabaseAnonKey) {
      return await verifyWithSupabaseAuthUser(
        token,
        config.supabaseUrl,
        config.supabaseAnonKey
      );
    }

    // Fail closed
    throw new Error('JWT verification is not configured on the backend');
  };
}

/**
 * Fastify preHandler hook ensuring the caller presents a verified Supabase JWT.
 */
export function createAuthHook(verifier: TokenVerifier) {
  return async function verifyAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Missing or malformed Authorization header',
      });
      return;
    }

    const token = authHeader.slice(7).trim();

    if (!token) {
      reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Empty Bearer token',
      });
      return;
    }

    try {
      const user = await verifier(token);
      request.user = user;
      request.token = token;
    } catch (err: unknown) {
      // Diagnostic logging without leaking tokens, cookies, or secrets
      request.log.warn(
        {
          errCode: (err as { code?: string })?.code,
          errName: (err as Error)?.name,
          errMsg: (err as Error)?.message,
        },
        'JWT verification rejected'
      );

      if (err instanceof errors.JWTExpired) {
        reply.status(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Token has expired',
        });
        return;
      }

      if (err instanceof errors.JWTClaimValidationFailed) {
        reply.status(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: `Token validation failed: ${err.claim} claim invalid`,
        });
        return;
      }

      reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid or untrusted authentication token',
      });
      return;
    }
  };
}

/**
 * Registers the authentication decorator and preHandler helper on the Fastify instance.
 */
export async function registerAuth(
  app: FastifyInstance,
  config: AppConfig,
  customVerifier?: TokenVerifier
): Promise<void> {
  const verifier = customVerifier || createTokenVerifier(config);
  const authHook = createAuthHook(verifier);

  app.decorate('verifyAuth', authHook);
}
