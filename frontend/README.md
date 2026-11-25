# SpendSense Web (`@arth/frontend`)

Next.js 16 (App Router) web and installable PWA application for **SpendSense**.

> **Legacy Package Identifier:** `@arth/frontend` is retained for workspace and deployment compatibility (`vercel.json`, `package.json`).

## Architecture Highlights
- **App Router & BFF (`src/app/`)**: Server-rendered auth pages, session refresh proxy (`src/proxy.ts`), and `/api/backend/*` proxies forwarding `HttpOnly` session JWTs to SpendSense Backend.
- **Feature Modules (`src/features/`)**: `dashboard`, `transactions`, `categories`, `people`, `imports`, `categorization`, `tax`, `app-lock`, `settings`, `sync`, `pwa`, plus prepared workspaces for `safe-to-spend`, `spending-forecast`, `emi-affordability`, `goal-planner`, and `purchase-simulator`.
- **Privacy-First Local Processing**: Bank statements and tax documents (PDF, CSV, XLSX/XLS, optional Tesseract OCR) are parsed locally in the browser; raw files are never uploaded by default.
- **Offline Cache**: IndexedDB (`arth_offline_db` v7 in `src/lib/offline-db.ts`) and `syncEngine` (`src/features/sync/sync-engine.ts`).

## Scripts
```bash
pnpm --filter @arth/frontend dev
pnpm --filter @arth/frontend typecheck
pnpm --filter @arth/frontend lint
pnpm --filter @arth/frontend test
pnpm --filter @arth/frontend build
```
