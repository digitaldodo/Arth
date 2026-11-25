# SpendSense — Engineering Team Workspace (Group 369)

**Project:** SpendSense: Personal Finance Decision Support and EMI Affordability  
**Supervisor:** Mr. Amit Kumar, Assistant Professor  
**Repository:** `https://github.com/digitaldodo/Arth.git` (default branch: `main`)

---

## Team & Module Allocation

| Module | Assigned Developer | Roll Number | Scope Summary |
|---|---|---|---|
| **A** | **Ansh Gupta** | `2315000330` | Transaction Intelligence, Ingestion Hardening, Reconciliation & ML Categorization *(+ Shared Integration Lead)* |
| **B** | **Arun Kushwah** | `2315000441` | Safe-to-Spend & Cash-Flow Decision Engine |
| **C** | **Akshat Kumar** | `2315000205` | EMI Affordability & Stress Testing |
| **D** | **Ayush Chaudhary** | `2315000536` | Goal Planning & Goal-Linked Purchase Simulation |
| **E** | **Dev Chaudhary** | `2315000708` | Integrated Tax Planning, Capital Gains & Document Verification |

---

## Navigation

- [ownership.yml](./ownership.yml) — Exact directory, file, database table, and migration slot ownership rules
- [integration-contracts.md](./integration-contracts.md) — Cross-module DTOs, provider interfaces, error contracts, and data ownership
- [development-workflow.md](./development-workflow.md) — Branching strategy, contract-first process, migration sequencing, and CI gates
- Module specifications:
  - [Module A — Transaction Intelligence](./modules/A-transaction-intelligence/README.md)
  - [Module B — Safe-to-Spend](./modules/B-safe-to-spend/README.md)
  - [Module C — EMI Affordability](./modules/C-emi-affordability/README.md)
  - [Module D — Goal Planning](./modules/D-goal-planning/README.md)
  - [Module E — Tax Planning](./modules/E-tax-planning/README.md)

---

## Core Rules for All Contributors

1. **Edit only your owned module directories.** Never modify another member's feature directory, backend module, or package scaffold.
2. **Never edit frozen/shared files directly.** Shared files (`backend/src/app.ts`, `packages/contracts/src/`, `packages/financial-modules/src/shared/`, `TransactionAppShell.tsx`) require an integration-lead PR review.
3. **Preserve compatibility-sensitive legacy identifiers** (`@arth/*`, `arth_offline_db`, `com.digitaldodo.arth`, `arth-private-documents`). See [docs/BRANDING_MIGRATION.md](../docs/BRANDING_MIGRATION.md).
4. **All monetary values use integer paise (`BIGINT` / `BigInt`)** and dates use `Asia/Kolkata` (`IST`).
5. **Migrations are strictly append-only** using reserved slots `0040`–`0043`. Never edit `0001`–`0039` or reset Supabase.
