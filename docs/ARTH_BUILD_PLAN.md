# Arth — Build Plan

> Version 0.1 — Phase 00 Baseline  
> Last updated: 2026-10-25

---

## Phase 00 — Audit & Architecture ✅

**Status**: Complete  
**Deliverables**:
- [x] Workspace audit (empty repo confirmed)
- [x] `ANTIGRAVITY.md` — persistent agent instruction file
- [x] `docs/ARTH_ARCHITECTURE.md` — full architecture document
- [x] `docs/ARTH_BUILD_PLAN.md` — this file
- [x] `docs/ARTH_ROADMAP.md` — phase-level roadmap

**Decisions locked in this phase**:
- Next.js 15 App Router + TypeScript strict
- shadcn/ui + Tailwind CSS v4
- Supabase PostgreSQL + Auth
- Paise-as-integer money storage
- UUID v7 transaction IDs
- Outbox pattern for Sheets sync
- Dexie.js / IndexedDB deferred to Phase 03

---

## Phase 01 — Foundation (Scaffold, Auth, DB, Transaction CRUD)

**Goal**: A working, deployed web app where the owner can log in, enter transactions, and view a basic dashboard. No Sheets sync yet. No offline. No bulk import.

### 01-A · UX Architecture, IA & User Flows (Prerequisite) ✅

| Task | Details |
|---|---|
| UX Blueprint | Complete `docs/ARTH_UX_BLUEPRINT.md` establishing IA, mobile-first navigation, progressive disclosure, 7 core user flows, and interaction rules |
| UX Approval | Owner review and approval of `docs/ARTH_UX_BLUEPRINT.md` |

### 01-B · Visual Direction Exploration ✅

| Task | Details |
|---|---|
| Visual Exploration | Explore 3 distinct visual directions in `docs/ARTH_VISUAL_DIRECTION.md` and interactive preview |
| Visual Decision | Owner selected Concept 1: Ledger Minimal |

### 01-C · Ledger Minimal Design System ✅

| Task | Details |
|---|---|
| Design System Spec | Complete `docs/ARTH_DESIGN_SYSTEM.md` establishing semantic color tokens, Inter/Geist Mono typography, 4px grid geometry, reusable component states, and approved UX decisions |
| Design System Review| Owner review of design system specifications prior to prototype |

### 01-D · Screen-Level Prototype ✅

| Task | Details | Status |
|---|---|---|
| Interactive Prototype | Screen-level prototype implementing Ledger Minimal across Dashboard, Quick Entry, Ledger, Categories, and Settings (`docs/design-concepts/arth-prototype.html`) | Complete ✅ |
| Responsiveness & Review | Fixed mobile navigation, bottom sheet quick add, zero horizontal overflow at 360px, 390px, 768px, 1120px; 12 verification screenshots saved | Complete ✅ |
| Prototype Approval | Owner sign-off documented in `docs/ARTH_PROTOTYPE_REVIEW.md` | Complete ✅ |

### 01-E · Project Scaffold & Tooling Setup ✅

| Task | Details | Status |
|---|---|---|
| Init Next.js App Router | Next.js 16 (App Router) + React 19 + TypeScript strict + Tailwind CSS v4 initialized in `d:\Forge\Per` with `pnpm` | Complete ✅ |
| Project Structure | Established `src/app/`, `src/components/`, `src/lib/`, `src/features/`, `public/`, `docs/` | Complete ✅ |
| Ledger Minimal Design Tokens | Semantic color tokens (Warm Paper `#FBFBF9` light, Obsidian `#0C0A09` dark) integrated into `src/app/globals.css` and Tailwind `@theme` | Complete ✅ |
| Typography & Font Optimization | Configured `next/font/google` for `Inter` (UI) and `Geist Mono` (tabular financial figures) | Complete ✅ |
| Currency Utility & Theme Toggle | Created `src/lib/format.ts` (paise to INR) and `src/components/ThemeToggle.tsx` (dual theme support) | Complete ✅ |
| Deliberate Foundation Page | Rendered honest, minimal Arth foundation placeholder at `src/app/page.tsx` | Complete ✅ |
| Core Tooling & Strict Config | `tsconfig.json` with strict mode and `@/*` alias, ESLint 9 (`next/core-web-vitals`), `README.md`, `.gitignore`, `.env.example` | Complete ✅ |
| Quality Gates Verification | `pnpm install`, `pnpm lint` (0 errors), `pnpm typecheck` (0 errors), `pnpm build` (clean), and CDP browser inspection (0 console errors, exact RGB matches) | Complete ✅ |
| Git Repository Init | Git initialized with verified `.gitignore` excluding build artifacts and secrets | Complete ✅ |

### 01-F · Modular Monorepo Architecture & Backend Foundation ✅

| Task | Details | Status |
|---|---|---|
| Monorepo Workspace | Configured `pnpm-workspace.yaml` and root `package.json` with scripts for `dev`, `build`, `lint`, `typecheck`, `test` | Complete ✅ |
| Frontend Decoupling | Migrated Next.js 16 app into `frontend/` package (`@arth/frontend`); zero database credentials or server-role keys | Complete ✅ |
| Feature Slices & UI Primitives | Structured `frontend/src/` with `features/` (dashboard, transactions, categories, settings), `components/` (ui, layout), and `lib/api-client/` | Complete ✅ |
| Shared Contracts Package | Created `packages/contracts/` (`@arth/contracts`) exporting typed API interfaces (`HealthCheckResponse`) | Complete ✅ |
| Fastify Backend Foundation | Implemented `@arth/backend` with configuration loader, CORS plugin, health module, and `buildApp()` factory | Complete ✅ |
| Health Route & Automated Tests | Built `GET /health` endpoint; verified with automated unit tests using Node.js test runner | Complete ✅ |
| Supabase Directory | Established root `supabase/` directory with `migrations/`, `tests/`, and `config.toml` | Complete ✅ |
| ADR-001 Documentation | Authored `docs/decisions/ADR-001-modular-monorepo.md` documenting separation rationale, boundaries, and security flow | Complete ✅ |
| Quality Gates Verification | `pnpm install`, workspace `typecheck`, backend tests, frontend build, backend health query, and browser inspection all passed with 0 errors | Complete ✅ |

### 01-G · Supabase Database Schema, Migrations & Row-Level Security ✅

| Task | Details | Status |
|---|---|---|
| Migration 0001: Profiles | `public.profiles` referencing `auth.users(id)` with `Asia/Kolkata` and `INR` defaults | Complete ✅ |
| Migration 0002: Categories | `public.categories` with `type` (income/expense), non-destructive `archived_at`, and composite uniqueness | Complete ✅ |
| Migration 0003: Transactions | `public.transactions` with integer paise (`BIGINT > 0`), necessity checks, and composite category FK | Complete ✅ |
| Migration 0004: Outbox Events | `public.outbox_events` table and atomic trigger `trg_transactions_outbox` capturing create/update/delete/restore | Complete ✅ |
| Migration 0005: RLS & Grants | Row-Level Security enabled on all tables; least privilege grants; `outbox_events` restricted from normal users | Complete ✅ |
| Migration 0006: Auth Trigger | `fn_handle_new_user()` auto-creating profile and seeding approved 15 default categories | Complete ✅ |
| Migration 0007: Indexes | Optimized covering indexes for active ledger date, category lookup, and FIFO outbox polling | Complete ✅ |
| Database Security Tests | pgTAP test suite in `supabase/tests/database_security.test.sql` covering all 12 security & constraint rules | Complete ✅ |
| Automated Schema Audit | Node test suite in `backend/tests/database-schema-audit.test.ts` verifying migration integrity (9/9 passing) | Complete ✅ |
| Database Types | Typed schema definitions in `backend/src/types/database.types.ts` separated from API contracts | Complete ✅ |
| ADR-001 Update | Documented genuine RLS execution mechanics (PostgreSQL `SET LOCAL` claims vs scoped Supabase client) | Complete ✅ |

### 01-H · Authentication Flow & Backend Session Verification ✅

> Focus: End-to-end authentication, JWT verification in Fastify, and user-scoped database session mapping.

| Task | Details | Status |
|---|---|---|
| Shared Contracts | Defined `AuthIdentityResponse` in `@arth/contracts` | Complete ✅ |
| Fastify JWT Auth Plugin | `backend/src/plugins/auth.ts` verifying incoming Supabase JWTs with `jose` (symmetric HS256 / asymmetric JWKS) | Complete ✅ |
| Fastify Auth Route | `GET /api/v1/auth/me` protected endpoint returning verified caller identity | Complete ✅ |
| Backend Security Tests | 10 automated test cases in `backend/tests/auth.test.ts` covering invalid signatures, expired tokens, audience checks, missing tokens | Complete ✅ |
| Supabase SSR Client | `frontend/src/lib/supabase/server.ts` with HTTP-only, `SameSite=Lax`, and `Secure` cookie options | Complete ✅ |
| Auth Callback Handler | `frontend/src/app/auth/callback/route.ts` with PKCE code exchange and open redirect sanitization | Complete ✅ |
| Logout Route Handler | `frontend/src/app/auth/logout/route.ts` clearing session cookies on POST/GET | Complete ✅ |
| BFF API Proxy | `frontend/src/app/api/backend/auth/me/route.ts` forwarding server-held session Bearer JWT to Fastify | Complete ✅ |
| Frontend Auth Tests | Automated tests in `frontend/tests/auth-proxy.test.ts` verifying error handling, missing code, redirect security, and unauthenticated proxy protection | Complete ✅ |
| Login UI | Ledger Minimal sign-in screen at `frontend/src/app/login/page.tsx` with Google OAuth server action | Complete ✅ |
| Authenticated Root UX | `frontend/src/app/page.tsx` displaying user session context and sign-out controls | Complete ✅ |

**Acceptance criteria**:
- [x] Owner can log in with Google OAuth via PKCE flow
- [x] Unauthenticated requests to protected endpoints return 401 Unauthorized
- [x] Session persists in secure HTTP-only cookies
- [x] Fastify verifies JWT tokens with zero credential leakage
- [x] Next.js BFF proxy securely forwards server-held session tokens without exposing them to browser scripts
- [x] Open redirect protection enforces relative local return paths
- [x] 100% of workspace tests pass (23/23 tests)

### 01-I · Transaction Entry & Outbox Engine

| Task | Details |
|---|---|
| Zod schema | Shared contracts & backend validation schemas for transaction creation |
| Amount input | Accepts decimal INR (e.g., `150.50`) → converts to `15050` paise before submission |
| Type selector | Toggle: Income / Expense |
| Date picker | Defaults to today in Asia/Kolkata; editable; uses `date-fns-tz` |
| Category selector | Dropdown from user's active categories; sorted by `sort_order` |
| Payment method | Two-option selector: Online / Cash |
| Necessity selector | Shown only when type = Expense; required; Essential / Optional / Luxury |
| Note field | Optional free-text, max 500 chars |
| UUID v7 generation | Client-side before submission |
| Fastify Endpoint | `POST /api/v1/transactions` validating input and executing atomic insert + outbox trigger |
| Success/error feedback | Toast notification via Ledger Minimal UI feedback |

**Acceptance criteria**:
- [ ] All required fields validated with Zod before submission
- [ ] Necessity field hidden for Income, required for Expense
- [ ] Amount entered as INR decimal, stored as paise integer
- [ ] Date defaults to current date in IST
- [ ] Transaction and outbox_event inserted atomically
- [ ] Duplicate UUID submission is handled as a no-op (idempotent upsert)
- [ ] Form resets after successful submission

### 01-J · Category Management

| Task | Details |
|---|---|
| Category list UI | `src/modules/CategoryManager/` — list with drag-to-reorder (dnd-kit) |
| Add category | Name, optional icon (emoji picker), optional color |
| Edit category | Inline name edit |
| Reorder | Drag handle; `sort_order` updated via Server Action |
| Archive category | Soft delete (`is_archived = true`); hidden from transaction form |
| Unarchive | Settings panel |
| Default categories | Seeded by `supabase/seed.sql`; marked `is_default = true` |

**Acceptance criteria**:
- [ ] Categories are listed in `sort_order` order
- [ ] New categories are appended after existing ones
- [ ] Archived categories do not appear in transaction form
- [ ] Category names are unique per user (enforced by DB + Zod)
- [ ] Default categories cannot be hard-deleted

### 01-J · Dashboard (read-only)

| Task | Details |
|---|---|
| Route | `src/app/(app)/dashboard/page.tsx` |
| Current month summary | Total income, total expense, net balance — computed server-side in SQL |
| Transaction list | Paginated (20/page), sorted by `transaction_date DESC` then `created_at DESC` |
| Filter bar | By type, category, payment method, date range |
| Transaction row | Date, type badge, category, amount (formatted INR), necessity badge, note preview |
| Edit transaction | Open same form pre-populated; same idempotent upsert |
| Delete transaction | Soft delete (`deleted_at = now()`); outbox_event with `event_type = 'delete'` |

**Acceptance criteria**:
- [ ] Dashboard loads in < 2 s on Vercel production
- [ ] Month summary shows correct totals (verified against raw DB values)
- [ ] Pagination works correctly with filters applied
- [ ] Soft-deleted transactions are invisible to the user
- [ ] Edit pre-populates all fields correctly

### 01-K · PWA manifest & baseline installability

| Task | Details |
|---|---|
| `public/manifest.json` | `name`, `short_name`, `start_url`, `display: standalone`, `theme_color`, `icons` |
| Icons | 192×192 and 512×512 PNG icons in `public/icons/` |
| `next.config.ts` | Add PWA headers; no service worker yet (Phase 03) |
| Meta tags | `<meta name="theme-color">`, `apple-touch-icon` |

**Acceptance criteria**:
- [ ] Browser shows "Install Arth" prompt on Chrome/Edge
- [ ] Lighthouse PWA score ≥ 85 (without offline; that's Phase 03)

### 01-L · Deployment

| Task | Details |
|---|---|
| Vercel project | Connect GitHub repo |
| Environment variables | Add all vars from `.env.local` in Vercel dashboard |
| Preview deployments | Enabled per PR / push |
| Production domain | Configure custom domain (optional) |
| Vercel Analytics | Enable (free) |

**Acceptance criteria**:
- [ ] `pnpm build` succeeds with zero TypeScript errors
- [ ] `pnpm lint` passes
- [ ] Vitest unit tests pass (`pnpm test`)
- [ ] App is deployed and reachable on Vercel

---

## Phase 02 — Sheets Sync & Export

**Prerequisites**: Phase 01 fully deployed and stable.

### Key tasks

| Task | Module |
|---|---|
| Google Sheets API client | `src/server/sheets.ts` |
| Outbox drain Route Handler | `/api/sync/sheets` — reads pending events, writes to Sheets, marks delivered |
| Vercel Cron trigger | `vercel.json` cron → `/api/sync/sheets` every 5 minutes |
| Weekly reconciliation | `/api/sync/reconcile` — full re-write of all rows; runs weekly via cron |
| CSV export | `ImportExport` module — server-side streaming download |
| JSON export | Full structured dump |
| Manual sync trigger | Settings button → calls `/api/sync/sheets` on demand |

**Acceptance criteria**:
- [ ] New transaction appears in Google Sheet within 10 minutes
- [ ] Edited transaction updates the correct row (matched by UUID)
- [ ] Deleted transaction row is struck-through or removed in Sheet
- [ ] Weekly reconciliation corrects any drift
- [ ] CSV export downloads a valid file with correct INR formatting
- [ ] JSON export is importable for recovery

---

## Phase 03 — Offline & Full PWA

### Key tasks

| Task | Details |
|---|---|
| Service worker | Workbox via next-pwa; cache-first for shell |
| Dexie.js IndexedDB | Local transaction + outbox tables |
| Offline form | Writes to IndexedDB; queued in local outbox |
| Sync on reconnect | Local outbox flushed to server; UUID v7 deduplication |
| Conflict resolution | `updated_at` server-wins strategy |
| Offline indicator | UI banner when navigator.onLine = false |

---

## Phase 04 — Budget & Insights

### Key tasks

| Task | Module |
|---|---|
| Budget creation form | `BudgetManager` |
| Budget vs actual chart | `BudgetManager` |
| Monthly trend line chart | `SpendingInsights` |
| Category breakdown pie | `SpendingInsights` |
| Necessity ratio chart | `SpendingInsights` |
| Payment method split | `SpendingInsights` |

---

## Phase 05 — Goals & Recurring

### Key tasks

| Task | Module |
|---|---|
| Goal definition form | `FinancialGoals` |
| Goal progress tracker | `FinancialGoals` |
| Recurring template CRUD | `RecurringTransactions` |
| Recurring job (server cron) | `RecurringTransactions` |
| Subscription entry | `SubscriptionTracker` |
| Renewal alerts | `SubscriptionTracker` |

---

## Phase 06 — AI & Health

### Key tasks

| Task | Module |
|---|---|
| Health score formula | `FinancialHealth` |
| Health dashboard | `FinancialHealth` |
| AI prompt construction | `AIAdvisor` — aggregated data only, never raw rows |
| AI response display | `AIAdvisor` |

---

## Testing strategy

| Layer | Tool | Scope |
|---|---|---|
| Unit | Vitest | Zod schemas, paise conversion, date utils, outbox logic |
| Component | Vitest + @testing-library/react | Form validation, conditional fields |
| Integration | Vitest + Supabase local | DB constraints, RLS policies |
| E2E | Playwright | Full login → enter transaction → verify dashboard flow |

---

## Definition of "done" per phase

A phase is done when:
1. All acceptance criteria checkboxes are checked.
2. `pnpm build` passes with zero errors.
3. `pnpm test` passes.
4. Deployed to Vercel production and manually verified.
5. `ANTIGRAVITY.md` updated with any new decisions.

---

*End of ARTH_BUILD_PLAN.md*
