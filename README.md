# Arth (अर्थ) — Personal Finance Tracker

Arth is a fast, local-first personal finance tracker engineered for high-velocity transaction capture (< 5 seconds), dual-write synchronization to Google Sheets, and financial clarity inspired by Swiss editorial ledger design (**Concept 1: Ledger Minimal**).

## Architectural Principles

- **Amounts in Integer Paise**: Financial values are stored as integers representing paise (1 INR = 100 paise) as `BIGINT` in PostgreSQL to prevent floating-point rounding errors.
- **Deterministic Timezones**: Stored as UTC `TIMESTAMPTZ` in Supabase; formatted in `Asia/Kolkata` (IST) for user interfaces.
- **Ledger Minimal Design System**: High-contrast, typography-driven financial clarity featuring warm archival paper in light mode (`#FBFBF9`) and restrained obsidian in dark mode (`#0C0A09`).
- **Outbox Pattern**: Transaction mutations write to an authoritative `outbox_events` table before background asynchronous synchronization to Google Sheets.
- **Strict Row Level Security (RLS)**: Direct database queries are enforced per authenticated user; administrative operations are isolated to server routes.

## Prerequisites

- **Node.js**: v22.17.1+ (LTS)
- **pnpm**: v10.24.0+
- **Git**

## Getting Started

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Configure Environment Variables

Copy the example environment template:

```bash
cp .env.example .env.local
```

Populate `.env.local` with your local Supabase credentials and application URL. Note: real secrets should never be committed to git.

### 3. Run Development Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Available Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Starts the Next.js development server with hot reloading |
| `pnpm build` | Compiles the production-optimized Next.js build |
| `pnpm start` | Runs the compiled production server |
| `pnpm lint` | Runs ESLint across the codebase |
| `pnpm typecheck` | Validates TypeScript types with `tsc --noEmit` |

## Project Structure

```text
├── docs/                        # Architecture, UX blueprints, design specifications
│   ├── ARTH_ARCHITECTURE.md     # Technical and database specifications
│   ├── ARTH_BUILD_PLAN.md       # Phased implementation plan
│   ├── ARTH_DESIGN_SYSTEM.md    # Ledger Minimal tokens and component rules
│   ├── ARTH_UX_BLUEPRINT.md     # User journeys and screen specifications
│   └── design-concepts/         # Interactive screen prototypes
├── public/                      # Static assets and icons
├── src/
│   ├── app/                     # Next.js App Router (layout, pages, globals.css)
│   ├── components/              # Shared UI components and primitives
│   ├── features/                # Feature-sliced module boundaries
│   └── lib/                     # Currency/date formatters, utility functions
├── .env.example                 # Non-secret environment variable definitions
├── AGENTS.md                    # Agent entrypoint pointer
├── ANTIGRAVITY.md               # Canonical project instructions and rules
├── package.json                 # Dependency manifests and scripts
└── tsconfig.json                # TypeScript strict configuration
```

## Phase Status

- **Phase 00**: Architecture & Auditing (Completed)
- **Phase 01A–01D**: Visual Direction & Prototype Sign-off (Ledger Minimal approved)
- **Phase 01E**: Project Scaffold & Tooling Setup (Completed)
- **Phase 01F**: Supabase Project Setup & Migrations (Next)
