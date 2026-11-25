# SpendSense — Product Roadmap

> Version 0.1 — Phase 00 Baseline  
> Last updated: 2026-10-25

---

## Vision

SpendSense is a private, offline-capable, single-user personal finance tracker built for disciplined manual entry. The app grows incrementally from a simple transaction log into a comprehensive personal finance command centre, while never sacrificing data integrity, privacy, or simplicity.

---

## Roadmap overview

```
2026 Q4          2027 Q1          2027 Q2          2027 Q3+
────────────────────────────────────────────────────────────
Phase 00 ✅   Phase 01        Phase 02        Phase 03
Audit &       Foundation      Sheets Sync     Offline &
Architecture  (CRUD + Auth)   & Export        Full PWA
                │                │                │
                ▼                ▼                ▼
            Phase 04         Phase 05         Phase 06
            Budget &         Goals &          AI &
            Insights         Recurring        Health
```

---

## Phase 00 — Audit & Architecture ✅ COMPLETE

**Duration**: 1 session  
**Status**: Complete

### Deliverables
- Workspace audit (confirmed empty)
- `ANTIGRAVITY.md` — persistent agent decision file
- `docs/SPENDSENSE_ARCHITECTURE.md`
- `docs/SPENDSENSE_BUILD_PLAN.md`
- `docs/SPENDSENSE_ROADMAP.md` (this file)

### Key decisions
- Next.js 15 App Router, TypeScript strict, shadcn/ui, Tailwind CSS v4
- Supabase PostgreSQL as authoritative DB, Google Sheets as secondary copy
- UUID v7 for transaction IDs, paise-as-integer for amounts
- Outbox pattern for Sheets sync, Dexie.js for Phase 03 offline

---

## Phase 01 — Foundation

**Target**: Working deployed app with auth, transaction CRUD, and basic dashboard  
**Modules activated**: `TransactionEntry`, `CategoryManager`, `Dashboard`

### Milestones

| # | Milestone | Description |
|---|---|---|
| 1.1 | Scaffold | Next.js project with all deps, ESLint, TypeScript strict |
| 1.2 | DB Schema | All migrations applied, RLS enabled, seed categories loaded |
| 1.3 | Auth | Google OAuth + magic link login working in production |
| 1.4 | Transaction Entry | Full form: type, amount, date (IST default), category, payment method, necessity, note |
| 1.5 | Category Manager | Add, edit, reorder, archive categories |
| 1.6 | Dashboard | Month summary + paginated + filtered transaction list |
| 1.7 | PWA Manifest | Installable shell (no offline yet) |
| 1.8 | Deployment | Vercel production, all env vars configured |

### What is explicitly excluded from Phase 01
- Google Sheets synchronization
- Offline / IndexedDB
- CSV/JSON export
- Any "advanced" modules (Budget, Goals, etc.)
- Bulk import or historical data migration
- Multi-currency support
- Multi-user or sharing

---

## Phase 02 — Sheets Sync & Export

**Target**: Transactions replicated to Google Sheets within 10 minutes; CSV and JSON export available  
**Modules activated**: `GoogleSheetsSync`, `ImportExport`

### Milestones

| # | Milestone | Description |
|---|---|---|
| 2.1 | Sheets API Client | Authenticated server client with service account |
| 2.2 | Outbox Drain | Cron-triggered Route Handler processes pending outbox events |
| 2.3 | Full Reconciliation | Weekly cron re-writes all rows; Sheets drift corrected |
| 2.4 | CSV Export | Streaming download; human-readable INR amounts |
| 2.5 | JSON Export | Full structured export for backup/recovery |
| 2.6 | Manual Sync | Settings button triggers on-demand sync |

---

## Phase 03 — Offline & Full PWA

**Target**: App works fully offline; transactions entered offline sync on reconnect  
**Modules activated**: PWA (Service Worker + Dexie.js)

### Milestones

| # | Milestone | Description |
|---|---|---|
| 3.1 | Service Worker | Workbox shell caching, offline fallback page |
| 3.2 | Dexie.js Schema | Local IndexedDB mirrors server schema |
| 3.3 | Offline Entry | Transaction form writes to IndexedDB when offline |
| 3.4 | Sync on Reconnect | Local outbox flushed; UUID v7 deduplication |
| 3.5 | Conflict Resolution | server `updated_at` wins; merge UI for edge cases |
| 3.6 | Offline Indicator | UI banner; form works seamlessly |

---

## Phase 04 — Budget & Spending Insights

**Target**: Owner can set budgets and see visual spending analysis  
**Modules activated**: `BudgetManager`, `SpendingInsights`

### Milestones

| # | Milestone | Description |
|---|---|---|
| 4.1 | Budget Schema | New DB tables: `budgets` (category, period, amount_paise) |
| 4.2 | Budget CRUD | Create, edit, delete monthly/weekly budgets per category |
| 4.3 | Budget Progress | Bar/donut chart: actual vs budget, colour-coded |
| 4.4 | Overspend Alert | In-app alert at 80% and 100% of budget |
| 4.5 | Monthly Trend | Line chart: income vs expense over last 12 months |
| 4.6 | Category Breakdown | Donut chart: expense split by category |
| 4.7 | Necessity Ratio | Bar chart: Essential vs Optional vs Luxury split |
| 4.8 | Payment Split | Online vs Cash ratio |

---

## Phase 05 — Goals, Recurring Transactions & Subscriptions

**Target**: Owner can define saving goals and automate recurring entries  
**Modules activated**: `FinancialGoals`, `RecurringTransactions`, `SubscriptionTracker`

### Milestones

| # | Milestone | Description |
|---|---|---|
| 5.1 | Goals Schema | `goals` table: name, target_amount_paise, deadline, linked_category |
| 5.2 | Goal CRUD | Create, edit, delete goals |
| 5.3 | Goal Progress | Progress bar: saved vs target; required monthly contribution |
| 5.4 | Recurring Schema | `recurring_templates` table: frequency, amount, category, start_date |
| 5.5 | Recurring CRUD | Create, pause, delete templates |
| 5.6 | Recurring Job | Server cron generates transactions from active templates |
| 5.7 | Subscription Entry | Specialised recurring form: renewal date, billing cycle |
| 5.8 | Subscription Alerts | In-app alert 3 days before renewal |

---

## Phase 06 — Financial Health & AI Advisor

**Target**: Owner sees a holistic financial health score and can query AI for insights  
**Modules activated**: `FinancialHealth`, `AIAdvisor`

### Milestones

| # | Milestone | Description |
|---|---|---|
| 6.1 | Health Formula | Composite score: savings rate, expense ratio, necessity split, budget adherence |
| 6.2 | Health Dashboard | Score gauge, sub-score breakdown, trend |
| 6.3 | AI Data Prep | Aggregate-only query layer; no raw transactions sent to AI |
| 6.4 | AI Prompt | Server-side prompt construction with context |
| 6.5 | AI Response UI | Chat-style advisory panel; advisory labels on all AI output |

---

## Permanent constraints (all phases)

| Constraint | Rationale |
|---|---|
| Single user only | Personal use; no multi-tenancy complexity |
| INR only (until Phase 04+) | Simplicity; forex adds significant complexity |
| Manual entry only | Privacy; no bank API credentials |
| No bulk historical import in v1 | Prevents data quality issues |
| Server-side secrets | Security; no credentials in client bundle |
| Append-only migrations | Audit trail; safe production operations |

---

## Module registry (full)

| Module | Phase | Status |
|---|---|---|
| `TransactionEntry` | 01 | Planned |
| `CategoryManager` | 01 | Planned |
| `Dashboard` | 01 | Planned |
| `ImportExport` | 02 | Planned |
| `GoogleSheetsSync` | 02 | Planned |
| `BudgetManager` | 04 | Planned |
| `SpendingInsights` | 04 | Planned |
| `FinancialGoals` | 05 | Planned |
| `RecurringTransactions` | 05 | Planned |
| `SubscriptionTracker` | 05 | Planned |
| `FinancialHealth` | 06 | Planned |
| `AIAdvisor` | 06 | Planned |

---

*End of SPENDSENSE_ROADMAP.md*
