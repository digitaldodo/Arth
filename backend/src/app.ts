import Fastify, { FastifyInstance } from 'fastify';
import { AppConfig, loadConfig } from './config/index.js';
import { registerCors } from './plugins/cors.js';
import { healthRoutes } from './modules/health/health.routes.js';

/**
 * Fastify application factory function.
 * Enables clean dependency injection, isolation, and standalone test runs.
 */
export async function buildApp(customConfig?: Partial<AppConfig>): Promise<FastifyInstance> {
  const config: AppConfig = {
    ...loadConfig(),
    ...customConfig,
  };

  const app = Fastify({
    logger: config.env !== 'test',
  });

  // Register shared infrastructure plugins
  await registerCors(app, config);

  // Register domain modules
  await app.register(healthRoutes);

  return app;
}
