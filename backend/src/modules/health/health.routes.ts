import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { getHealthStatus } from './health.controller.js';

/**
 * Registers the /health endpoint with Fastify.
 */
export const healthRoutes: FastifyPluginAsync = async (app: FastifyInstance): Promise<void> => {
  app.get('/health', async (_request, reply) => {
    const health = getHealthStatus();
    return reply.status(200).send(health);
  });
};
