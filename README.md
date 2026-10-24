# Arth (अर्थ) — Modular Monorepo Architecture

Arth is a fast, local-first personal finance tracker engineered for high-velocity transaction capture (< 5 seconds), dual-write synchronization to Google Sheets, and financial clarity inspired by Swiss editorial ledger design (**Concept 1: Ledger Minimal**).

The repository is structured as a **modular monorepo** with strict physical boundaries between frontend presentation, backend business logic, shared contracts, and database migrations.

---

## Architectural Principles

- **Separation of Concerns**: Pure Next.js frontend with zero direct database connections; Fastify backend service authoritatively enforces validation and business logic.
- **Shared API Contracts**: Type-safe request/response DTOs defined in `@arth/contracts` consumed by both applications.
- **Amounts in Integer Paise**: Financial values are stored as integers representing paise (1 INR = 100 paise) as `BIGINT` in PostgreSQL to prevent floating-point rounding errors.
- **Deterministic Timezones**: Stored as UTC `TIMESTAMPTZ` in Supabase; formatted in `Asia/Kolkata` (IST) for user interfaces.
- **Ledger Minimal Design System**: High-contrast, typography-driven financial clarity featuring warm archival paper in light mode (`#FBFBF9`) and restrained obsidian in dark mode (`#0C0A09`).
- **Outbox Pattern**: Transaction mutations write to an authoritative `outbox_events` table before background asynchronous synchronization to Google Sheets.
- **Two-Layer Security**: Backend API authentication/authorization + PostgreSQL Row Level Security (RLS) enforcement.

---

## Repository Structure

```text
arth/
├── frontend/                     # Next.js 16 App Router (@arth/frontend)
│   ├── src/
│   │   ├── app/                  # App Router layouts, pages, globals.css
│   │   │   ├── api/backend/auth/ # BFF thin proxy forwarding Bearer JWTs to Fastify
│   │   │   ├── auth/callback/    # Supabase PKCE OAuth callback handler
│   │   │   ├── auth/logout/      # Session invalidation & cookie clearance
│   │   │   ├── login/            # Ledger Minimal sign-in UI
│   │   │   └── page.tsx          # Authenticated session display & foundation
│   │   ├── components/
│   │   │   ├── ui/               # Reusable UI primitives (ThemeToggle)
│   │   │   └── layout/           # Shared page layouts & navigation
│   │   ├── features/             # Feature-sliced modules
│   │   │   ├── dashboard/
│   │   │   ├── transactions/
│   │   │   ├── categories/
│   │   │   └── settings/
│   │   └── lib/
│   │       ├── api-client/       # Typed backend API client (fetchCurrentUser, etc.)
│   │       ├── format.ts         # Paise-to-INR & date formatters
│   │       └── supabase/         # SSR Supabase client (HTTP-only cookies)
│   ├── tests/                    # Frontend Route Handler & proxy test suite
│   ├── public/                   # Static assets & icons
│   ├── package.json
│   ├── next.config.ts
│   └── tsconfig.json
│
├── backend/                      # Fastify TypeScript Service (@arth/backend)
│   ├── src/
│   │   ├── app.ts                # Fastify factory function & plugin registration
│   │   ├── server.ts             # Server entry point (starts on port 3001)
│   │   ├── config/               # Environment configuration & JWT validation config
│   │   ├── plugins/              # Shared Fastify plugins (CORS, auth/JWT verifier)
│   │   └── modules/              # Domain modules
│   │       ├── auth/             # Protected auth endpoints (GET /api/v1/auth/me)
│   │       └── health/           # Health check endpoint (GET /health)
│   ├── tests/                    # Automated backend tests (auth, health, schema audit)
│   ├── package.json
│   └── tsconfig.json
│
├── packages/
│   └── contracts/                # Shared API Contracts (@arth/contracts)
│       ├── src/
│       │   ├── auth.ts           # AuthIdentityResponse contract
│       │   ├── health.ts         # HealthCheckResponse contract
│       │   └── index.ts          # Unified exports
│       ├── package.json
│       └── tsconfig.json
│
├── supabase/                     # Database Infrastructure
│   ├── migrations/               # Numbered, append-only SQL migrations
│   ├── tests/                    # Database-level pgTAP tests
│   └── config.toml               # Supabase CLI local emulation configuration
│
├── docs/                         # Specifications & Architectural Documentation
│   ├── decisions/                # Architecture Decision Records (ADR-001)
│   ├── ARTH_ARCHITECTURE.md      # System, database, & synchronization architecture
│   ├── ARTH_BUILD_PLAN.md        # Phased implementation plan & progress log
│   ├── ARTH_DESIGN_SYSTEM.md     # Ledger Minimal tokens and component rules
│   ├── ARTH_UX_BLUEPRINT.md      # Navigation, IA, and progressive disclosure flows
│   └── design-concepts/          # Screen prototype & automated verification shots
│
├── .env.example                  # Non-secret environment variable templates
├── .gitignore                    # Git exclusion rules
├── AGENTS.md                     # Agent entrypoint pointer
├── ANTIGRAVITY.md                # Canonical project instructions and rules
├── package.json                  # Root monorepo configuration
├── pnpm-workspace.yaml           # Workspace package definitions
└── pnpm-lock.yaml                # Monorepo dependency lockfile
```

---

## Prerequisites

- **Node.js**: v22.17.1+ (LTS)
- **pnpm**: v10.24.0+
- **Git**

---

## Getting Started

### 1. Install Dependencies

Install all dependencies across the monorepo:

```bash
pnpm install
```

### 2. Configure Environment Variables

Copy the root environment template:

```bash
cp .env.example .env.local
```

### 3. Run Development Servers

Run both frontend and backend concurrently:

```bash
pnpm dev
```

- Frontend: [http://localhost:3000](http://localhost:3000)
- Backend: [http://localhost:3001](http://localhost:3001) (Health: `GET /health`)

Or run services independently:

```bash
# Frontend only (Next.js)
pnpm dev:frontend

# Backend only (Fastify with tsx watch)
pnpm dev:backend
```

### 4. Database Setup & Migrations (Local Development)

The database schema and RLS policies are version-controlled under `supabase/migrations/`:

```bash
# Start local Supabase container stack (requires Docker Desktop running)
pnpx supabase start

# Apply all migrations & test triggers against local database
pnpx supabase db reset

# Run pgTAP database security and constraint test suite
pnpx supabase test db
```

---

## Database Architecture & Constraints

- **`public.profiles`**: Auto-provisioned on signup via `auth.users` trigger. Defaults to `Asia/Kolkata` and `INR`.
- **`public.categories`**: Separates `income` vs `expense` taxonomy. Uniqueness per `(user_id, type, lower(name))` where active. Supports non-destructive archiving via `archived_at`.
- **`public.transactions`**: Stores amounts as positive integer paise (`BIGINT > 0`). Enforces composite foreign key `(category_id, user_id, type)` preventing cross-user or mismatched category assignments. Requires necessity for expenses and strictly `NULL` for income.
- **`public.outbox_events`**: Atomic transactional outbox populated via `trg_transactions_outbox` capturing create, update, soft-delete, and restoration events for Google Sheets sync. Immutable to authenticated users.
- **`public.people` & obligations**: Isolated debt and loan tracker. Tables `public.people`, `public.person_money_records`, and `public.person_money_settlements` maintain tenant isolation with composite foreign keys. Settlement concurrency and idempotency are secured via row-locked stored procedure `fn_record_person_settlement`. Direct mutations are revoked from authenticated users. Cascading deletion is blocked (`ON DELETE RESTRICT`) to preserve financial audit history.

---

## Authentication & Session Architecture

Arth uses a defense-in-depth, zero-trust session architecture:
- **Client Authentication**: Google OAuth with PKCE flow initiated from `frontend/src/app/login/page.tsx`.
- **Session Security**: Session tokens are held in `HttpOnly`, `SameSite=Lax`, and `Secure` (production) cookies managed by `@supabase/ssr`.
- **BFF Thin Proxy**: Browser requests hit Next.js Route Handlers (`/api/backend/*`), which extract the server-held `access_token` and forward it as `Authorization: Bearer <token>` to Fastify.
- **Backend Verification**: Fastify (`backend/src/plugins/auth.ts`) validates JWTs with `jose` (symmetric HS256 secret or asymmetric JWKS), verifying signatures, issuer, audience (`authenticated`), and expiration, and decorates `request.user`.

### Supabase Google OAuth Setup
1. In your [Supabase Dashboard](https://supabase.com/dashboard), navigate to **Authentication &rarr; Providers &rarr; Google**.
2. Enable Google provider and input your **Google Client ID** and **Google Client Secret** from Google Cloud Console.
3. Add the redirect URL: `https://<project-ref>.supabase.co/auth/v1/callback`.
4. In your `.env.local`, set:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
   SUPABASE_JWT_SECRET=<your-jwt-secret>
   ```

---

## Available Monorepo Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Runs frontend and backend concurrently in development mode |
| `pnpm dev:frontend` | Runs only the Next.js frontend development server |
| `pnpm dev:backend` | Runs only the Fastify backend service with auto-reload |
| `pnpm build` | Builds all packages: `@arth/contracts` &rarr; `@arth/backend` &rarr; `@arth/frontend` |
| `pnpm build:frontend` | Builds the production Next.js frontend application |
| `pnpm build:backend` | Compiles the TypeScript backend service to `dist/` |
| `pnpm typecheck` | Runs recursive static type checking across all workspace packages |
| `pnpm lint` | Runs ESLint across the frontend codebase |
| `pnpm test` | Runs all automated test suites across backend (86 tests) and frontend (22 tests) — 108 tests passing |
| `pnpm start:frontend` | Runs the compiled production Next.js server on port 3000 |
| `pnpm start:backend` | Runs the compiled production Fastify service on port 3001 |

---

## Phase Status

- **Phase 00**: Architecture & Auditing (Completed)
- **Phase 01A–01D**: Visual Direction & Screen Prototype (Ledger Minimal approved)
- **Phase 01E**: Project Scaffold & Tooling Setup (Completed)
- **Phase 01F**: Modular Monorepo Architecture & Backend Foundation (Completed)
- **Phase 01G**: Supabase Database Schema, Migrations & Row-Level Security (Completed)
- **Phase 01H**: Authentication Flow & Backend Session Verification (Completed)
- **Phase 01I**: Transaction Entry & Outbox Engine (Completed)
- **Phase 01J**: Category Management & Custom Ordering (Completed)
- **Phase 01K**: People & Money Tracker (Completed)
- **Phase 01L**: Database Reliability, ACID & CRUD Performance Hardening (Completed)
- **Phase 01L.1**: Close Database Reliability Gaps (Completed)
- **Phase 01M**: Dashboard (read-only) (Next)
