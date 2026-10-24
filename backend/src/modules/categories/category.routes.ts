import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { AppConfig } from '../../config/index.js';
import {
  ValidationError,
  ConflictError,
  NotFoundError,
  validateCreateCategoryRequest,
  validateUpdateCategoryRequest,
  validateArchiveCategoryRequest,
  validateReorderCategoriesRequest,
  validateCategoryListQuery,
} from './category.validation.js';
import {
  type ICategoryService,
  SupabaseCategoryService,
} from './category.service.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CategoryRoutesOptions {
  config: AppConfig;
  service?: ICategoryService;
}

export const categoryRoutes: FastifyPluginAsync<CategoryRoutesOptions> = async (
  app: FastifyInstance,
  options: CategoryRoutesOptions
) => {
  const service = options.service || new SupabaseCategoryService(options.config);

  // 1. GET /api/v1/categories - List caller categories
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

  // 2. POST /api/v1/categories - Create category
  app.post(
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
        const input = validateCreateCategoryRequest(request.body);
        const category = await service.createCategory(
          request.user.userId,
          input,
          request.token
        );
        return reply.status(201).send({ category });
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
        request.log.error(err, 'Failed to create category');
        return reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'An unexpected error occurred while creating category',
        });
      }
    }
  );

  // 3. PUT /api/v1/categories/reorder - Atomic reordering
  app.put(
    '/api/v1/categories/reorder',
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
        const input = validateReorderCategoriesRequest(request.body);
        const result = await service.reorderCategories(
          request.user.userId,
          input,
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
        request.log.error(err, 'Failed to reorder categories');
        return reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'An unexpected error occurred while reordering categories',
        });
      }
    }
  );

  // 4. PATCH /api/v1/categories/:id - Update category metadata
  app.patch(
    '/api/v1/categories/:id',
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

      const { id } = request.params as { id: string };
      if (!id || !UUID_REGEX.test(id)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid category UUID parameter',
        });
      }

      try {
        const input = validateUpdateCategoryRequest(request.body);
        const category = await service.updateCategory(
          request.user.userId,
          id.toLowerCase(),
          input,
          request.token
        );
        return reply.status(200).send({ category });
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
        if (err instanceof NotFoundError) {
          return reply.status(404).send({
            statusCode: 404,
            error: 'Not Found',
            message: err.message,
          });
        }
        request.log.error(err, 'Failed to update category');
        return reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'An unexpected error occurred while updating category',
        });
      }
    }
  );

  // 5. PATCH /api/v1/categories/:id/archive - Non-destructive archive/restore
  app.patch(
    '/api/v1/categories/:id/archive',
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

      const { id } = request.params as { id: string };
      if (!id || !UUID_REGEX.test(id)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid category UUID parameter',
        });
      }

      try {
        const input = validateArchiveCategoryRequest(request.body);
        const category = await service.archiveCategory(
          request.user.userId,
          id.toLowerCase(),
          input,
          request.token
        );
        return reply.status(200).send({ category });
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
        if (err instanceof NotFoundError) {
          return reply.status(404).send({
            statusCode: 404,
            error: 'Not Found',
            message: err.message,
          });
        }
        request.log.error(err, 'Failed to archive/restore category');
        return reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'An unexpected error occurred while modifying category status',
        });
      }
    }
  );
};
