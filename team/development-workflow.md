# SpendSense — Five-Person Development Workflow

**Repository:** `https://github.com/digitaldodo/Arth.git`  
**Default Branch:** `main`  
**Integration Lead:** Ansh Gupta (`2315000330`)

---

## 1. Branching Policy

- **`main` is protected and owner-controlled:** Never commit or push directly to `main` unless the repository owner explicitly authorizes it for a specific task. Never overwrite, reset, force-push, or rewrite `main`.
- **Dedicated team member branches:**
  - **Ansh Gupta:** `ansh`
  - **Ayush Chaudhary:** `ayush`
  - **Arun Kushwah:** `arun`
  - **Akshat Kumar:** `akshat`
  - **Dev Chaudhary:** `dev`
- **Strict isolation & PR workflow:**
  1. Verify the active branch and `git status` before making changes or running Git operations.
  2. Never make another team member's changes on their branch, commit another person's work under your own branch, or merge one member's branch into another without approval.
  3. Update your dedicated branch from the latest `main` when appropriate and submit completed work via a Pull Request targeting `main` for owner review and merge authorization.
- **Why dedicated branches + PRs over direct `main` commits**: `main` currently exposes 5 test failures and 5 lint errors from recent unreviewed rapid commits. Branch isolation + PR checks keep work-in-progress separated, prevent accidental edits to shared files (`app.ts`, `TransactionAppShell.tsx`), and keep `main` deployable on Vercel & Render.

---

## 2. Four-Stage Execution Sequence

### Stage 0 — Stabilization & Contract Lock (Days 1–2)
1. **Module A (Ansh)**: Fix the 5 failing frontend tests (`statement-import-parser.test.ts`, `statement-ocr.test.ts`) and 5 ESLint errors (`upi-parser.ts`, `StatementImport.tsx`).
2. **Module A + E + Integration Lead**: Split `backend/src/modules/tax/tax.routes.ts` so `/api/v1/financial/{accounts,import-batches,transaction-links}` move to `backend/src/modules/financial-imports/`, duplicate `/api/v1/financial/documents*` handlers are removed, and `tax.routes.ts` retains only `/api/v1/tax/*`.
3. **All 5 Members**: Review and approve [integration-contracts.md](./integration-contracts.md) before freezing shared DTOs in `packages/contracts/` and `packages/financial-modules/src/shared/`.

### Stage 1 — Parallel Isolated Development (Days 3–8)
- Each developer builds inside **only** their owned paths in [ownership.yml](./ownership.yml).
- **BFF Isolation Rule**: Create module-specific Next.js routes (e.g., `frontend/src/app/api/backend/planning/emi-affordability/route.ts`) rather than editing `frontend/src/app/api/backend/[...segments]/route.ts`.
- **Mocked Provider Testing**: Modules B, C, and D develop against the agreed TypeScript provider interfaces using deterministic mock fixtures so no developer blocks another.

### Stage 2 — Sequential Integration Checkpoints (Days 9–11)
1. **Checkpoint 1**: Merge **Module A** and **Module E** (independent of B, C, D).
2. **Checkpoint 2**: Merge **Module C** (exposes EMI provider) and **Module B** (consumes C's obligations & A's transactions).
3. **Checkpoint 3**: Merge **Module D** (consumes B's Safe-to-Spend & C's EMI simulator), flip reviewed flags in `packages/financial-modules/src/shared/feature-flags.ts`, and wire views into `TransactionAppShell.tsx` via a single PR reviewed by the Integration Lead.

---

## 3. Database Migration Coordination

- Existing migrations `0001`–`0039` are **immutable**.
- Reserved append-only slots:
  - `0040`: Ansh Gupta (only if needed for `merchant_rules` / ML provenance)
  - `0041`: Arun Kushwah (`cash_flow_commitments`)
  - `0042`: Akshat Kumar (`loan_obligations`)
  - `0043`: Ayush Chaudhary (`financial_goals`, `goal_contributions`)
  - Dev Chaudhary: inspects `0028` (`financial_documents`, `tax_extracted_fields`, `tax_profiles`) first; requests `0044+` from Integration Lead only if needed.
- Every new table **must** enable RLS (`auth.uid() = user_id`), use `BIGINT` paise for money, and include an automated RLS/schema test.

---

## 4. Mandatory PR Verification Gate

Every PR targeting `main` must pass locally before review:

```bash
pnpm typecheck
pnpm lint
pnpm test:backend
pnpm test:frontend
npx tsx --test packages/financial-modules/src/modules/*/tests/*.test.ts
python -m unittest discover -s ml/transaction-categorization -p "test_*.py" -v
```
