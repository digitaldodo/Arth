import type { FastifyPluginAsync } from 'fastify';
import type { AppConfig } from '../../config/index.js';
import {
  SupabaseDashboardService,
  type IDashboardService,
} from './dashboard.service.js';
import {
  ValidationError,
  validateDashboardSummaryQuery,
} from './dashboard.validation.js';

export interface DashboardRouteOptions {
  config: AppConfig;
  service?: IDashboardService;
}

export const dashboardRoutes: FastifyPluginAsync<DashboardRouteOptions> = async (
  app,
  opts
) => {
  const service = opts.service || new SupabaseDashboardService(opts.config);

  /**
   * GET /api/v1/dashboard/summary?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
   * Returns aggregated financial summary for the caller in the specified inclusive date range.
   */
  app.get(
    '/api/v1/dashboard/summary',
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
        const validatedQuery = validateDashboardSummaryQuery(request.query);
        const result = await service.getSummary(
          request.user.userId,
          validatedQuery,
          request.token
        );
        return reply.code(200).send(result);
      } catch (err: unknown) {
        if (err instanceof ValidationError) {
          return reply.code(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: err.message,
          });
        }
        throw err;
      }
    }
  );
};
