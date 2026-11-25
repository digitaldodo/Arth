# SpendSense — Personal Finance Intelligence Platform

**SpendSense** is an Indian personal finance tracking, structured statement import, tax planning, and financial decision-support platform designed around exact integer-paise (`BIGINT`) accounting, `Asia/Kolkata` (`IST`) calendar semantics, and Row-Level Security (`RLS`) isolation.

> **Compatibility note:** The platform originated internally as *Arth*. To keep existing deployments, client offline stores, Android upgrades, and workspaces intact, internal technical identifiers—including the repository name (`digitaldodo/Arth`), npm workspace scopes (`@arth/*`), IndexedDB store (`arth_offline_db`), Android package ID (`com.digitaldodo.arth`), custom URI scheme (`arth://auth/callback`), and private storage bucket (`arth-private-documents`)—are preserved unchanged.

---

## What SpendSense Does & Problem It Solves

Managing personal finances in India often requires stitching together disconnected bank exports, spreadsheets, UPI SMS alerts, loan EMI estimators, and annual tax spreadsheets. Mistakes in floating-point rounding, inconsistent statement formats, or double-counted commitments easily distort day-to-day spending capacity.

SpendSense consolidates financial tracking and decision support into a single auditable ledger built with:

- **Exact integer-paise (`BIGINT`) arithmetic** across PostgreSQL, Fastify, and TypeScript (`1 INR = 100 paise`).
- **Time-ordered UUID v7 idempotency** for reliable retries and offline sync.
- **Strict user isolation** via Supabase Auth JWT verification and PostgreSQL Row-Level Security (`auth.uid() = user_id`).
- **Structured document workflows** rather than brittle screen scraping or live bank credential sharing.

---

## Features & Implementation Status

SpendSense combines a production ledger core with modular financial decision-support engines that are actively being integrated.

### Implemented Core Features

- **Transaction Ledger & Necessity Classification**: Income and expense tracking with custom categories, drag-and-drop category reordering, reversible soft deletes (`deleted_at`), idempotent mutations, and three-tier necessity tagging (`essential`, `optional`, `luxury`).
- **Dashboard & Balance Snapshots**: Period-filtered and lifetime cash-flow summaries across online and cash accounts, anchored to configurable starting-balance snapshots (`balances_configured_at`).
- **People & Money Tracker**: Counterparty obligation ledger and atomic settlement tracking backed by PostgreSQL row locks (`fn_record_person_settlement`).
- **Structured Statement Import & Reconciliation**: Client-side parsing for Indian bank and UPI statements across PDF (`pdfjs-dist`), Excel/CSV (`xlsx`), and OCR fallback (`tesseract.js`), with password-protected PDF support, duplicate checks, and deterministic rule/merchant categorization (`personalized-categories`, migration `0028`).
- **Offline-First PWA & App Lock**: Local IndexedDB (`arth_offline_db`) storage with outbox synchronization, service-worker static shell caching, and optional device biometric lock (WebAuthn on installed mobile PWAs; `BiometricGateActivity` on Android).
- **Native Android Companion**: Kotlin + Jetpack Compose + Room application (`android/`) plus signed direct-download release packaging (`SpendSense Installer` helper in `android/installer/`).

### Scaffolded & In-Progress Decision-Support Modules

- **Safe-to-Spend & Spending Forecast** ([`packages/financial-modules/src/modules/safe-to-spend/`](./packages/financial-modules/src/modules/safe-to-spend/), [`spending-forecast/`](./packages/financial-modules/src/modules/spending-forecast/)): Domain calculations exist; the interactive shell view (`safe-to-spend`) currently shows a coming-soon placeholder pending end-to-end integration.
- **EMI Affordability & Stress Testing** ([`packages/financial-modules/src/modules/emi-affordability/`](./packages/financial-modules/src/modules/emi-affordability/)): Fixed-point amortization and stress scenarios exist as pure modules; the `emi-planner` shell view currently renders a placeholder.
- **Goal Planning & Purchase Simulation** ([`packages/financial-modules/src/modules/goal-planner/`](./packages/financial-modules/src/modules/goal-planner/), [`purchase-simulator/`](./packages/financial-modules/src/modules/purchase-simulator/)): Domain module scaffolds exist; `goal-planner` view renders a placeholder pending persistence and API wiring.
- **Tax Planning & Document Verification** ([`backend/src/modules/tax/`](./backend/src/modules/tax/)): Ruleset-versioned deterministic Old vs. New Regime engine (`AY2024-25` through `TY2026-27`, documented in [`docs/SPENDSENSE_TAX_RULES_SOURCES.md`](./docs/SPENDSENSE_TAX_RULES_SOURCES.md)) is implemented in backend modules; `specialRateIncomeRupees > 0n` is currently unimplemented/rejected, `taxRoutes` is not yet registered in `backend/src/app.ts`, and Form 16/AIS/26AS verification UI is under active development.
- **ML Transaction Categorization** ([`ml/transaction-categorization/`](./ml/transaction-categorization/)): Offline FastText training and evaluation tooling exist; runtime FastText model artifacts are disabled/unbundled and live inference uses deterministic rules.
- **FIRE Planner, Behavioral Insights & Account Aggregator** ([`packages/financial-modules/`](./packages/financial-modules/)): Module scaffolds present; corresponding shell tabs (`fire-planning`, `insights`) display coming-soon placeholders.

### Retired / Out-of-Scope Capabilities

- **Google Sheets Synchronization**: Retired (`drainUserOutbox` in [`frontend/src/lib/server/sheets-worker.ts`](./frontend/src/lib/server/sheets-worker.ts) is a no-op).
- **Live Bank Credential Scraping**: Explicitly outside the scope of the platform.

---

## Architecture & Technology Stack

SpendSense follows a strict modular monorepo layout managed with `pnpm` workspaces (`pnpm@10.24.0`) and contract-driven API boundaries:

```text
Browser / Mobile PWA / Android App
        │  HTTPS + Bearer JWT / SSR Cookies
        ▼
Next.js 16 Frontend & BFF Proxy (frontend/ — @arth/frontend)
        │  Server-side BFF forwarding (zero direct financial DB writes from browser)
        ▼
Fastify 5 API & Domain Services (backend/ — @arth/backend)
        │  User-scoped JWT PostgREST + PostgreSQL RPCs (RLS enforced)
        ▼
Supabase PostgreSQL + Auth + Storage (supabase/)
```

| Layer | Technology |
|---|---|
| **Frontend / PWA** | Next.js `16.4.6` (App Router), React `19.3.0`, TypeScript, Tailwind CSS v4, `@supabase/ssr`, `@simplewebauthn/browser` |
| **Document Parsing & Export** | `pdfjs-dist`, `xlsx`, `tesseract.js`, `jspdf` |
| **Backend API** | Fastify `^5.2.1`, Node.js (`>=20.0.0`), TypeScript, `jose` (HS256 / JWKS JWT verification), `@supabase/supabase-js` |
| **Shared Packages** | `@arth/contracts` (API DTOs & enums), `packages/financial-modules/` (domain engines) |
| **Database & Storage** | Supabase PostgreSQL with append-only migrations (`supabase/migrations/`), RLS policies, private bucket storage |
| **Native Android** | Kotlin, Jetpack Compose, Room (`android/`), plus signed helper installer (`android/installer/`) |
| **ML Tooling** | Python evaluation & FastText training pipelines (`ml/transaction-categorization/`) |
| **Hosting Targets** | Vercel (`vercel.json` for frontend) and Render (`render.yaml` for backend) |

---

## Repository Structure

```text
.
├── frontend/                   # Next.js 16 web app, PWA manifest, BFF routes & UI features
├── backend/                    # Fastify REST API service, auth plugin & domain services
├── packages/
│   ├── contracts/              # Shared TypeScript API contracts & request/response DTOs
│   └── financial-modules/      # Modular financial calculators (EMI, Safe-to-Spend, Goals, Tax, etc.)
├── supabase/
│   ├── migrations/             # Append-only PostgreSQL schema & RLS migrations
│   └── templates/              # Branded SpendSense Supabase authentication email templates
├── ml/
│   └── transaction-categorization/  # Offline categorization dataset & FastText training scripts
├── android/                    # Native Kotlin + Jetpack Compose Android app & Installer helper
├── docs/                       # Architecture, design system, tax sources & operational guides
├── scripts/                    # Validation & brand-asset generation utilities
├── package.json                # Root pnpm workspace scripts
├── pnpm-workspace.yaml         # Workspace package definitions
├── render.yaml                 # Render backend deployment blueprint
└── vercel.json                 # Vercel frontend build configuration
```

---

## Installation & Local Development

### Prerequisites

- **Node.js** `>= 20.0.0`
- **pnpm** `10.24.0` (`corepack enable` recommended)
- **Supabase** project (or local Supabase CLI) with migrations from `supabase/migrations/` applied
- Optional: Android Studio / JDK for `android/`, Python 3 for `ml/` and brand validation scripts

### Setup

1. Clone the repository and install workspace dependencies:

```bash
git clone https://github.com/digitaldodo/Arth.git
cd Arth
pnpm install
```

2. Copy `.env.example` to `.env.local` (or configure service-specific environment files in `frontend/` and `backend/`) using placeholder values replaced by your own project credentials. Never commit `.env*` files with real secrets.

3. Build shared workspace contracts and start the development servers:

```bash
pnpm build:contracts
pnpm dev
```

Or run services individually:

```bash
pnpm dev:backend    # Starts Fastify backend
pnpm dev:frontend   # Starts Next.js frontend
```

Production builds:

```bash
pnpm build          # Builds contracts -> backend -> frontend
```

---

## Environment Variable Configuration

Refer to [`.env.example`](./.env.example) for full descriptions. Configure non-secret placeholders locally and set real secrets only in deployment dashboards (Vercel / Render):

### Frontend (`frontend/` — `@arth/frontend`)

- `NEXT_PUBLIC_APP_URL` — Canonical app URL (e.g. `http://localhost:3000`)
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL (`https://<project-ref>.supabase.co`)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase public anon key
- `INTERNAL_API_URL` — Server-side Fastify base URL (defaults to `http://localhost:3001` locally)
- `NEXT_PUBLIC_API_URL` — Optional public API fallback URL
- `SUPABASE_SERVICE_ROLE_KEY` — *(Server-only)* Supabase service-role secret; never prefix with `NEXT_PUBLIC_`

### Backend (`backend/` — `@arth/backend`)

- `PORT` — HTTP listener port (e.g. `3001`)
- `HOST` — Bind address (e.g. `0.0.0.0`)
- `NODE_ENV` — `development`, `test`, or `production`
- `CORS_ORIGIN` — Allowed frontend origin(s)
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_ANON_KEY` — Supabase anon key for user-scoped PostgREST clients
- `SUPABASE_JWT_SECRET` — *(Recommended)* JWT secret for local HS256 verification (falls back to Supabase JWKS when omitted)
- `JWT_AUDIENCE` — Expected JWT audience claim (defaults to `authenticated`)

---

## Testing & Quality Checks

Run workspace checks from the repository root:

```bash
pnpm typecheck      # Type-check all pnpm workspaces
pnpm lint           # Lint frontend workspace
pnpm test:backend   # Run backend unit & route test suite
pnpm test:frontend  # Run frontend Vitest test suite
```

Additional module checks:

- Financial modules: `pnpm --filter @arth/financial-modules test` (or `node --test` inside `packages/financial-modules/`)
- Categorization ML evaluation: run Python unit tests under `ml/transaction-categorization/`

---

## Project Status & Roadmap

SpendSense has a verified, offline-capable transaction ledger, structured statement ingestion, People & Money tracking, native Android packaging, and published tax rule documentation (`docs/SPENDSENSE_TAX_RULES_SOURCES.md`). Active development focuses on wiring the scaffolded Safe-to-Spend, EMI Affordability, Goal Planner/Purchase Simulation, and Tax Document Verification modules into full end-to-end backend routes and frontend flows.

---

## Documentation Index

### Architecture, Design & Product Specs
- [SpendSense Architecture](./docs/SPENDSENSE_ARCHITECTURE.md)
- [SpendSense Build Plan](./docs/SPENDSENSE_BUILD_PLAN.md)
- [SpendSense Roadmap](./docs/SPENDSENSE_ROADMAP.md)
- [ADR-001: Modular Monorepo Architecture](./docs/decisions/ADR-001-modular-monorepo.md)
- [Design System: Ledger Minimal](./docs/SPENDSENSE_DESIGN_SYSTEM.md)
- [UX Architecture & User Flows](./docs/SPENDSENSE_UX_BLUEPRINT.md)
- [Visual Direction Exploration](./docs/SPENDSENSE_VISUAL_DIRECTION.md)
- [Interactive Prototype Review](./docs/SPENDSENSE_PROTOTYPE_REVIEW.md)
- [Brand Identity & Asset Inventory](./docs/SPENDSENSE_BRAND_IDENTITY.md)

### Financial Engines, Statements & Security
- [Indian Tax Rules & Statutory Sources](./docs/SPENDSENSE_TAX_RULES_SOURCES.md)
- [Bank Statement Format Compatibility](./docs/BANK_STATEMENT_FORMAT_COMPATIBILITY.md)
- [Bank Statement Import Implementation](./docs/BANK_STATEMENT_IMPORT_IMPLEMENTATION.md)
- [Categorization & Provenance Docs](./docs/SPENDSENSE_TRANSACTION_INTELLIGENCE_ARCHITECTURE.md)
- [Document & Financial-Data Threat Model](./docs/SPENDSENSE_SECURITY_THREAT_MODEL.md)
- [App Lock Security & Platform Limits](./docs/APP_LOCK_SECURITY.md)

### Operations, Auth & Android
- [Database Operations & ACID Architecture](./docs/DATABASE_OPERATIONS.md)
- [Manual Deployment & Verification Guide](./MANUAL_DEPLOYMENT.md)
- [Email Template Configuration](./docs/SPENDSENSE_EMAIL_TEMPLATE_CONFIGURATION.md)
- [Google OAuth Setup](./docs/GOOGLE_OAUTH_SETUP.md)
- [Email Confirmation Setup](./docs/EMAIL_CONFIRMATION_SETUP.md)
- [Android Setup](./ANDROID_SETUP.md) & [Direct APK Distribution](./docs/ANDROID_DIRECT_DISTRIBUTION.md)
- [Android Privacy & Play Policy](./ANDROID_PRIVACY_AND_PLAY_POLICY.md) & [Android Testing Guide](./ANDROID_TESTING.md)
