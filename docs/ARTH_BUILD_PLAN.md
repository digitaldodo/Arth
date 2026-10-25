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

### 01-I · Transaction Entry & Outbox Engine ✅

| Task | Details | Status |
|---|---|---|
| Shared Contracts | Defined `CreateTransactionRequest`, `TransactionDTO`, `CategoryDTO`, and list queries in `@arth/contracts` | Complete ✅ |
| Exact Money Utility | `parseINRToPaise`, `paiseToDecimal`, `formatPaiseToINR` with BigInt math and zero floating-point drift | Complete ✅ |
| Fastify Endpoints | `POST /api/v1/transactions`, `GET /api/v1/transactions`, `GET /api/v1/categories` with JWT authentication | Complete ✅ |
| Idempotency Engine | UUID v7 idempotency handling (201 created, 200 idempotent replay, 409 payload conflict, 409 deleted ID reuse) | Complete ✅ |
| Backend Tests | 18 transaction API tests + 10 money calculation tests (47 total backend tests passing) | Complete ✅ |
| BFF API Proxies | Next.js server-side proxies for `/api/backend/transactions` and `/api/backend/categories` | Complete ✅ |
| Quick Add UI | Ledger Minimal Quick Add modal/bottom-sheet with responsive drawer, top-6 chips, and safe retry | Complete ✅ |
| Ledger Screen | Responsive ledger listing with Net Cash Flow computation, filters, and empty states | Complete ✅ |
| Frontend Tests | 10 automated frontend tests verifying proxy protection, date handling, and currency formatting | Complete ✅ |

**Acceptance criteria**:
- [x] All required fields validated before submission
- [x] Necessity field required for Expense, strictly absent for Income
- [x] Amount entered as INR decimal, stored as paise integer (`BIGINT`)
- [x] Date defaults to current date in Asia/Kolkata (IST)
- [x] Transaction and outbox_event inserted atomically via database trigger
- [x] Duplicate UUID v7 submission is handled as an idempotent replay without duplicating outbox events
- [x] Form resets after successful submission and updates active ledger view
- [x] 100% of workspace tests pass (57/57 tests)

### 01-J · Category Management & Custom Ordering ✅

| Task | Details | Status |
|---|---|---|
| Migration 0008: Atomic Reorder | Stored procedure `public.fn_reorder_categories(p_type, p_category_ids)` enforcing SECURITY INVOKER, array duplicate checking, and active count matching | Complete ✅ |
| Shared Contracts | `CreateCategoryRequest`, `UpdateCategoryRequest`, `ArchiveCategoryRequest`, `ReorderCategoriesRequest`, `CategoryListQuery` in `@arth/contracts` | Complete ✅ |
| Fastify Category Endpoints | `GET /api/v1/categories`, `POST /api/v1/categories`, `PATCH /api/v1/categories/:id`, `PATCH /api/v1/categories/:id/archive`, `PUT /api/v1/categories/reorder` | Complete ✅ |
| Backend Category Tests | 11 automated test cases in `backend/tests/categories.test.ts` covering auth, validation, uniqueness, rename, type-immutability, cross-user isolation, and reorder | Complete ✅ |
| Frontend BFF Proxies | Next.js server-side proxies for `/api/backend/categories`, `/api/backend/categories/[id]`, `/api/backend/categories/[id]/archive` | Complete ✅ |
| Category Management UI | Ledger Minimal UI in `frontend/src/features/categories/CategoryManager.tsx` with taxonomy tabs, rank badges, up/down reorder controls, color picker, inline rename, archive confirmation modal, and collapsible restore accordion | Complete ✅ |
| Navigation & Quick Add Sync | Connected Category Manager to desktop header tabs and mobile bottom bar; propagates category mutations immediately to `QuickAddModal` | Complete ✅ |
| Frontend Tests | 5 automated tests in `frontend/tests/category-proxy.test.ts` verifying authentication boundaries and parameter forwarding | Complete ✅ |

**Acceptance criteria**:
- [x] Categories are listed in `sort_order` order
- [x] Atomic custom reordering validates complete permutation without duplicates or foreign IDs
- [x] New categories are appended after existing ones with custom or sequential `sort_order`
- [x] Non-destructive archive hides categories from Quick Add while preserving historical transactions
- [x] Collapsible Archived Categories section allows restoring categories without data loss
- [x] Category names are unique per user and type (case-insensitive, DB + application validated)
- [x] Type (`income` vs `expense`) is strictly immutable post-creation
- [x] 100% of workspace tests pass (74/74 tests)

### 01-K · People & Money Tracker ✅

| Task | Details | Status |
|---|---|---|
| Migration 0009: People Tracker | Added `public.person_direction` ENUM (`i_owe_them`, `they_owe_me`), `public.people`, `public.person_money_records`, and `public.person_money_settlements` tables with composite tenant foreign keys `(person_id, user_id)` and `(record_id, user_id)`. Created atomic `public.fn_record_person_settlement` with `SECURITY INVOKER` and row-level locking (`FOR UPDATE`). | Complete ✅ |
| Database Schema Audit | Updated `backend/tests/database-schema-audit.test.ts` to assert Migration 0009 tables, composite constraints, and RPC function (11/11 tests passing) | Complete ✅ |
| Shared Contracts | Defined `PersonDirection`, `SettlementStatus`, `PersonDTO`, `PersonDetailDTO`, `PersonMoneyRecordDTO`, `PersonMoneySettlementDTO`, `CreatePersonRequest`, `UpdatePersonRequest`, `ArchivePersonRequest`, `CreatePersonRecordRequest`, `RecordSettlementRequest`, `PersonListQuery`, `PersonListResponse`, `PersonDetailResponse` in `@arth/contracts` | Complete ✅ |
| Fastify Backend Module | Implemented `backend/src/modules/people/` with strict input validation, `IPeopleService` supporting both live Supabase RPC and atomic in-memory mock with row locking and over-settlement prevention, and 7 authenticated routes: `GET /api/v1/people`, `POST /api/v1/people`, `GET /api/v1/people/:id`, `PATCH /api/v1/people/:id`, `PATCH /api/v1/people/:id/archive`, `POST /api/v1/people/:id/records`, `POST /api/v1/people/records/:recordId/settlements` | Complete ✅ |
| Backend Automated Tests | 10 comprehensive tests in `backend/tests/people.test.ts` covering authentication boundaries, directions, cumulative balance calculation, validation, partial and full settlements, over-settlement rejection, direction locking when unsettled records exist, renaming, non-destructive archiving, and cross-user isolation (70 backend tests passing) | Complete ✅ |
| Frontend BFF Proxies | Next.js API route handlers in `frontend/src/app/api/backend/people/` forwarding session Bearer JWTs to Fastify with 401 unauthenticated protection | Complete ✅ |
| Frontend API Client | Extended `frontend/src/lib/api-client/index.ts` with typed helpers for people, records, and settlements | Complete ✅ |
| Frontend BFF Tests | 7 automated tests in `frontend/tests/people-proxy.test.ts` verifying unauthenticated protection on all people BFF endpoints (22 frontend tests passing) | Complete ✅ |
| Ledger Minimal UI | Responsive People view in `frontend/src/features/people/PeoplePage.tsx` with search, direction filter tabs (`All`, `They owe me`, `I owe them`, `Archived toggle`), dual-encoded color styling (RED = I owe them, GREEN = They owe me), person detail view, record filtering, and modals for Add Person, Add Money Record, Record Settlement, Rename, Direction Change Confirmation, and Archive Confirmation | Complete ✅ |
| Navigation Shell Update | Updated mobile bottom navigation to the approved 5 destinations: **Home (`🏠`) | Ledger (`📊`) | Add (`+`) | People (`👥`) | More (`☰`)**, and updated desktop header tabs (**Ledger | People | Categories**). Created dedicated More screen providing access to Categories, Theme toggle, and Account | Complete ✅ |

**Acceptance criteria**:
- [x] RED strictly indicates "I owe them"; GREEN strictly indicates "They owe me" with explicit textual descriptions
- [x] Each person has exactly one active direction at a time and one aggregate outstanding balance
- [x] Direction change is strictly blocked while unsettled records remain
- [x] Partial and full settlements are supported; over-settlement is rejected
- [x] Concurrency-safe atomic settlement function with row locking prevents race conditions
- [x] People obligations and settlements are strictly isolated from the main ledger (`transactions`)
- [x] 5-destination mobile bottom bar and desktop header navigation tabs
- [x] 100% of workspace tests pass (92/92 tests across 11 test suites)

### 01-L · Database Reliability, ACID & CRUD Performance Hardening ✅

| Task | Details | Status |
|---|---|---|
| Migration 0010: Database Hardening | Schema migration adding `ON DELETE RESTRICT` constraints to prevent cascade deletion of financial history, revoking direct `INSERT/UPDATE/DELETE` on `person_money_settlements` from authenticated role, hardening `fn_record_person_settlement` with idempotency replay handling and `SECURITY DEFINER`, adding `FOR UPDATE` row locking to `fn_reorder_categories`, and adding performance covering indexes | Complete ✅ |
| Database Schema Audit Test | Updated `backend/tests/database-schema-audit.test.ts` to assert all 10 migrations and hardening rules | Complete ✅ |
| ACID & Concurrency Test Suite | Created `backend/tests/database-acid-reliability.test.ts` with 11 automated test cases verifying transaction-outbox atomicity, settlement limits, idempotent replays, concurrent settlement over-settlement prevention, cross-user isolation, category reorder permutation validation, and non-destructive archival | Complete ✅ |
| Backend Services Hardening | Hardened `SupabaseTransactionService` to handle concurrent unique-key replay, removed redundant read-before-write checks in `SupabaseCategoryService`, and implemented settlement idempotency checks in both live and in-memory people services | Complete ✅ |
| Database Operations Spec | Authored `docs/DATABASE_OPERATIONS.md` documenting ACID guarantees, disaster recovery runbook, PITR setup, append-only protocol, and query benchmarks | Complete ✅ |
| Architecture Document Reconciliation | Reconciled `docs/ARTH_ARCHITECTURE.md` to authoritative single-source-of-truth model for settlement balances (no duplicate mutable column) and updated constraints matrix | Complete ✅ |

**Acceptance criteria**:
- [x] Transaction write and outbox event insert commit or rollback atomically
- [x] Person settlement idempotency: repeated request with same ID returns existing settlement without duplicate counting; conflicting attributes raise conflict error
- [x] Settlement totals cannot exceed original amount under sequential and concurrent loads
- [x] Direct table mutations on settlements are revoked from authenticated users (RPC enforced)
- [x] Financial history protected via `ON DELETE RESTRICT`
- [x] Category reorder row locking prevents concurrent mutation race conditions
- [x] Redundant read-before-write queries removed from category CRUD
- [x] Performance covering indexes added for transaction, people, and settlement queries
- [x] 100% of workspace tests pass (104/104 tests across 12 test suites)

### 01-L.1 · Close Database Reliability Gaps ✅

| Task | Details | Status |
|---|---|---|
| Migration 0011: History Protection & Settlement Hardening | Revoked direct `DELETE` privileges on `people` and `person_money_records` from `authenticated` role; dropped `people_delete_own` and `records_delete_own` RLS policies so non-destructive archiving (`archived_at`) is the sole supported lifecycle. Redefined `public.fn_record_person_settlement` with strict payload equality (including notes), post-lock re-check for concurrent identical retries, and explicit revocation from `PUBLIC`/`anon` with execution grant to `authenticated`. | Complete ✅ |
| Database Schema Audit | Updated `backend/tests/database-schema-audit.test.ts` to assert all 11 migrations, delete privilege revocation, dropped delete policies, post-lock recheck, and execution role grants | Complete ✅ |
| Concurrency & Idempotency Tests | Extended `backend/tests/database-acid-reliability.test.ts` to verify settlement replay with identical notes, conflict rejection on mismatched notes, rejection of settlements on archived records, and absence of hard-delete API methods | Complete ✅ |
| Backend People Service Hardening | Updated `InMemoryPeopleService.recordSettlement` to enforce strict notes payload equality on duplicate IDs (`ConflictError`), matching the PostgreSQL stored procedure | Complete ✅ |
| Database Operations Runbook Update | Updated `docs/DATABASE_OPERATIONS.md` with account/profile deletion protocol, clear labeling of in-memory benchmark metrics vs blocked live container benchmarks, and explicit disaster recovery readiness (PITR Pro plan requirement, DR protocol status, Phase 02 Sheets worker) | Complete ✅ |
| Real Database vs In-Memory Audit | Verified local host environment: Docker daemon is inactive; recorded live PostgreSQL pgTAP container test gate as **BLOCKED** while verifying 100% of Node.js and schema tests | Complete ✅ |

**Acceptance criteria**:
- [x] Hard DELETE privileges on `people` and `person_money_records` revoked from `authenticated` in PostgreSQL schema
- [x] Direct delete RLS policies removed; archiving is the sole supported lifecycle
- [x] Account and profile deletion behavior with retained financial history documented
- [x] Settlement idempotency checks include notes; identical retry succeeds; conflicting notes raise 23505 conflict
- [x] Concurrent identical settlement retries serialize cleanly under row lock via post-lock re-check
- [x] Stored procedure privileges revoked from `PUBLIC` and `anon`; granted exclusively to `authenticated`
- [x] Live PostgreSQL vs in-memory benchmark boundaries and environment blockers honestly reported
- [x] 100% of workspace tests pass (108/108 tests across 12 test suites)

### 01-M · Real Data Dashboard ✅

| Task | Details | Status |
|---|---|---|
| Migration 0012: Dashboard Summary Function | Stored procedure `public.fn_dashboard_summary(p_start_date, p_end_date)` computing income, expenses, net cash flow, category spending composition, bounded recent activity, and total active count in a single atomic snapshot query with `SECURITY INVOKER`. Granted exclusively to `authenticated` role. | Complete ✅ |
| Shared Contracts | Defined `DashboardSummaryResponse`, `DashboardSummaryQuery`, `CategorySpendingDTO`, `DashboardDateRangePreset`, and `resolveDateRangePreset` in `@arth/contracts` | Complete ✅ |
| Fastify Backend Module | Implemented `backend/src/modules/dashboard/` with `dashboard.validation.ts` (strict YYYY-MM-DD validation, `start_date <= end_date`), `dashboard.service.ts` (`SupabaseDashboardService` and `InMemoryDashboardService`), and `dashboard.routes.ts` (`GET /api/v1/dashboard/summary`) | Complete ✅ |
| Backend Automated Tests | 12 automated tests in `backend/tests/dashboard.test.ts` covering totals, negative net cash flow, category grouping without double-counting, soft-deleted exclusion, date bounds, calendar edge cases, empty datasets, People isolation, 401 unauthenticated protection, tenant isolation, and bounded recent activity | Complete ✅ |
| Database Schema Audit | Updated `backend/tests/database-schema-audit.test.ts` to assert all 12 numbered migrations and Migration 0012 rules (13 test suites passing) | Complete ✅ |
| Frontend BFF Proxy | Next.js route handler in `frontend/src/app/api/backend/dashboard/route.ts` with session authentication and parameter forwarding | Complete ✅ |
| Frontend API Client | Added `fetchDashboardSummary(query)` to `frontend/src/lib/api-client/index.ts` | Complete ✅ |
| Frontend Dashboard UI | Responsive Ledger Minimal dashboard in `frontend/src/features/dashboard/` featuring `DateRangeSelector`, `SummaryCards` (Income, Expenses, Net Cash Flow), `SpendingComposition` (horizontal segmented bar + category table), `RecentActivity`, and `DashboardSkeleton` | Complete ✅ |
| Navigation Shell Integration | Integrated `DashboardPage` as Home destination in `TransactionAppShell.tsx`, added `Dashboard` to desktop navigation switcher, and wired automatic re-fetch on Quick Add creation | Complete ✅ |
| Frontend Automated Tests | 11 automated tests in `frontend/tests/dashboard-proxy.test.ts` verifying BFF 401 protection, parameter checks, Asia/Kolkata date presets, and Indian number formatting (33 frontend tests passing) | Complete ✅ |

**Acceptance criteria**:
- [x] Dashboard answers: money in, money out, net cash flow, and spending composition
- [x] Net cash flow is distinctly labeled and explicitly distinguished from account balances
- [x] Date presets supported: Today, This week, This month, Last month, This year, Custom range
- [x] Asia/Kolkata (IST) calendar dates used consistently for range boundaries
- [x] Negative net cash flow formatted cleanly with minus sign (`-₹5,000.00`)
- [x] People obligations and settlements are strictly isolated and never alter dashboard totals
- [x] Soft-deleted transactions are excluded in SQL
- [x] Quick Add transaction creation triggers immediate dashboard re-fetch
- [x] Zero-spending and empty-ledger states render cleanly without broken charts or NaN
- [x] 100% of workspace tests pass (132/132 tests across 18 test suites)

### 01-N · PWA Manifest & Baseline Installability ✅

| Task | Details | Status |
|---|---|---|
| Dashboard Fallback Elimination | Fixed preflight bug in `backend/src/modules/dashboard/dashboard.service.ts`: eliminated silent fallback to raw table query when `fn_dashboard_summary` RPC fails, logging safe diagnostics without secret leakage and raising clean service errors. Verified via 2 dedicated unit tests. | Complete ✅ |
| App Router Web App Manifest | Implemented `frontend/src/app/manifest.ts` using Next.js `MetadataRoute.Manifest` with `name`, `short_name: 'Arth'`, `start_url: '/'`, `scope: '/'`, `id: '/'`, `display: 'standalone'`, `background_color: '#FBFBF9'`, `theme_color: '#1C1917'`, `lang: 'en-IN'`, `dir: 'ltr'`, and complete icon definitions. Served automatically at `/manifest.webmanifest`. | Complete ✅ |
| Ledger Minimal PNG Icons | Generated production-quality PNG icon assets matching Ledger Minimal obsidian aesthetic (`#0C0A09` background, `#FBFBF9` warm paper mark, `#10B981` ledger emerald ruling rule): `icon-192x192.png`, `icon-512x512.png`, `icon-512x512-maskable.png` (verified center 80% safe zone), `apple-touch-icon.png` (180×180), and `favicon.ico`. | Complete ✅ |
| Viewport & Apple Metadata | Extended `frontend/src/app/layout.tsx` with light/dark `themeColor` definitions (`#FBFBF9` / `#0C0A09`), `viewportFit: 'cover'`, `appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Arth' }`, and icon declarations. | Complete ✅ |
| Restrained Install Experience | Implemented `usePwaInstall` hook (using `useSyncExternalStore`) and `InstallPromptCard` inside More/Settings (`activeView === 'more'`). Captures deferred `beforeinstallprompt`, listens to `appinstalled`, provides non-intrusive "Install Arth" action, detects standalone mode, and offers concise step-by-step guidance for iOS/iPadOS Safari without unsolicited popups. | Complete ✅ |
| Automated PWA Tests | Added 4 automated tests in `frontend/tests/pwa-manifest.test.ts` verifying manifest contract, physical icon file existence, dimensions, PNG headers (`89 50 4E 47`), strict absence of service worker registrations in Phase 01N, and layout metadata. | Complete ✅ |

**Acceptance criteria**:
- [x] Web app manifest valid and discoverable at `/manifest.webmanifest`
- [x] High-resolution, crisp PNG icons delivered for standard, maskable, and Apple touch targets
- [x] Maskable icon strictly confines critical artwork within the center 80% safe zone circle
- [x] Layout configures dual-scheme theme color, cover viewport fit, and Apple mobile web app capability
- [x] Standalone mode correctly detected on desktop and mobile launchers
- [x] Native `beforeinstallprompt` captured gracefully and exposed via Settings/More screen
- [x] Manual installation instructions available for iOS/iPadOS Safari users without unsolicited modals
- [x] Strict Phase 01N scope boundaries preserved: zero service worker registration, zero offline caching, zero Dexie/IndexedDB usage
- [x] 100% of workspace tests pass (138/138 tests across 15 test suites)

### 01-O · Production Deployment & Release Readiness ⚠️ (Code & Config Ready / Awaiting Dashboard Provisioning)

| Task | Details | Status |
|---|---|---|
| Product Claims Audit | Cleaned all inaccurate product claims in `frontend/src/app/layout.tsx` and `README.md`: eliminated claims of local-first or operational dual-write sync; documented PostgreSQL as authoritative financial database and Phase 01 as an online personal finance tracker with baseline PWA installability. | Complete ✅ |
| Centralized Server Config & Safe Errors | Implemented `frontend/src/lib/server-config.ts` (`getBackendBaseUrl`, `safeBackendErrorResponse`). In production, strictly requires `INTERNAL_API_URL` and fails fast rather than silently falling back to localhost; sanitizes gateway error responses to prevent leaking URLs, credentials, network addresses, or stack traces. Updated all 11 BFF route handlers. Verified via 6 dedicated unit tests. | Complete ✅ |
| Backend Monorepo Build & Render Blueprint | Authored `render.yaml` specification for managed Node.js web service on Render. Set build command: `pnpm install --frozen-lockfile && pnpm --filter @arth/contracts build && pnpm --filter @arth/backend build`, start command: `pnpm --filter @arth/backend start`, health check: `GET /health`. Non-secret environment template provided. | Complete ✅ |
| Frontend Vercel Monorepo Configuration | Authored `vercel.json` with `buildCommand: "pnpm --filter @arth/contracts build && pnpm --filter @arth/frontend build"` and `outputDirectory: ".next"`. Updated root `package.json` so `build:frontend` and `build:backend` automatically compile `@arth/contracts` before building downstream packages. | Complete ✅ |
| Environment Template Standardization | Updated `.env.example` with clear, explicit demarcation between Frontend (Vercel), Backend (Render), and deferred Phase 02 background worker requirements. | Complete ✅ |
| Quality Gates Verification | Verified 100% of workspace quality gates: `pnpm lint` (0 errors), `pnpm typecheck` (0 errors), `pnpm test` (144/144 tests passing across 16 test suites), `pnpm build` (clean Turbopack Next.js and Fastify tsc production builds). | Complete ✅ |
| Remote Hosting & Live Database Status | External cloud dashboard linking (Vercel project linking, Render web service deployment, Supabase remote migration push) requires owner account credentials/linking. Docker daemon remains inactive on local host; live PostgreSQL pgTAP container test gate is recorded as **BLOCKED**. | Documented ⚠️ |

**Acceptance criteria**:
- [x] Product claims reflect true current capabilities (PostgreSQL authoritative storage, manual online transaction capture, baseline PWA installability)
- [x] Centralized server configuration utility enforces `INTERNAL_API_URL` in production without silent localhost fallbacks
- [x] All 11 Next.js BFF proxy routes sanitize gateway errors and prevent token/credential/network leakage
- [x] Fastify dashboard routes catch unexpected errors, log securely, and return safe 500 error responses
- [x] `render.yaml` blueprint created without secrets, binding to `0.0.0.0`, using `main` branch and `/health` health check
- [x] `vercel.json` and root monorepo scripts build `@arth/contracts` cleanly before compiling `@arth/frontend`
- [x] `.env.example` documents exact variable names and target services without secret values
- [x] 100% of workspace quality gates pass (144 tests, clean lint, clean typecheck, clean production builds)
- [x] Operational runbook and remaining owner deployment steps fully documented in `docs/DATABASE_OPERATIONS.md` and release reports

### 01-P · Authentication UI Redesign & Email/Password Authentication ✅

> Focus: Complete redesign of authentication experience, dual sign-in methods (Email/Password + Google OAuth), account registration with username persistence, password recovery flow, and dedicated reset screen.

| Task | Details | Status |
|---|---|---|
| Migration 0013: Username Support | `supabase/migrations/0013_auth_username_support.sql` updating `fn_handle_new_user()` to extract `raw_user_meta_data->>'username'` as `display_name` in `public.profiles` | Complete ✅ |
| Server Actions Module | `frontend/src/app/login/actions.ts` implementing `signInWithEmailAction`, `signUpWithEmailAction`, `requestPasswordResetAction`, `updatePasswordAction`, and `signInWithGoogleAction` with input validation, rate-limiting handlers, and uniform anti-enumeration responses | Complete ✅ |
| Authentication Form Component | `frontend/src/app/login/AuthForm.tsx` supporting seamless Sign In, Create Account, and Forgot Password modes, show/hide password toggles, live strength & match indicators, loading spinners, and accessible error banners | Complete ✅ |
| Redesigned Login Page | `frontend/src/app/login/page.tsx` with desktop two-column layout featuring Ledger Minimal branding, CSS ledger snapshot, protocol badges, and theme toggle; responsive single-column layout on mobile down to 320px | Complete ✅ |
| Dedicated Password Reset Screen | `frontend/src/app/auth/update-password/page.tsx` and `UpdatePasswordForm.tsx` handling recovery session verification and secure password update via Supabase Auth | Complete ✅ |
| Shell & Navigation Integration | Updated `frontend/src/app/page.tsx` and `frontend/src/features/transactions/TransactionAppShell.tsx` to display user display name, profile details, and updated welcome copy | Complete ✅ |
| Automated Test Suites | Added 10 test cases in `frontend/tests/auth-actions.test.ts` and updated database schema audit tests in `backend/tests/database-schema-audit.test.ts` (155/155 tests passing across 17 test suites) | Complete ✅ |

**Acceptance criteria**:
- [x] Balanced two-column desktop layout with branding, CSS ledger mockup, and compact authentication surface
- [x] Responsive single-column mobile layout down to 320px without horizontal overflow
- [x] Email/password sign-in and account registration with validation and live password strength checks
- [x] Google OAuth PKCE flow preserved with clear "OR" divider
- [x] Username captured on registration and persisted as `display_name` in `public.profiles` via Migration 0013
- [x] Password recovery request with uniform responses to prevent account enumeration
- [x] Dedicated password update screen (`/auth/update-password`) handling active recovery sessions gracefully
- [x] Zero plaintext password storage; HTTP-only, secure, `SameSite=Lax` cookies via `@supabase/ssr`
- [x] 100% of workspace quality gates pass (155 tests, clean lint, clean typecheck, clean build)

### 01-Q · Google OAuth Redirect Hardening & Branding Setup ✅

> Focus: Diagnose and fix OAuth callback redirect issues, enforce production canonical origins, build fallback resilience on root/login pages, and document Google Auth Platform branding and Supabase allowlist settings.

| Task | Details | Status |
|---|---|---|
| Origin & Callback Resolver | `frontend/src/lib/auth-config.ts` implementing `getAppOrigin`, `getAuthCallbackUrl`, `sanitizeRedirectPath`, and `formatAuthError`; strictly prevents `localhost` fallbacks in production | Complete ✅ |
| Explicit Callback Route | `frontend/src/app/auth/callback/route.ts` exchanging PKCE code, setting cookies, sanitizing redirect target, and returning HTTP 303 to clean address bar | Complete ✅ |
| Stray Code Interception | Updated `frontend/src/app/page.tsx` and `frontend/src/app/login/page.tsx` to automatically detect stray `?code=` query parameters and forward them to `/auth/callback` | Complete ✅ |
| Local Supabase Config | Updated `supabase/config.toml` additional redirect URLs to include local and production callback allowlists | Complete ✅ |
| Google & Supabase Guide | Authored `docs/GOOGLE_OAUTH_SETUP.md` with step-by-step instructions for Google Cloud Console (Branding, App Logo, Authorized Domains) and Supabase Dashboard (Site URL, Redirect URLs) | Complete ✅ |
| Automated Test Suites | Added 12 automated unit/integration tests in `frontend/tests/auth-callback.test.ts` verifying origin resolution, callback error handling, and open-redirect sanitization | Complete ✅ |

**Acceptance criteria**:
- [x] Google sign-in sends explicit callback URL to `/auth/callback` using current origin or production canonical domain
- [x] Callback exchanges authorization code server-side and sets HTTP-only cookies via `@supabase/ssr`
- [x] Successful sign-in redirects to internal destination and cleans code from address bar
- [x] Missing or failed authorization codes redirect to `/login` with actionable error guidance
- [x] Open-redirect attacks blocked by `sanitizeRedirectPath()`
- [x] In production (`NODE_ENV === 'production'`), origin resolution never returns `localhost`
- [x] Google Auth Platform branding and Supabase URL Configuration documented in `docs/GOOGLE_OAUTH_SETUP.md`
- [x] 100% of workspace quality gates pass (167 tests, clean lint, clean typecheck, clean build)

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
