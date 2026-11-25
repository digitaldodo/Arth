# ADR-001: Modular Monorepo Architecture with Dedicated Fastify Backend

- **Status**: Accepted
- **Date**: 2026-10-25
- **Deciders**: SpendSense System Architects & Engineering Pair
- **Consulted**: `ANTIGRAVITY.md`, `docs/SPENDSENSE_ARCHITECTURE.md`, `docs/SPENDSENSE_BUILD_PLAN.md`

---

## 1. Context and Problem Statement

In the initial Phase 00 audit, SpendSense was conceived as a unified Next.js application where Route Handlers and Server Actions co-existed with React components. However, personal finance applications demand rigorous boundaries around:

1. **Security Isolation**: High-privilege credentials (`SUPABASE_SERVICE_ROLE_KEY` and Google Service Account private keys) must never risk client-side leaking or accidental bundling into client bundles.
2. **Authoritative Financial Logic**: Transaction validation, outbox event generation, and paise conversions must be authoritatively owned by a dedicated service rather than scattered across frontend components or Next.js server actions.
3. **Decoupled Evolution**: The frontend (UI, PWA offline caching, design system tokens) and backend (API routing, data mutations, reconciliation workers) have distinct lifecycles and operational profiles.

## 2. Decision

We adopt a **modular monorepo** managed via **`pnpm-workspace`** with strict physical and architectural boundaries:

```text
arth/
├── frontend/             # Next.js 16 App Router (Presentation & API Client)
├── backend/              # Fastify TypeScript Service (API & Domain Logic)
├── packages/contracts/   # Shared TypeScript DTOs & API Contracts
├── supabase/             # PostgreSQL Schema, Migrations, & RLS Policies
└── docs/                 # Authoritative Architecture, UX, & Design Documentation
```

### 2.1 Workspace Folder Responsibilities

| Boundary | Directory | Responsibilities | Security / Constraints |
|---|---|---|---|
| **Frontend** | `frontend/` | Next.js App Router, React UI, Ledger Minimal design system tokens, client-side view state, API client functions calling `backend/`. | **Zero direct database queries.** No service-role key or Google service account credentials allowed. |
| **Backend** | `backend/` | Fastify API service, request validation, business rules, transactional database operations, authoritative outbox events, background sync workers. | Holds service-role and Google private credentials. Never exposes raw database credentials to client. |
| **Shared Contracts** | `packages/contracts/` | Typed request/response interfaces (e.g., `HealthCheckResponse`), DTO schemas, and shared enums. | **Zero business logic.** Lightweight and dependency-free. |
| **Database** | `supabase/` | Append-only SQL migration scripts, local emulation settings (`config.toml`), database test suites, RLS security policies. | Isolated from application runtime code. |

---

## 3. Intended Authentication and Data-Access Flow

```
[ User Browser / PWA ]
         │
         │ 1. Authenticate with Google OAuth / Magic Link
         ▼
[ Supabase Auth ]
         │
         │ 2. Returns Session JWT (access_token)
         ▼
[ Frontend App Client ]
         │
         │ 3. API Request with Header: "Authorization: Bearer <JWT>"
         ▼
[ Fastify Backend Service ]
         │
         │ 4. Verifies JWT signature & extracts authenticated user_id
         │ 5. Validates business constraints (positive paise, valid categories)
         │ 6. Executes atomic mutation in PostgreSQL (Transaction + Outbox event)
         ▼
[ Supabase PostgreSQL ]
         │
         │ 7. Enforces Row Level Security (RLS) as defense-in-depth:
         │    auth.uid() = user_id
         ▼
[ Authoritative Database State ]
```

### Security Guarantees & RLS Mechanics:
- **Genuine RLS Enforcement**: The backend never executes ordinary user CRUD queries under the privileged `service_role`. Instead, the authenticated user's identity is passed to PostgreSQL using one of two genuine RLS mechanisms:
  1. *Direct Connection Pool*: Each transaction sets local session claims before query execution:
     ```sql
     BEGIN;
     SET LOCAL role = 'authenticated';
     SET LOCAL "request.jwt.claim.sub" = '<user_uuid>';
     SET LOCAL "request.jwt.claims" = '{"sub":"<user_uuid>","role":"authenticated"}';
     -- Queries run here strictly evaluated against auth.uid() = '<user_uuid>'
     COMMIT;
     ```
  2. *Scoped Supabase Client*: The backend instantiates a per-request Supabase client scoped with the incoming user JWT (`Authorization: Bearer <token>`), ensuring PostgREST evaluates RLS under the caller's identity.
- **Service-Role Boundary**: The `service_role` key grants `BYPASSRLS` in PostgreSQL. Its usage is strictly prohibited on user endpoints and isolated exclusively to trusted background synchronization workers (Phase 02 Outbox reconciler).
- **Outbox Immutability**: Normal authenticated users have zero `SELECT`, `INSERT`, `UPDATE`, or `DELETE` grants on `public.outbox_events`. Outbox events are created atomically inside database triggers operating with `SECURITY DEFINER` and a restricted `search_path = public, auth`.
- **Credential Hygiene**: Client bundles receive only the public Supabase Anon key for login handshake. The backend exclusively manages privileged access.

---

## 4. Confirmed Decisions vs. Choices Requiring Future Validation

### Confirmed Decisions (Locked):
1. **pnpm Workspace Structure**: Mono-repo using `pnpm-workspace.yaml` with root lockfile.
2. **Fastify Framework**: Production-ready, lightweight, high-throughput Node.js framework selected for the backend API.
3. **No Database Access in Frontend**: All future financial operations must pass through backend API validation.
4. **Contract-Driven Communication**: All API communication between frontend and backend is typed via `@arth/contracts`.
5. **Integers for Money**: Amounts are strictly stored and computed as integer paise (1 INR = 100 paise) as `BIGINT CHECK (amount_paise > 0)`.
6. **Time-Ordered Primary Keys**: UUID v7 for transactions to guarantee chronological ordering and idempotent outbox replay.
7. **Declarative Category Integrity**: Relational composite foreign key `(category_id, user_id, type)` guarantees transactions cannot reference another user's category or a category of mismatched type.
8. **Reversible Soft Deletion**: Transactions use `deleted_at TIMESTAMPTZ` with atomic outbox emission for synchronization.
9. **JWT Verification with `jose` (Phase 01H)**: Implemented in Fastify (`backend/src/plugins/auth.ts`) supporting symmetric HS256 and asymmetric JWKS verification with strict audience (`authenticated`), expiration, and issuer checks.
10. **BFF Authentication Proxy (Phase 01H)**: Frontend holds HTTP-only cookies via `@supabase/ssr` and proxies authenticated API calls through Next.js route handlers (`/api/backend/*`), passing the session's bearer JWT server-to-server to Fastify without exposing tokens to client script.

### Choices Requiring Future Validation (Phase 02):
1. **Database Driver Selection**: Finalizing between direct PostgreSQL driver (`postgres.js`) using `SET LOCAL` session context vs `@supabase/supabase-js` scoped with caller token.
2. **Outbox Worker Process**: Running the Phase 02 Google Sheets outbox sync worker as an in-process Fastify background job versus a standalone Node process in `backend/`.

---
*Documented in accordance with SpendSense Architecture Protocol.*
