import Fastify, { FastifyInstance } from 'fastify';
import { AppConfig, loadConfig } from './config/index.js';
import { registerCors } from './plugins/cors.js';
import { registerAuth, TokenVerifier } from './plugins/auth.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { transactionRoutes } from './modules/transactions/transaction.routes.js';
import type { ITransactionService } from './modules/transactions/transaction.service.js';
import { categoryRoutes } from './modules/categories/category.routes.js';
import type { ICategoryService } from './modules/categories/category.service.js';
import { peopleRoutes } from './modules/people/people.routes.js';
import type { IPeopleService } from './modules/people/people.service.js';
import { dashboardRoutes } from './modules/dashboard/dashboard.routes.js';
import type { IDashboardService } from './modules/dashboard/dashboard.service.js';
import { balanceRoutes } from './modules/balances/balance.routes.js';
import type { IBalanceService } from './modules/balances/balance.service.js';
import { documentsRoutes } from './modules/documents/documents.routes.js';
import type { IDocumentsService } from './modules/documents/documents.service.js';

/**
 * Fastify application factory function.
 * Enables clean dependency injection, isolation, and standalone test runs.
 */
export async function buildApp(
  customConfig?: Partial<AppConfig>,
  customVerifier?: TokenVerifier,
  customTransactionService?: ITransactionService,
  customCategoryService?: ICategoryService,
  customPeopleService?: IPeopleService,
  customDashboardService?: IDashboardService,
  customBalanceService?: IBalanceService,
  customDocumentsService?: IDocumentsService
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
  await app.register(transactionRoutes, {
    config,
    service: customTransactionService,
  });
  await app.register(categoryRoutes, {
    config,
    service: customCategoryService,
  });
  await app.register(peopleRoutes, {
    config,
    service: customPeopleService,
  });
  await app.register(dashboardRoutes, {
    config,
    service: customDashboardService,
  });
  await app.register(balanceRoutes, {
    config,
    service: customBalanceService,
  });
  await app.register(documentsRoutes, {
    config,
    service: customDocumentsService,
  });
  return app;
}
