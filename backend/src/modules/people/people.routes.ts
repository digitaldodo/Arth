import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { AppConfig } from '../../config/index.js';
import {
  ValidationError,
  ConflictError,
  NotFoundError,
  validateCreatePersonRequest,
  validateUpdatePersonRequest,
  validateArchivePersonRequest,
  validateCreatePersonRecordRequest,
  validateRecordSettlementRequest,
  validatePersonListQuery,
} from './people.validation.js';
import {
  type IPeopleService,
  SupabasePeopleService,
} from './people.service.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PeopleRoutesOptions {
  config: AppConfig;
  service?: IPeopleService;
}

export const peopleRoutes: FastifyPluginAsync<PeopleRoutesOptions> = async (
  app: FastifyInstance,
  options: PeopleRoutesOptions
) => {
  const service = options.service || new SupabasePeopleService(options.config);

  // 1. GET /api/v1/people - List people
  app.get(
    '/api/v1/people',
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
        const query = validatePersonListQuery(
          (request.query || {}) as Record<string, unknown>
        );
        const result = await service.listPeople(
          request.user.userId,
          query,
          request.token
        );
        return reply.status(200).send(result);
      } catch (err: unknown) {
        if (err instanceof ValidationError) {
          return reply.status(err.statusCode).send({
            statusCode: err.statusCode,
            error: 'Bad Request',
            message: err.message,
          });
        }
        request.log.error(err);
        return reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'Failed to list people',
        });
      }
    }
  );

  // 2. POST /api/v1/people - Create person
  app.post(
    '/api/v1/people',
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
        const input = validateCreatePersonRequest(
          request.body as Record<string, unknown>
        );
        const person = await service.createPerson(
          request.user.userId,
          input,
          request.token
        );
        return reply.status(201).send({ person });
      } catch (err: unknown) {
        if (err instanceof ValidationError) {
          return reply.status(err.statusCode).send({
            statusCode: err.statusCode,
            error: 'Bad Request',
            message: err.message,
          });
        }
        if (err instanceof ConflictError) {
          return reply.status(err.statusCode).send({
            statusCode: err.statusCode,
            error: 'Conflict',
            message: err.message,
          });
        }
        request.log.error(err);
        return reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'Failed to create person',
        });
      }
    }
  );

  // 3. GET /api/v1/people/:id - Retrieve person details & records
  app.get(
    '/api/v1/people/:id',
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
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Person ID must be a valid UUID',
        });
      }

      try {
        const result = await service.getPerson(
          request.user.userId,
          id,
          request.token
        );
        return reply.status(200).send(result);
      } catch (err: unknown) {
        if (err instanceof NotFoundError) {
          return reply.status(err.statusCode).send({
            statusCode: err.statusCode,
            error: 'Not Found',
            message: err.message,
          });
        }
        request.log.error(err);
        return reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'Failed to retrieve person details',
        });
      }
    }
  );

  // 4. PATCH /api/v1/people/:id - Update person (rename / direction)
  app.patch(
    '/api/v1/people/:id',
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
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Person ID must be a valid UUID',
        });
      }

      try {
        const input = validateUpdatePersonRequest(
          request.body as Record<string, unknown>
        );
        const person = await service.updatePerson(
          request.user.userId,
          id,
          input,
          request.token
        );
        return reply.status(200).send({ person });
      } catch (err: unknown) {
        if (err instanceof ValidationError) {
          return reply.status(err.statusCode).send({
            statusCode: err.statusCode,
            error: 'Bad Request',
            message: err.message,
          });
        }
        if (err instanceof ConflictError) {
          return reply.status(err.statusCode).send({
            statusCode: err.statusCode,
            error: 'Conflict',
            message: err.message,
          });
        }
        if (err instanceof NotFoundError) {
          return reply.status(err.statusCode).send({
            statusCode: err.statusCode,
            error: 'Not Found',
            message: err.message,
          });
        }
        request.log.error(err);
        return reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'Failed to update person',
        });
      }
    }
  );

  // 5. PATCH /api/v1/people/:id/archive - Archive / restore person
  app.patch(
    '/api/v1/people/:id/archive',
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
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Person ID must be a valid UUID',
        });
      }

      try {
        const input = validateArchivePersonRequest(
          request.body as Record<string, unknown>
        );
        const person = await service.archivePerson(
          request.user.userId,
          id,
          input,
          request.token
        );
        return reply.status(200).send({ person });
      } catch (err: unknown) {
        if (err instanceof ValidationError) {
          return reply.status(err.statusCode).send({
            statusCode: err.statusCode,
            error: 'Bad Request',
            message: err.message,
          });
        }
        if (err instanceof NotFoundError) {
          return reply.status(err.statusCode).send({
            statusCode: err.statusCode,
            error: 'Not Found',
            message: err.message,
          });
        }
        request.log.error(err);
        return reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'Failed to archive/restore person',
        });
      }
    }
  );

  // 6. POST /api/v1/people/:id/records - Add named money record
  app.post(
    '/api/v1/people/:id/records',
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
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Person ID must be a valid UUID',
        });
      }

      try {
        const input = validateCreatePersonRecordRequest(
          request.body as Record<string, unknown>
        );
        const result = await service.createRecord(
          request.user.userId,
          id,
          input,
          request.token
        );
        return reply.status(201).send(result);
      } catch (err: unknown) {
        if (err instanceof ValidationError) {
          return reply.status(err.statusCode).send({
            statusCode: err.statusCode,
            error: 'Bad Request',
            message: err.message,
          });
        }
        if (err instanceof ConflictError) {
          return reply.status(err.statusCode).send({
            statusCode: err.statusCode,
            error: 'Conflict',
            message: err.message,
          });
        }
        if (err instanceof NotFoundError) {
          return reply.status(err.statusCode).send({
            statusCode: err.statusCode,
            error: 'Not Found',
            message: err.message,
          });
        }
        request.log.error(err);
        return reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'Failed to create money record',
        });
      }
    }
  );

  // 7. POST /api/v1/people/records/:recordId/settlements - Record payment/collection
  app.post(
    '/api/v1/people/records/:recordId/settlements',
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

      const { recordId } = request.params as { recordId: string };
      if (!UUID_REGEX.test(recordId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Record ID must be a valid UUID',
        });
      }

      try {
        const input = validateRecordSettlementRequest(
          request.body as Record<string, unknown>
        );
        const result = await service.recordSettlement(
          request.user.userId,
          recordId,
          input,
          request.token
        );
        return reply.status(201).send(result);
      } catch (err: unknown) {
        if (err instanceof ValidationError) {
          return reply.status(err.statusCode).send({
            statusCode: err.statusCode,
            error: 'Bad Request',
            message: err.message,
          });
        }
        if (err instanceof ConflictError) {
          return reply.status(err.statusCode).send({
            statusCode: err.statusCode,
            error: 'Conflict',
            message: err.message,
          });
        }
        if (err instanceof NotFoundError) {
          return reply.status(err.statusCode).send({
            statusCode: err.statusCode,
            error: 'Not Found',
            message: err.message,
          });
        }
        request.log.error(err);
        return reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'Failed to record settlement',
        });
      }
    }
  );
};
