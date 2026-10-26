import type { FastifyPluginAsync } from 'fastify';
import type { AppConfig } from '../../config/index.js';
import {
  SupabaseBalanceService,
  type IBalanceService,
} from './balance.service.js';
import {
  BalanceValidationError,
  validateConfigureStartingBalances,
  validateCreateTransfer,
  validateCreateAdjustment,
} from './balance.validation.js';

export interface BalanceRouteOptions {
  config: AppConfig;
  service?: IBalanceService;
}

export const balanceRoutes: FastifyPluginAsync<BalanceRouteOptions> = async (
  app,
  opts
) => {
  const service = opts.service || new SupabaseBalanceService(opts.config);

  /**
   * GET /api/v1/balances
   * Returns current account balances (Cash, Online, Total Available, and Starting balances).
   */
  app.get(
    '/api/v1/balances',
    {
      preHandler: [app.verifyAuth],
    },
    async (request, reply) => {
      if (!request.user) {
        return reply.status(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Authentication required',
        });
      }

      try {
        const balances = await service.getBalances(
          request.user.userId,
          request.token
        );
        return reply.code(200).send(balances);
      } catch (err: unknown) {
        request.log.error(err, 'Failed to fetch account balances');
        return reply.code(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message:
            err instanceof Error ? err.message : 'Failed to fetch account balances',
        });
      }
    }
  );

  /**
   * POST /api/v1/balances/starting
   * Sets or updates the user's initial starting Cash and Online balances.
   */
  app.post(
    '/api/v1/balances/starting',
    {
      preHandler: [app.verifyAuth],
    },
    async (request, reply) => {
      if (!request.user) {
        return reply.status(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Authentication required',
        });
      }

      try {
        const validated = validateConfigureStartingBalances(request.body);
        const balances = await service.configureStartingBalances(
          request.user.userId,
          validated,
          request.token
        );
        return reply.code(200).send(balances);
      } catch (err: unknown) {
        if (err instanceof BalanceValidationError) {
          return reply.code(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: err.message,
          });
        }
        request.log.error(err, 'Failed to configure starting balances');
        return reply.code(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message:
            err instanceof Error
              ? err.message
              : 'Failed to configure starting balances',
        });
      }
    }
  );

  /**
   * POST /api/v1/balances/transfers
   * Records an internal transfer between Cash and Online balances.
   */
  app.post(
    '/api/v1/balances/transfers',
    {
      preHandler: [app.verifyAuth],
    },
    async (request, reply) => {
      if (!request.user) {
        return reply.status(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Authentication required',
        });
      }

      try {
        const validated = validateCreateTransfer(request.body);
        const result = await service.createTransfer(
          request.user.userId,
          validated,
          request.token
        );
        return reply.code(201).send(result);
      } catch (err: unknown) {
        if (err instanceof BalanceValidationError) {
          return reply.code(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: err.message,
          });
        }
        request.log.error(err, 'Failed to record transfer');
        return reply.code(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message:
            err instanceof Error ? err.message : 'Failed to record transfer',
        });
      }
    }
  );

  /**
   * POST /api/v1/balances/adjustments
   * Records an auditable balance correction (adjustment) with a required reason.
   */
  app.post(
    '/api/v1/balances/adjustments',
    {
      preHandler: [app.verifyAuth],
    },
    async (request, reply) => {
      if (!request.user) {
        return reply.status(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Authentication required',
        });
      }

      try {
        const validated = validateCreateAdjustment(request.body);
        const result = await service.createAdjustment(
          request.user.userId,
          validated,
          request.token
        );
        return reply.code(201).send(result);
      } catch (err: unknown) {
        if (err instanceof BalanceValidationError) {
          return reply.code(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: err.message,
          });
        }
        request.log.error(err, 'Failed to record balance adjustment');
        return reply.code(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message:
            err instanceof Error ? err.message : 'Failed to record balance adjustment',
        });
      }
    }
  );

  /**
   * GET /api/v1/balances/movements
   * Retrieves balance movement audit log (transfers and adjustments).
   */
  app.get(
    '/api/v1/balances/movements',
    {
      preHandler: [app.verifyAuth],
    },
    async (request, reply) => {
      if (!request.user) {
        return reply.status(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Authentication required',
        });
      }

      try {
        const result = await service.getMovements(
          request.user.userId,
          request.token
        );
        return reply.code(200).send(result);
      } catch (err: unknown) {
        request.log.error(err, 'Failed to fetch balance movements');
        return reply.code(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message:
            err instanceof Error
              ? err.message
              : 'Failed to fetch balance movements',
        });
      }
    }
  );
};
