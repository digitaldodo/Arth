# SpendSense Backend (`@arth/backend`)

Fastify 5 REST API service for **SpendSense**, enforcing JWT authentication (`jose`), strict validation, and user-scoped Supabase PostgreSQL/RPC access.

> **Legacy Package Identifier:** `@arth/backend` and `arth-backend` (`render.yaml`) are retained for monorepo and hosting compatibility.

## Modules (`src/modules/`)
- **Active in `src/app.ts`**: `health`, `auth`, `transactions`, `categories`, `people`, `dashboard`, `balances`, `documents`.
- **Pending Split & Registration**: `tax/` (`tax.routes.ts` contains `/api/v1/tax/*` alongside colliding `/api/v1/financial/*` routes; being cleanly separated into `financial-imports/` and `tax/`).
- **Prepared Team Workspaces**: `financial-imports/`, `categorization/`, `safe-to-spend/`, `spending-forecast/`, `emi-affordability/`, `goal-planner/`, `purchase-simulator/`.

## Scripts
```bash
pnpm --filter @arth/backend dev
pnpm --filter @arth/backend typecheck
pnpm --filter @arth/backend test
pnpm --filter @arth/backend build
```
