import Fastify, { FastifyInstance } from 'fastify';
import { AppConfig, loadConfig } from './config/index.js';
import { registerCors } from './plugins/cors.js';
import { registerAuth, TokenVerifier } from './plugins/auth.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';

/**
 * Fastify application factory function.
 * Enables clean dependency injection, isolation, and standalone test runs.
 */
export async function buildApp(
  customConfig?: Partial<AppConfig>,
  customVerifier?: TokenVerifier
): Promise<FastifyInstance> {
  const config: AppConfig = {
    ...loadConfig(),
    ...customConfig,
  };

  const app = Fastify({
    logger: config.env !== 'test',
  });

  // Register shared infrastructure plugins
  await registerCors(app, config);
  await registerAuth(app, config, customVerifier);

  // Register domain modules
  await app.register(healthRoutes);
  await app.register(authRoutes);

  return app;
}
