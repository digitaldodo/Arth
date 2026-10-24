import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config/index.js';

/**
 * Registers CORS middleware configured with allowed origins from app configuration.
 */
export async function registerCors(app: FastifyInstance, config: AppConfig): Promise<void> {
  await app.register(cors, {
    origin: config.corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });
}
