# ADR-001: Modular Monorepo Architecture with Dedicated Fastify Backend

- **Status**: Accepted
- **Date**: 2026-10-25
- **Deciders**: Arth System Architects & Engineering Pair
- **Consulted**: `ANTIGRAVITY.md`, `docs/ARTH_ARCHITECTURE.md`, `docs/ARTH_BUILD_PLAN.md`

---

## 1. Context and Problem Statement

In the initial Phase 00 audit, Arth was conceived as a unified Next.js application where Route Handlers and Server Actions co-existed with React components. However, personal finance applications demand rigorous boundaries around:

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

### Security Guarantees:
- **Defense-in-Depth**: The backend verifies user identity and enforces domain rules before issuing SQL queries. PostgreSQL Row Level Security enforces user isolation at the storage layer as a second line of defense.
- **Credential Hygiene**: Client bundles receive only the public Supabase Anon key for login handshake. The backend exclusively manages privileged access.

---

## 4. Confirmed Decisions vs. Choices Requiring Future Validation

### Confirmed Decisions (Locked):
1. **pnpm Workspace Structure**: Mono-repo using `pnpm-workspace.yaml` with root lockfile.
2. **Fastify Framework**: Production-ready, lightweight, high-throughput Node.js framework selected for the backend API.
3. **No Database Access in Frontend**: All future financial operations must pass through backend API validation.
4. **Contract-Driven Communication**: All API communication between frontend and backend is typed via `@arth/contracts`.
5. **Integers for Money**: Amounts are strictly stored and computed as integer paise (1 INR = 100 paise).
6. **Time-Ordered Primary Keys**: UUID v7 for transactions to guarantee chronological ordering and idempotent outbox replay.

### Choices Requiring Future Validation (Phases 01G & 01H):
1. **JWT Verification Strategy**: Validating Supabase JWTs in Fastify via local asymmetric public key verification versus remote JWKS endpoint caching.
2. **Database Client Library**: Evaluating `@supabase/supabase-js` with authenticated user context versus direct connection pool (`postgres.js` or `pg`) setting local transaction session variables for RLS.
3. **Outbox Worker Process**: Running the Phase 02 Google Sheets outbox sync worker as an in-process Fastify background job versus a standalone Node process in `backend/`.

---
*Documented in accordance with Arth Architecture Protocol.*
