# Arth — Persistent Agent Instructions

> **Read this file before writing any code.** It is the single source of truth for all architectural decisions. Do not deviate without updating this file first.

## Project identity

| Key | Value |
|---|---|
| App name | **Arth** |
| Purpose | Personal finance tracker — manual entry only |
| Owner | Single user (personal use) |
| Currency | INR (Indian Rupee) |
| Timezone | Asia/Kolkata (IST, UTC+5:30) |
| Locale | en-IN |

## Repository layout (target)

```
d:\Forge\Per\          ← workspace root
├── ANTIGRAVITY.md     ← this file (agent instructions)
├── AGENTS.md          ← alias / symlink to this file
├── docs/
│   ├── ARTH_ARCHITECTURE.md
│   ├── ARTH_BUILD_PLAN.md
│   └── ARTH_ROADMAP.md
├── src/
│   ├── app/           ← Next.js App Router pages & layouts
│   ├── components/    ← shared React components
│   ├── lib/           ← pure utilities, constants, helpers
│   ├── modules/       ← feature modules (see Module Registry below)
│   ├── server/        ← server-only code (never imported client-side)
│   ├── hooks/         ← React hooks
│   ├── store/         ← Zustand stores
│   ├── types/         ← shared TypeScript types & Zod schemas
│   └── styles/        ← global CSS / Tailwind config
├── supabase/
│   ├── migrations/    ← numbered SQL migrations (Flyway-style)
│   └── seed.sql       ← seed data (categories, defaults — NO financials)
├── public/
│   ├── icons/         ← PWA icons
│   └── manifest.json  ← Web App Manifest
├── scripts/           ← one-off maintenance / migration scripts
└── tests/             ← Vitest unit tests + Playwright e2e
```

## Technology decisions (locked)

| Concern | Choice | Rationale |
|---|---|---|
| Framework | Next.js 15 (App Router) | SSR, API Routes, RSC, stable |
| Language | TypeScript (strict mode) | Type safety across all layers |
| UI components | shadcn/ui | Unstyled, composable, Radix primitives |
| Styling | Tailwind CSS v4 | Utility-first, shadcn-compatible |
| Validation | Zod | Runtime + compile-time schema safety |
| State | Zustand | Lightweight, no boilerplate |
| Auth | Supabase Auth (Google OAuth + Magic Link) | Single provider, row-level security |
| Database | Supabase PostgreSQL | Authoritative persistent store |
| ORM / Query | supabase-js v2 (typed client) | First-class Supabase integration |
| Offline DB | Dexie.js (IndexedDB wrapper) | Deferred — Phase 03 |
| PWA | next-pwa or custom service worker | Deferred — Phase 03 |
| Sheets sync | Google Sheets API v4 via server route | Deferred — Phase 02 |
| Testing | Vitest (unit) + Playwright (e2e) | Standard ecosystem |
| Package manager | pnpm | Faster installs, strict hoisting |
| Deployment | Vercel | Zero-config Next.js, edge functions |

**Do not swap any of the above without owner approval and an update to this file.**

## Module registry

Modules are located under `src/modules/<ModuleName>/`. Each module owns its components, server actions, hooks, and types.

| Module name | Status | Phase |
|---|---|---|
| `TransactionEntry` | ✅ Active | Phase 01 |
| `CategoryManager` | ✅ Active | Phase 01 |
| `PeopleTracker` | ✅ Active | Phase 01 |
| `Dashboard` | ✅ Active | Phase 01 |
| `ExportImport` (`ImportExport`) | Planned | Phase 02 |
| `GoogleSheetsSync` | Planned | Phase 02 |
| `BudgetManager` | Planned | Phase 04 |
| `SpendingInsights` | Planned | Phase 04 |
| `FinancialGoals` | Planned | Phase 05 |
| `RecurringTransactions` | Planned | Phase 05 |
| `SubscriptionTracker` | Planned | Phase 05 |
| `FinancialHealth` | Planned | Phase 06 |
| `AIAdvisor` | Planned | Phase 06 |

**Never implement a Planned module ahead of its phase without explicit owner instruction.**

## Non-negotiable rules for all agents

1. **No mock financial data** — seed files must only contain categories, payment methods, and system defaults.
2. **No secrets in source** — all credentials go in `.env.local` (gitignored). Never hardcode API keys, service account JSON, or connection strings.
3. **Server-side only for privileged operations** — Supabase service-role key, Google service account credentials, and any financial calculations that must be authoritative live exclusively in `src/server/` or Next.js Route Handlers. Never import server code into client components.
4. **UUID v7 for transaction IDs** — use time-ordered UUIDs for natural chronological ordering and idempotent outbox replay.
5. **INR amounts as integers** — store amounts in **paise** (1 INR = 100 paise) as `BIGINT` in PostgreSQL. Never use floating-point for money.
6. **Deterministic date handling** — always use `date-fns-tz` with `Asia/Kolkata` for any date/time display or default. Store timestamps as `TIMESTAMPTZ` in UTC.
7. **Migrations are append-only** — never modify an existing migration file. Always add a new numbered file.
8. **RLS must be enabled** on every Supabase table before Phase 01 ships.
9. **Outbox pattern** — every transaction write must also insert a row into `outbox_events` for eventual Google Sheets sync. The outbox is the authoritative change log.
10. **Preserve all existing comments and docstrings** unless a comment is factually wrong.

## Environment variables (names only — no values)

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=       # server only

# Google Sheets (Keyless Workload Identity Federation via Vercel OIDC - Production)
GCP_PROJECT_ID=                  # server only
GCP_PROJECT_NUMBER=              # server only
GCP_SERVICE_ACCOUNT_EMAIL=       # server only
GCP_WORKLOAD_IDENTITY_POOL_ID=   # server only
GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID= # server only
GCP_AUDIENCE_MODE=               # server only (optional: 'allowed' | 'default')
GCP_AUDIENCE=                    # server only (optional override)

# Google Sheets (Fallback for Local Development Only)
GOOGLE_SERVICE_ACCOUNT_EMAIL=    # server only (optional fallback)
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY= # server only (optional fallback)
GOOGLE_SHEETS_SPREADSHEET_ID=    # server only

# App
NEXT_PUBLIC_APP_URL=
```

## Security boundaries

```
Browser (client)
  └── supabase-js anon key  → Supabase Auth + RLS-gated queries only

Next.js Server (Route Handlers / Server Actions)
  └── supabase-js service-role key  → admin writes, migrations
  └── Vercel OIDC + Google STS      → keyless service account impersonation → Sheets API

Supabase
  └── RLS policies enforce user isolation
  └── pg_cron / Edge Functions → scheduled reconciliation (Phase 02+)
```

## Phase summary (quick reference)

| Phase | Name | Key deliverable |
|---|---|---|
| 00 | Audit & Architecture | This file + docs/ |
| 01 | Foundation | Next.js scaffold, auth, DB schema, transaction CRUD, PWA manifest |
| 02 | Sheets Sync & Export | Outbox worker, Sheets API, CSV/JSON export |
| 03 | Offline & PWA | Service worker, IndexedDB, sync reconciliation |
| 04 | Budget & Insights | BudgetManager, SpendingInsights |
| 05 | Goals & Recurring | FinancialGoals, RecurringTransactions, SubscriptionTracker |
| 06 | AI & Health | FinancialHealth, AIAdvisor |

---
*Last updated: Phase 00 — 2026-10-25*
