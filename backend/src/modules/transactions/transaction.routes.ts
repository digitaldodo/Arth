import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { AppConfig } from '../../config/index.js';
import {
  ValidationError,
  ConflictError,
  validateCreateTransactionRequest,
  validateTransactionListQuery,
  validateCategoryListQuery,
} from './transaction.validation.js';
import {
  type ITransactionService,
  SupabaseTransactionService,
} from './transaction.service.js';

export interface TransactionRoutesOptions {
  config: AppConfig;
  service?: ITransactionService;
}

export const transactionRoutes: FastifyPluginAsync<TransactionRoutesOptions> = async (
  app: FastifyInstance,
  options: TransactionRoutesOptions
) => {
  const service = options.service || new SupabaseTransactionService(options.config);

  // A. POST /api/v1/transactions - Create authenticated transaction
  app.post(
    '/api/v1/transactions',
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
        const input = validateCreateTransactionRequest(request.body);
        const { transaction, isReplay } = await service.createTransaction(
          request.user.userId,
          input,
          request.token
        );

        const status = isReplay ? 200 : 201;
        return reply.status(status).send({
          transaction,
          idempotent_replay: isReplay,
        });
      } catch (err: unknown) {
        if (err instanceof ValidationError) {
          return reply.status(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: err.message,
          });
        }
        if (err instanceof ConflictError) {
          return reply.status(409).send({
            statusCode: 409,
            error: 'Conflict',
            message: err.message,
          });
        }

        request.log.error(err, 'Failed to process transaction creation');
        return reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'An unexpected error occurred while processing the transaction',
        });
      }
    }
  );

  // B. GET /api/v1/transactions - List authenticated user's active transactions
  app.get(
    '/api/v1/transactions',
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
        const query = validateTransactionListQuery(
          (request.query || {}) as Record<string, unknown>
        );
        const result = await service.listTransactions(
          request.user.userId,
          query,
          request.token
        );

        return reply.status(200).send(result);
      } catch (err: unknown) {
        if (err instanceof ValidationError) {
          return reply.status(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: err.message,
          });
        }

        request.log.error(err, 'Failed to list transactions');
        return reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'An unexpected error occurred while retrieving transactions',
        });
      }
    }
  );

  // C. GET /api/v1/categories - List active categories for caller
  app.get(
    '/api/v1/categories',
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
        const query = validateCategoryListQuery(
          (request.query || {}) as Record<string, unknown>
        );
        const result = await service.listCategories(
          request.user.userId,
          query,
          request.token
        );

        return reply.status(200).send(result);
      } catch (err: unknown) {
        if (err instanceof ValidationError) {
          return reply.status(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: err.message,
          });
        }

        request.log.error(err, 'Failed to list categories');
        return reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'An unexpected error occurred while retrieving categories',
        });
      }
    }
  );
};
