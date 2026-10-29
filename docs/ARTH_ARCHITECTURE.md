# Arth — Architecture Document

> Version 0.1 — Phase 00 Baseline  
> Last updated: 2026-10-25

---

## 1. System overview

Arth is a single-user personal finance tracking Progressive Web App structured as a modular monorepo (`pnpm-workspace`). The user manually enters income and expense transactions. There is no bank integration, no automatic import, and no multi-tenancy. 

The architecture enforces strict separation between:
1. **Frontend (`frontend/`)**: Next.js 16 App Router application managing UI, navigation, theme, client-side caching, and API client communication. Pure presentation layer with zero direct database access or service credentials.
2. **Backend (`backend/`)**: Fastify TypeScript API service managing domain logic, input validation, user authorization, and data mutation orchestration.
3. **Shared Contracts (`packages/contracts/`)**: Common TypeScript types, request/response DTOs, and schemas shared between frontend and backend.
4. **Database Infrastructure (`supabase/`)**: PostgreSQL 15 database migrations, Row Level Security (RLS) policies, and database tests.
5. **Secondary Storage (Phase 02)**: Google Sheets API v4 integration fed via an authoritative asynchronous Outbox pattern worker.

```
┌──────────────────────────────────────────────────────────┐
│              Frontend Application (frontend/)            │
│   Next.js 16 (App Router) — Tailwind CSS v4             │
│   Ledger Minimal Tokens — UI state (Zustand)             │
│   Pure presentation & API client; ZERO database access  │
└───────────────────────────┬──────────────────────────────┘
                            │ HTTPS / JSON API
                            │ (Bearer JWT / Session token)
                            ▼
┌──────────────────────────────────────────────────────────┐
│               Backend Service (backend/)                 │
│   Fastify TypeScript Service                             │
│   • Request Validation & API Authorization               │
│   • Domain Business Rules & Authoritative Calculations   │
│   • Authoritative Outbox & Sheets Sync Worker (Phase 02) │
│   • Isolated Service-Role & Google SA Credentials        │
└─────────────┬──────────────────────────────┬─────────────┘
              │ Authenticated SQL / Service  │ Google API v4
              ▼                              ▼
┌───────────────────────────────┐  ┌───────────────────────┐
│       Supabase Database       │  │  Google Sheets API    │
│  PostgreSQL 15 (RLS Enforced) │  │  Secondary Ledger     │
│  Profiles, Categories, Txns   │  └───────────────────────┘
│  Outbox Events table          │
└───────────────────────────────┘
```

### 1.1 Monorepo Workspace Boundaries

| Package / Directory | Responsibilities | Disallowed Dependencies / Behaviors |
|---|---|---|
| `frontend/` | Next.js App Router, React UI, Ledger Minimal styles, client cache | No direct database connection, no service-role keys, no Google Sheets credentials |
| `backend/` | Fastify server, business rules, API routing, validation, DB access | No frontend UI components, no client-side DOM APIs |
| `packages/contracts/` | Typed API contracts, DTO interfaces, shared schemas | No business logic, no heavy dependencies, no database access |
| `supabase/` | Append-only SQL migrations, local emulation config, RLS policies | No application runtime code |
| `docs/` | Architecture specs, UX blueprint, design tokens, prototypes | No executable runtime dependencies |

---

## 2. Data model

### 2.1 Design principles

- Amounts stored as **`BIGINT` paise** (1 INR = 100 paise). Never `DECIMAL` or `FLOAT`.
- All timestamps as **`TIMESTAMPTZ`** in UTC; converted to Asia/Kolkata at render time.
- Transaction primary keys are **UUID v7** (time-ordered) generated client-side for idempotent offline sync.
- Categories are soft-deleted (never hard-deleted) to preserve historical integrity.
- Row-Level Security (RLS) enabled on every table; policies gate on `auth.uid()`.

### 2.2 Schema (authoritative — migrations enforce this)

```sql
-- ─── users (managed by Supabase Auth) ──────────────────────────────────────
-- auth.users is provided by Supabase; we extend it with a profile.

CREATE TABLE public.profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  timezone     TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  currency     TEXT NOT NULL DEFAULT 'INR',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── categories ─────────────────────────────────────────────────────────────
CREATE TABLE public.categories (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  type         public.transaction_type NOT NULL,
  icon         TEXT,                      -- emoji or glyph name
  color        TEXT,                      -- hex color
  sort_order   INTEGER NOT NULL DEFAULT 0,
  is_default   BOOLEAN NOT NULL DEFAULT FALSE,
  archived_at  TIMESTAMPTZ,               -- non-destructive soft-archive
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_categories_id_user_type UNIQUE (id, user_id, type)
);

CREATE UNIQUE INDEX idx_categories_user_type_name_active
  ON public.categories (user_id, type, lower(name))
  WHERE archived_at IS NULL;

-- ─── transactions ────────────────────────────────────────────────────────────
CREATE TYPE public.transaction_type    AS ENUM ('income', 'expense');
CREATE TYPE public.payment_method      AS ENUM ('online', 'cash');
CREATE TYPE public.necessity_class     AS ENUM ('essential', 'optional', 'luxury');

CREATE TABLE public.transactions (
  id                 UUID PRIMARY KEY,            -- UUID v7, client-generated
  user_id            UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_paise       BIGINT NOT NULL CHECK (amount_paise > 0),
  type               public.transaction_type   NOT NULL,
  category_id        UUID NOT NULL,
  transaction_date   DATE NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date,
  payment_method     public.payment_method     NOT NULL,
  necessity          public.necessity_class,       -- required when type = 'expense', NULL for 'income'
  description        TEXT,
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ,                 -- reversible soft delete
  sheets_synced_at   TIMESTAMPTZ,                 -- outbox synchronization marker
  
  -- Composite relational foreign key enforcing category ownership and type match
  CONSTRAINT fk_transactions_category_user_type
    FOREIGN KEY (category_id, user_id, type)
    REFERENCES public.categories(id, user_id, type)
    ON DELETE RESTRICT,

  -- Necessity constraint
  CONSTRAINT chk_transactions_necessity CHECK (
    (type = 'expense' AND necessity IS NOT NULL) OR
    (type = 'income' AND necessity IS NULL)
  )
);

CREATE INDEX idx_transactions_user_date_active
  ON public.transactions (user_id, transaction_date DESC, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_transactions_user_category
  ON public.transactions (user_id, category_id)
  WHERE deleted_at IS NULL;

-- ─── outbox_events ───────────────────────────────────────────────────────────
CREATE TYPE public.outbox_status AS ENUM ('pending', 'processing', 'completed', 'failed');

CREATE TABLE public.outbox_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  entity_type      TEXT NOT NULL DEFAULT 'transaction',
  entity_id        UUID NOT NULL,
  event_type       TEXT NOT NULL,
  payload          JSONB NOT NULL,
  status           public.outbox_status NOT NULL DEFAULT 'pending',
  retry_count      INTEGER NOT NULL DEFAULT 0,
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at     TIMESTAMPTZ,
  CONSTRAINT chk_outbox_event_type CHECK (
    event_type IN ('transaction.created', 'transaction.updated', 'transaction.deleted', 'transaction.restored')
  )
);

CREATE INDEX idx_outbox_status_pending_created
  ON public.outbox_events (status, created_at ASC)
  WHERE status = 'pending';
  event_type       public.outbox_event_type NOT NULL,
  payload          JSONB NOT NULL,
  status           public.outbox_status NOT NULL DEFAULT 'pending',
  attempts         INTEGER NOT NULL DEFAULT 0,
  last_attempt_at  TIMESTAMPTZ,
  delivered_at     TIMESTAMPTZ,
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_outbox_pending
  ON public.outbox_events (created_at ASC)
  WHERE status = 'pending';

-- ─── people & money tracker (Phase 01K & 01L Hardening) ──────────────────────
CREATE TYPE public.person_direction AS ENUM ('i_owe_them', 'they_owe_me');

CREATE TABLE public.people (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  direction     public.person_direction NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at   TIMESTAMPTZ,
  CONSTRAINT chk_people_name_non_empty CHECK (char_length(trim(name)) > 0 AND char_length(name) <= 100),
  CONSTRAINT uq_people_id_user_id UNIQUE (id, user_id)
);

CREATE TABLE public.person_money_records (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  person_id      UUID NOT NULL,
  name           TEXT NOT NULL,
  amount_paise   BIGINT NOT NULL CHECK (amount_paise > 0),
  direction      public.person_direction NOT NULL,
  record_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  notes          TEXT,
  archived_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_records_person_user FOREIGN KEY (person_id, user_id)
    REFERENCES public.people(id, user_id) ON DELETE RESTRICT,
  CONSTRAINT uq_records_id_user_id UNIQUE (id, user_id),
  CONSTRAINT chk_records_name_non_empty CHECK (char_length(trim(name)) > 0 AND char_length(name) <= 100)
);

CREATE TABLE public.person_money_settlements (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  record_id        UUID NOT NULL,
  amount_paise     BIGINT NOT NULL CHECK (amount_paise > 0),
  settlement_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_settlements_record_user FOREIGN KEY (record_id, user_id)
    REFERENCES public.person_money_records(id, user_id) ON DELETE RESTRICT
);

-- Primary and covering query indexes
CREATE INDEX idx_people_user_active ON public.people (user_id, created_at DESC) WHERE archived_at IS NULL;
CREATE INDEX idx_people_user_direction_active ON public.people (user_id, direction, created_at DESC) WHERE archived_at IS NULL;
CREATE INDEX idx_people_user_name ON public.people (user_id, lower(name));
CREATE INDEX idx_records_person ON public.person_money_records (person_id, record_date DESC, created_at DESC);
CREATE INDEX idx_records_person_active ON public.person_money_records (person_id, user_id, record_date DESC) WHERE archived_at IS NULL;
CREATE INDEX idx_records_user_date ON public.person_money_records (user_id, record_date DESC);
CREATE INDEX idx_settlements_record ON public.person_money_settlements (record_id, settlement_date DESC);
CREATE INDEX idx_settlements_record_amount ON public.person_money_settlements (record_id, amount_paise);
```

### 2.3 Constraints enforced

| Rule | Mechanism |
|---|---|
| Expense must have necessity | `CHECK` constraint on `transactions` |
| Amounts always positive | `CHECK (amount_paise > 0)` |
| Unique category names per user | `UNIQUE (user_id, type, lower(name)) WHERE archived_at IS NULL` |
| User can only read/write own rows | RLS policies on all tables (`auth.uid() = user_id`) |
| Soft deletes only | `deleted_at` / `archived_at` column; filter in active queries |
| Composite tenant foreign keys | `(person_id, user_id)` and `(record_id, user_id)` enforce tenant boundary |
| History preservation | `ON DELETE RESTRICT` on records and settlements; `DELETE` revoked on `people` and `person_money_records` (Migration 0011) |
| Non-destructive lifecycle | Archival (`archived_at`) is the sole supported lifecycle for people and money records |
| Settlement within bounds | Computed from settlement rows via `fn_record_person_settlement` under `FOR UPDATE` row lock |
| Direct settlement write lockdown | Direct `INSERT`, `UPDATE`, `DELETE` revoked from `authenticated` role |
| Settlement idempotency & replay | `p_id` replay returns existing settlement (matching `record_id`, `amount_paise`, `settlement_date`, `notes`); concurrent identical retries resolve post-lock; conflicts raise `23505` |
| Concurrency-safe settlements | `public.fn_record_person_settlement` with `SELECT ... FOR UPDATE` row locking |
| Concurrency-safe category reorder | `public.fn_reorder_categories` with `FOR UPDATE` lock on active categories |
| Direction locking | Direction cannot be changed while unsettled records exist |
| Physical ledger isolation | People obligations are strictly isolated from `transactions` |

### 2.4 People & Money Tracker Architecture (Phase 01K & 01L)

The People tracker provides debt and loan tracking with strict financial invariants:

1. **Physical Ledger Isolation**:
   - People obligations (`person_money_records`) and settlements (`person_money_settlements`) are physically separated from the main ledger (`transactions`).
   - Neither loans nor settlements generate income or expense transactions or alter the Dashboard Net Cash Flow.
2. **Single-Direction Invariant**:
   - Each person has exactly one active direction at any given time: `i_owe_them` or `they_owe_me`.
   - Never display separate "To Pay" and "To Receive" balances for the same person.
3. **Direction Switching Lock**:
   - A person's direction is strictly immutable while any active, unsettled balance remains (`remaining_paise > 0`).
   - Direction can only be updated if all existing money records are fully settled.
4. **Authoritative Single Source of Truth for Balances**:
   - Settled totals are dynamically derived from `person_money_settlements` using index-only scans on `idx_settlements_record_amount`. No duplicated mutable column on records risks reconciliation drift.
5. **Direct Mutation Lockdown & History Protection**:
   - Direct `INSERT`, `UPDATE`, and `DELETE` on `person_money_settlements` are revoked from authenticated users.
   - All settlements are recorded exclusively through `fn_record_person_settlement` (SECURITY DEFINER, row-locked).
   - Foreign keys use `ON DELETE RESTRICT` to ensure financial audit records cannot be dropped.
6. **Color Dual-Encoding**:
   - **RED**: I owe this person money (`i_owe_them`).
   - **GREEN**: This person owes me money (`they_owe_me`).
   - Accompanied at all times with explicit text descriptions (e.g. "I owe Rahul ₹1,200.00" or "Rahul owes me ₹500.00").

### 2.5 Real Data Dashboard & Financial Aggregation (Phase 01M)

The Dashboard is the primary Home destination of Arth, answering four core financial questions for any selected period:
1. **How much money came in?** Total Income in integer paise (`type = 'income'`).
2. **How much money went out?** Total Expenses in integer paise (`type = 'expense'`).
3. **What is my net cash flow?** Income minus expenses for the period (can be positive, negative, or zero). Explicitly labeled as "Net Cash Flow", never "Account Balance".
4. **Where did my money go?** Spending composition grouped by category with exact paise sums, formatted INR, and share percentages.

Key architectural invariants:
1. **Physical Isolation from People Obligations**: People debts, loans, obligations (`person_money_records`), and settlements (`person_money_settlements`) are never merged with income or expenses and do not alter the Dashboard Net Cash Flow.
2. **PostgreSQL-Side Snapshot Aggregation**: Stored procedure `public.fn_dashboard_summary(p_start_date DATE, p_end_date DATE)` (Migration 0012) calculates totals, category composition, and bounded recent activity in a single snapshot read using `SECURITY INVOKER` to enforce RLS boundaries.
3. **Deterministic Date Ranges in `Asia/Kolkata` (IST)**: Presets (`today`, `this_week`, `this_month`, `last_month`, `this_year`, `custom`) are resolved using `Asia/Kolkata` calendar boundaries, ensuring deterministic inclusive ranges.
4. **Soft-Delete Exclusions**: Soft-deleted transactions (`deleted_at IS NOT NULL`) are filtered in SQL.
5. **Immediate Invalidation via Quick Add**: When Quick Add records a transaction, the dashboard shell triggers an immediate re-fetch so financial summaries update instantly.

---

## 3. Authentication & Session Architecture

### 3.1 Overview
- **Provider**: Supabase Auth
- **Authentication Methods**:
  - Email & Password sign-in and account registration with client/server validation and live strength indicators.
  - Google OAuth with PKCE flow (one-click federated sign-in).
  - Password recovery request flow and dedicated reset session screen (`/auth/update-password`).
- **Username & Display Name**:
  - During registration, username is captured, validated (3-30 chars, alphanumeric, hyphens, underscores), and passed via Supabase user metadata.
  - PostgreSQL trigger `fn_handle_new_user()` (Migration 0013) extracts and prioritizes `raw_user_meta_data->>'username'` as `display_name` in `public.profiles`.
- **Session Management**: HTTP-only, secure, `SameSite=Lax` cookies managed server-side via `@supabase/ssr`. Passwords are never stored in Arth application tables.
- **OAuth Callback & Origin Resolution**:
  - Centralized in `frontend/src/lib/auth-config.ts` (`getAppOrigin`, `getAuthCallbackUrl`, `sanitizeRedirectPath`).
  - Production origin strictly resolves from `NEXT_PUBLIC_APP_URL` or proxy headers; never falls back to `localhost` in production.
  - Callback handler at `/auth/callback` exchanges the PKCE authorization code server-side and redirects with HTTP 303 to clean the address bar.
  - Complete dashboard and branding configuration documented in `docs/GOOGLE_OAUTH_SETUP.md`.
- **Clients**:
  - `frontend/src/lib/supabase/server.ts`: Server-side client using `createServerClient` reading/writing cookies in Next.js Server Components, Server Actions, and Route Handlers.
  - Browser: Server Actions initiate OAuth redirects or handle email/password sign-in; browser JS never holds raw long-lived refresh tokens, service-role keys, or database master credentials.
- **Profile Creation**: PostgreSQL trigger `fn_handle_new_user()` on `auth.users` automatically provisions `public.profiles` and seeds initial default categories.

### 3.2 BFF Thin Proxy Pattern
The Next.js frontend acts as a Backend-For-Frontend (BFF) proxy for authenticated Fastify API requests:
1. Browser makes requests to Next.js route handlers (`/api/backend/*`).
2. Next.js server validates the HTTP-only session cookie via `@supabase/ssr`.
3. Next.js extracts the ephemeral `access_token` JWT from the session.
4. Next.js forwards the request to Fastify with `Authorization: Bearer <access_token>`.
5. Fastify validates the JWT, decorates `request.user`, and executes domain logic.
6. Browser code never directly manages JWT refresh tokens or bearer headers.

### 3.3 Fastify JWT Verification Plugin
The backend service (`backend/src/plugins/auth.ts`) provides zero-trust identity verification:
- **Library**: `jose` (JSON Object Signing and Encryption).
- **Verification Modes**:
  - **Symmetric (HS256)**: Verifies against `SUPABASE_JWT_SECRET` when configured (optimal for local testing and containerized services).
  - **Asymmetric (RS256 / JWKS)**: Dynamically fetches and caches public signing keys from `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`.
- **Validation Rules**:
  - Signature integrity.
  - Expiration (`exp` check with clock tolerance).
  - Audience check: claims `aud === 'authenticated'`.
  - Issuer check: claims `iss === `${SUPABASE_URL}/auth/v1``.
  - Subject existence: `sub` must be a valid user UUID.
- **Request Decoration**: Injects `request.user = { id: payload.sub, email: payload.email, role: payload.role }`.

### 3.4 Auth Endpoints & Handlers
- `POST /login`: Server action in `frontend/src/app/login/page.tsx` initiates OAuth sign-in with redirect to Supabase.
- `GET /auth/callback`: Route Handler exchanging authorization `code` for session, with strict relative URL sanitization against open redirect attacks.
- `POST /auth/logout` & `GET /auth/logout`: Route Handler revoking Supabase session and clearing HTTP-only cookies.
- `GET /api/v1/auth/me`: Fastify protected identity endpoint returning `AuthIdentityResponse` (`{ id, email, role }`).
- `GET /api/backend/auth/me`: Next.js BFF proxy endpoint routing client identity requests to Fastify.

---

## 4. Row-Level Security policies

```sql
-- profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- categories
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users CRUD own categories"
  ON public.categories FOR ALL USING (auth.uid() = user_id);

-- transactions
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users CRUD own transactions"
  ON public.transactions FOR ALL USING (auth.uid() = user_id);

-- outbox_events (server-role only for writes; user can read own)
ALTER TABLE public.outbox_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own outbox"
  ON public.outbox_events FOR SELECT USING (auth.uid() = user_id);
-- Writes to outbox_events are performed by server via service-role key only
```

---

## 5. Transaction Engine & Idempotency Mechanics (Phase 01I)

### 5.1 Client-Side UUID v7
All transaction primary keys are generated client-side before submission using standard RFC 9562 UUID v7 (`uuid` library).
- Generates monotonically increasing, timestamp-ordered keys that guarantee natural chronological clustering.
- Retained across network retries to enable deterministic idempotency.

### 5.2 Idempotency Invariants
1. **First Submission**: Fastify validates inputs, verifies category ownership and matching type, and inserts `public.transactions`. The `trg_transactions_outbox` trigger automatically writes `transaction.created` to `public.outbox_events` in the same PostgreSQL transaction. Returns HTTP 201 Created (`idempotent_replay: false`).
2. **Identical Replay**: Retrying with the same UUID v7 and identical normalized payload is detected as an idempotent replay. Returns HTTP 200 OK (`idempotent_replay: true`) with the existing record, without generating duplicate transactions or duplicate outbox events.
3. **Payload Mutation Conflict**: Submitting the same UUID v7 with different payload attributes (e.g., altered amount or category) is rejected with HTTP 409 Conflict.
4. **Deleted ID Conflict**: Attempting to replay or recreate a transaction whose UUID v7 was previously soft-deleted (`deleted_at IS NOT NULL`) returns HTTP 409 Conflict, preventing accidental resurrection of deleted records.

### 5.3 Integer-Paise Financial Representation
Monetary amounts are submitted from UI as decimal strings (e.g., `"250.50"`), parsed using exact string and BigInt arithmetic without floating-point math, and stored in PostgreSQL as `BIGINT CHECK (amount_paise > 0)`.
- Rejects zero, negative, malformed, or excessive decimal precision (> 2 decimal digits).
- Formatting uses Indian numbering notation (`₹12,34,567.89`) via `formatPaiseToINR`.

---

## 6. Category Management & Custom Ordering Architecture

### 6.1 Data Invariants & Non-Destructive Lifecycle
- **Strictly Non-Destructive**: Categories are never physically deleted (`DELETE` statements are strictly prohibited). Soft-archiving (`archived_at TIMESTAMPTZ`) hides categories from new entry workflows while maintaining 100% referential integrity with past transactions.
- **Relational Consistency**: Transactions enforce composite foreign key constraint `fk_transactions_category_user_type FOREIGN KEY (category_id, user_id, type) REFERENCES public.categories(id, user_id, type)`.
- **Type Immutability**: Once created, category `type` (`income` vs `expense`) cannot be modified because past transactions reference `(category_id, user_id, type)`.
- **Case-Insensitive Active Uniqueness**: Enforced via partial unique index `idx_categories_user_type_name_active ON public.categories (user_id, type, lower(name)) WHERE archived_at IS NULL`.
- **Restoration Rules**: An archived category can be restored only if no active category of the same type and user already shares that case-insensitive name.

### 6.2 Atomic Custom Ordering Engine
- **Stored Procedure**: `public.fn_reorder_categories(p_type public.transaction_type, p_category_ids UUID[])` runs with `SECURITY INVOKER`.
- **Validation**:
  - Checks for array duplicates.
  - Verifies that the provided ID list matches the exact count and identities of all active categories for the calling user and type (`WHERE user_id = auth.uid() AND type = p_type AND archived_at IS NULL`).
  - Rejects partial, missing, foreign, or archived category IDs.
- **Atomic Renumbering**: Updates `sort_order = ordinal_index` in a single transaction, preventing race conditions or duplicated sort orders.
- **Immediate Propagation**: Category additions, renames, reorders, and archive state changes are propagated to the frontend shell and immediately reflected in Quick Add without requiring page reloads.

---

## 7. Google Sheets synchronization strategy

### 5.1 Architecture

The outbox pattern decouples transaction writes from Sheets delivery.

```
Transaction write (client)
  → INSERT transactions + INSERT outbox_events (same DB transaction)
  → API Route Handler /api/sync/sheets (server, service-role)
      → reads pending outbox_events
      → calls Google Sheets API v4
      → marks rows delivered / failed
```

### 5.2 Sheet structure (one sheet per month, or single flat sheet)

| Column | Value |
|---|---|
| A | Transaction ID (UUID) |
| B | Date (YYYY-MM-DD) |
| C | Type (Income / Expense) |
| D | Category |
| E | Amount (INR, decimal display only) |
| F | Payment Method |
| G | Necessity |
| H | Note |
| I | Synced At |

### 5.3 Conflict resolution

- Supabase PostgreSQL is **always authoritative**.
- Sheets is **write-once append + update**; a full reconciliation job (pg_cron or Vercel Cron) re-writes all rows weekly.
- On conflict: Supabase wins. Stale Sheets rows are overwritten.

### 5.4 Failure handling

| Scenario | Handling |
|---|---|
| Sheets API rate-limit | Exponential backoff, max 5 attempts, then `status = 'failed'` |
| Sheets API down | outbox_event stays `pending`; retried by cron |
| Network interruption | Same as above |
| Delivered but DB not updated | Idempotent upsert in Sheets (UUID as row key) |

---

## 6. PWA & Offline Strategy

### 6.0 Baseline Installability (Phase 01N — Implemented)

Arth provides baseline Progressive Web App installability via the Next.js App Router:
- **Web App Manifest**: Exported via `frontend/src/app/manifest.ts` using `MetadataRoute.Manifest` with `id: '/'`, `scope: '/'`, `start_url: '/'`, `display: 'standalone'`, and Ledger Minimal branding (`#FBFBF9` background, `#1C1917` theme color, `lang: 'en-IN'`). Served at `/manifest.webmanifest`.
- **Application Icons**: Crisp PNG icons in `frontend/public/icons/`:
  - `icon-192x192.png` (192×192 standard launcher)
  - `icon-512x512.png` (512×512 standard launcher/splash)
  - `icon-512x512-maskable.png` (512×512 maskable, with all critical geometry strictly enclosed inside the center 80% safe zone circle)
  - `apple-touch-icon.png` (180×180 iOS home screen)
  - `favicon.ico` (browser tab icon)
- **Viewport & Apple Meta**: Configured in `frontend/src/app/layout.tsx` with light/dark `themeColor` media queries, `viewportFit: 'cover'`, and `appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Arth' }`.
- **Subtle Install Experience**: Managed via `usePwaInstall` hook and `InstallPromptCard` rendered in Settings/More (`activeView === 'more'`). Captures `beforeinstallprompt`, provides clean "Install Arth" action, detects standalone mode via `matchMedia('(display-mode: standalone)')`, and provides manual installation steps for iOS/iPadOS Safari without intrusive unsolicited modals.
- **Strict Scope Boundaries**: Phase 01N implements **zero** service workers, zero offline caching, and zero IndexedDB/Dexie usage.

### 6.1 Service Worker & Offline Strategy (Deferred to Phase 03)

> **Not implemented in Phase 01. Documented here to prevent conflicting design decisions.**

#### 6.1.1 Service worker

- Use Workbox (via `next-pwa` or custom `sw.js`) for static asset caching.
- Cache-first for UI shell; network-first for data.

#### 6.1.2 IndexedDB (Dexie.js)

```typescript
// src/lib/db.ts  (Phase 03)
const db = new Dexie('arth');
db.version(1).stores({
  transactions: '++id, type, transaction_date, synced',
  outbox:       '++id, created_at, status',
});
```

### 6.3 Sync reconciliation

- On reconnect: flush local outbox to server Route Handler.
- Server deduplicates using UUID v7 (idempotent upsert).
- Conflict resolution: `updated_at` timestamp wins; server wins on tie.

---

### 6.4 Native Android notification companion

The `android/` project includes a native notification-listener companion next to the Trusted Web Activity. It inspects notifications only from user-selected packages, parses supported financial events locally, and stores structured review candidates in app-private SQLite. Unconfirmed candidates are not ledger transactions and expire locally.

The companion signs in with Supabase Auth and stores the session using Android Keystore-backed encrypted preferences. Native requests use `GET /api/native/categories`, a bounded `GET /api/native/transactions` same-day lookup, and `POST /api/native/transactions`; these BFF routes validate the Supabase bearer token, derive ownership from the verified user, and proxy to existing Fastify APIs. A confirmed transaction uses the standard UUID v7 create contract and PostgreSQL outbox trigger. The native transaction proxy also requests the established best-effort Sheets outbox drain. The companion never has a service-role key and never writes application tables directly.

Android’s candidate/sync queue is private and separate from the web PWA’s IndexedDB queue. Only user-confirmed payloads are queued for server sync; pending notification detections are never synchronized. The manifest does not request SMS inbox permissions: SMS content is eligible only when its app displays it in a notification. See `android/README.md` for build configuration, setup, and device limitations.

## 7. Backup and export strategy

### 7.1 Data export (Phase 02)

- **CSV Export**:
  - Implemented in `frontend/src/lib/export/csv-export.ts`
  - Strict RFC 4180 escaping for commas, quotes (`""`), and newlines.
  - **Formula Injection Protection (CWE-1236)**: Values beginning with `=`, `+`, `-`, or `@` are automatically escaped with a leading single quote (`'`), ensuring spreadsheet software does not execute dangerous external commands or macros.
  - Exact integer paise converted to two-decimal INR currency format.
  - Client-side streaming download triggered from More & Settings.
- **JSON Export**:
  - Implemented in `frontend/src/lib/export/json-export.ts`
  - Versioned JSON document structure (`version: 1`) containing full user metadata, active/archived category taxonomy, and complete transaction history.
  - Preserves raw `amount_paise` BIGINT integers, timestamps, and soft-delete statuses for lossless disaster recovery.
- **Ledger Statement PDF Export**:
  - Implemented in `frontend/src/features/transactions/ledger-pdf-exporter.ts`
  - High-precision client-side PDF document generation formatted for A4 printing in monochrome branding.
  - Deterministic inclusive date ranges in Asia/Kolkata (presets and custom calendar bounds).
  - Category and transaction type filters (All, Income Only, Expense Only) with repeated table headers across pages.

### 7.2 Google Sheets Asynchronous Mirroring (Phase 02)

- **Architecture**:
  - PostgreSQL remains the single authoritative source of truth.
  - Google Sheets serves as an external, human-readable read-only mirror.
  - Mutations generate atomic events in `public.outbox_events` via database trigger `trg_transactions_outbox`.
- **Per-User Pairing**:
  - Paired via `public.user_sheet_connections` (Migration 0017).
  - Users supply their personal Google Spreadsheet URL/ID and share Editor access with `GOOGLE_SERVICE_ACCOUNT_EMAIL`.
  - Headers initialized automatically on connection:
    `Transaction ID | Date | Name / Description | Category | Type | Amount (INR) | Payment Method | Necessity | Notes | Status | Created At | Updated At`
- **Outbox Worker & Concurrency Control**:
  - Server worker daemon (`frontend/src/lib/server/sheets-worker.ts`) claims pending events using PostgreSQL `FOR UPDATE SKIP LOCKED` via RPC `fn_claim_outbox_events`.
  - Atomically locks batches with lease tokens (`locked_at`, `claim_id`) preventing duplicate execution across concurrent serverless invocations.
  - Stale in-flight claims (>300 seconds) are automatically reclaimed if a worker terminates mid-flight.
  - Failed writes retry with exponential backoff up to 5 attempts before marking as `failed`.
- **Idempotency & Reconciliation**:
  - Google Sheet rows are matched by UUID in Column A.
  - Created transactions append or update existing matching rows.
  - Edited transactions update columns in place.
  - Soft-deleted transactions update the Status column to `DELETED`.
  - Restored transactions update Status back to `ACTIVE`.
  - Weekly full reconciliation (`/api/sync/reconcile`) validates every database transaction against the sheet, correcting drift.
- **Schedulers & Security**:
  - Triggered every 5 minutes by Vercel Cron at `/api/sync/sheets`.
  - Authenticated via `Authorization: Bearer <CRON_SECRET>`.
  - Manual sync available on-demand in Settings via `/api/backend/sheets/sync`.
  - **Keyless Production Authentication (Workload Identity Federation)**:
    - Eliminates static RSA private keys in compliance with GCP organization policy `iam.disableServiceAccountKeyCreation`.
    - Next.js serverless functions obtain short-lived OIDC tokens via `@vercel/oidc`.
    - Exchanged securely through Google Security Token Service (STS) and IAM service account impersonation (`google-auth-library` `ExternalAccountClient`).
    - Configured via `GCP_PROJECT_NUMBER`, `GCP_WORKLOAD_IDENTITY_POOL_ID`, `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID`, and `GCP_SERVICE_ACCOUNT_EMAIL`.
    - Local development fallback: RSA private keys via `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` / `google-auth-library` `JWT`.

### 7.3 Database backup

- Supabase automatic daily backups (built-in, free tier: 7 days; Pro: 30 days)
- Google Sheets acts as a human-readable secondary copy
- Point-in-time recovery on Supabase Pro plan

### 7.4 Recovery

- Restore from Supabase backup dashboard (point-in-time on Pro)
- Restore from versioned JSON export via `ImportExport` module

---

## 8. Transaction ID strategy

```
UUID v7 structure:
  [48-bit unix_ts_ms][4-bit version=7][12-bit rand_a][2-bit variant][62-bit rand_b]

Generation: client-side using `uuid` npm package (v7 method)
Properties:
  - Time-ordered → natural sort without secondary index
  - Globally unique → safe for offline generation without coordination
  - Idempotent → re-submitting the same UUID is a safe upsert (no duplicates)
```

---

## 9. Calculation determinism

- **All monetary arithmetic** is performed in paise (integers). No floating-point ever touches money values.
- Totals and summaries are computed server-side in SQL (`SUM(amount_paise)`) or in pure integer arithmetic on the server.
- Client displays amounts by dividing by 100 with `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })`.
- Date defaults use `date-fns-tz` with explicit `Asia/Kolkata` timezone — never `new Date().toLocaleDateString()`.

---

## 10. Architectural risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Offline data loss** | High | UUID v7 client-generated IDs + outbox pattern in IndexedDB (Phase 03) |
| **Duplicate transactions** | High | UUID v7 primary key + server upsert (`ON CONFLICT DO UPDATE`) |
| **Sheets sync failure** | Medium | Outbox with retry + weekly full reconciliation cron |
| **Auth token expiry during long session** | Medium | `@supabase/ssr` automatic token refresh |
| **RLS misconfiguration** | High | All tables have RLS from day 1; integration tests verify isolation |
| **Float arithmetic errors** | High | Paise-as-integer mandate enforced in Zod schemas and DB constraints |
| **Migration drift** | Medium | Append-only migration files; Supabase migration tracking |
| **Service account key exposure** | Critical | Server-only env vars; never in client bundle; gitignored |
| **Google API quota exhaustion** | Low | Batched writes; exponential backoff; weekly cron instead of per-tx polling |
| **Category deletion breaking history** | Medium | Categories are soft-archived; `ON DELETE SET NULL` on FK |

---

## 11. Future modules — specification stubs

> These modules are **documented but not implemented** until their assigned phase.

### `BudgetManager`
Set monthly/weekly spending budgets per category. Track actual vs budget. Alert on threshold breach (80%, 100%).

### `SpendingInsights`
Aggregate analytics: monthly trends, category breakdown, payment method split, necessity ratio charts. Read-only computation layer.

### `FinancialGoals`
Define saving targets with deadlines. Automatically compute required monthly contribution. Link to income transactions.

### `RecurringTransactions`
Template-based recurring entries. Generates transaction entries on schedule. Idempotency key prevents double-generation.

### `SubscriptionTracker`
Special-case recurring expense with renewal date, billing cycle, and cancellation tracking.

### `FinancialHealth`
Composite score from savings rate, expense ratio, necessity vs luxury split, and budget adherence.

### `AIAdvisor`
LLM-powered natural-language spend analysis. Receives read-only aggregated (not raw) data. Suggestions are advisory only.

### `ImportExport`
CSV and JSON export. JSON import for recovery. No bulk bank-statement import in v1.

---

## 12. Deployment Architecture & External Setup Requirements

### 12.1 Phase 01 Production Deployment Architecture

```
                                  ┌────────────────────────┐
                                  │      Client Device     │
                                  │ (Browser / Desktop PWA)│
                                  └───────────┬────────────┘
                                              │ HTTPS
                                              ▼
                                  ┌────────────────────────┐
                                  │  Next.js 16 Frontend   │
                                  │   (Vercel Serverless)  │
                                  │   • App Router Pages   │
                                  │   • BFF Proxy Routes   │
                                  └─────┬────────────┬─────┘
                                        │            │
                     Server Bearer JWT  │            │ Supabase SSR Cookie Auth
                                        │            │
                                        ▼            ▼
┌────────────────────────┐        ┌─────────────┐  ┌─────────────────────────┐
│  Fastify API Backend   │───────▶│ PostgreSQL  │◀─┤      Supabase Auth      │
│ (Render Web Service)   │ PostgREST│ (Supabase)│  │ (Google OAuth & JWTs)   │
│ • Long-lived Node.js   │  RPC   │ • 12 Migs   │  └─────────────────────────┘
│ • Authoritative Engine │        │ • Strict RLS│
└────────────────────────┘        └─────────────┘
```

### 12.2 Production Setup Requirements

1. **Supabase Project**:
   - Create/link project at supabase.com.
   - Apply numbered migrations `0001` through `0012` via `supabase db push`.
   - Never run `supabase db reset` on remote environments.
   - Configure automatic daily backups (and PITR on Pro).
2. **Supabase Auth (Google OAuth & Site URL)**:
   - Configure Site URL: `https://<your-frontend-domain>` (e.g. `https://arth.vercel.app`).
   - Configure Redirect URLs: `https://<your-frontend-domain>/auth/callback`.
   - In Google Cloud Console OAuth Credentials: set Authorized Redirect URI to `https://<supabase-project-ref>.supabase.co/auth/v1/callback`.
3. **Backend Service (Render Managed Node.js Web Service)**:
   - Connect repository `https://github.com/digitaldodo/Arth.git` to Render using Blueprint `render.yaml` or Web Service.
   - Set Build Command: `pnpm install --frozen-lockfile && pnpm --filter @arth/contracts build && pnpm --filter @arth/backend build`.
   - Set Start Command: `pnpm --filter @arth/backend start`.
   - Health Check Path: `/health`.
   - Configure Environment Variables in Render Dashboard:
     - `NODE_ENV=production`
     - `HOST=0.0.0.0`
     - `SUPABASE_URL=https://<your-project-ref>.supabase.co`
     - `SUPABASE_ANON_KEY=<anon-key>`
     - `CORS_ORIGIN=https://<your-frontend-domain>`
4. **Frontend Service (Vercel Next.js Deployment)**:
   - Connect repository `https://github.com/digitaldodo/Arth.git` to Vercel using `vercel.json`.
   - Build Command: `pnpm --filter @arth/contracts build && pnpm --filter @arth/frontend build`.
   - Output Directory: `.next`.
   - Configure Environment Variables in Vercel Dashboard:
     - `NEXT_PUBLIC_APP_URL=https://<your-frontend-domain>`
     - `NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co`
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>`
     - `INTERNAL_API_URL=https://<your-render-backend-url>` (e.g. `https://arth-backend.onrender.com`)

### 12.3 Subsequent Phases Setup (Deferred to Phase 02+)

1. **Google Cloud Service Account**: Enable Google Sheets API; create service account and JSON key for the background outbox worker.
2. **Google Sheet Spreadsheet**: Create spreadsheet; share with service account email; configure ID.
3. **Outbox Worker / Cron**: Configure background processing worker.

---

*End of ARTH_ARCHITECTURE.md*
