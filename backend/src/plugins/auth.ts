import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createRemoteJWKSet, jwtVerify, errors } from 'jose';
import type { AppConfig } from '../config/index.js';

export interface AuthenticatedUser {
  userId: string;
  email: string | null;
  role: string;
  exp: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

export type TokenVerifier = (token: string) => Promise<AuthenticatedUser>;

/**
 * Creates a JWT verification function based on application configuration.
 */
export function createTokenVerifier(config: AppConfig): TokenVerifier {
  // 1. Symmetric Secret (HS256) - standard Supabase JWT secret
  if (config.supabaseJwtSecret) {
    const secretBytes = new TextEncoder().encode(config.supabaseJwtSecret);

    return async (token: string): Promise<AuthenticatedUser> => {
      const verifyOptions: Record<string, unknown> = {};
      if (config.jwtAudience) verifyOptions.audience = config.jwtAudience;
      if (config.jwtIssuer) verifyOptions.issuer = config.jwtIssuer;

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
    };
  }

  // 2. Asymmetric JWKS (RS256 / ES256) - remote Supabase JWKS endpoint
  if (config.supabaseUrl) {
    const jwksUrl = new URL(
      `${config.supabaseUrl.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`
    );
    const JWKS = createRemoteJWKSet(jwksUrl, {
      cacheMaxAge: 10 * 60 * 1000, // 10 minutes cache
      cooldownDuration: 30 * 1000, // 30 seconds cooldown between refreshes
    });

    return async (token: string): Promise<AuthenticatedUser> => {
      const verifyOptions: Record<string, unknown> = {};
      if (config.jwtAudience) verifyOptions.audience = config.jwtAudience;
      if (config.jwtIssuer) verifyOptions.issuer = config.jwtIssuer;

      const { payload } = await jwtVerify(token, JWKS, verifyOptions);

      if (!payload.sub || typeof payload.sub !== 'string') {
        throw new Error('Token subject (sub) is missing or invalid');
      }

      return {
        userId: payload.sub,
        email: typeof payload.email === 'string' ? payload.email : null,
        role: typeof payload.role === 'string' ? payload.role : 'authenticated',
        exp: typeof payload.exp === 'number' ? payload.exp : 0,
      };
    };
  }

  // 3. Fallback for unconfigured dev/test: Fail closed
  return async () => {
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
    } catch (err: unknown) {
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
