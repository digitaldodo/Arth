# Arth product-quality benchmarks

## Benchmark status

**Current status: baseline is not yet established.** The current generic statement parser has unit tests for basic CSV, amount/date parsing, duplicate flags, balance mismatch warning and ambiguous classifications. Those tests validate code paths, not bank-specific compatibility or real-world accuracy. Do not describe bank compatibility or tax calculations as production-verified until fixture results are recorded here.

## Measurement protocol

For each anonymized or licensed fixture, record source institution/account type, file format, parser/ruleset version, expected transaction count, expected dates, debit/credit values in paise, reference numbers, running balances, and known limitations. Keep sensitive raw statements out of Git. Synthetic fixtures must be labeled synthetic and cannot be reported as real-world success.

Report at least:

- Row extraction precision and recall.
- Exact date and paise amount accuracy.
- Debit/credit direction accuracy.
- Reference and running-balance accuracy.
- Duplicate match precision/recall, with repeated equal purchases treated as separate events.
- Transfer/card/refund match precision and false-positive rate.
- Batch undo and partial recovery results.
- Password handling, wrong password, malformed file and scanned/no-text behavior.
- Document field extraction/provenance and conflict resolution outcomes.
- Tax fixture totals and line-item agreement against official examples for every ruleset.
- RLS, unauthorized access, deletion and sensitive-data leakage tests.

## Baseline currently measured (working tree, 2026-11-19)

- **Full frontend suite:** 599 passing tests (0 failures); includes 14 comprehensive bank-fixture tests (`statement-bank-fixtures.test.ts`) across 10 privacy-safe representative bank/card statement fixtures (`frontend/tests/fixtures/statement-fixtures.ts`) verifying headers, exact paise parsing, running balance math, credit card spend liability direction, and duplicate resilience. Document extraction covers 10 form adapters (`document-form-adapters.test.ts` and `document-extractor.test.ts`) with PAN/TAN identifier masking, page provenance, and cross-check warnings.
- **Full backend suite:** 210 passing tests (0 failures); includes 6 dedicated Income Tax Department official benchmark tests (`official-tax-calculator.test.ts`) covering AY 2024–25 (7L threshold), AY 2025–26 (enhanced ₹75k standard deduction), AY 2026–27 & TY 2026–27 (12L rebate and marginal relief up to ₹12.75L), Old Regime age tiers (General, Senior, Super Senior), and surcharge marginal relief.
- **TypeScript checks:** `pnpm typecheck` passes cleanly across all workspaces (`@arth/contracts`, `@arth/backend`, `@arth/frontend`).
- **Linter:** `pnpm lint` passes with 0 errors and 0 warnings.
- **Production build:** `pnpm build` compiles Next.js with Turbopack, Fastify backend, and generates PWA service workers without issues.
- **Bank compatibility matrix:** 11 registered adapters (SBI, HDFC, ICICI, Axis, Kotak, PNB, Bank of Baroda, Canara, IDFC FIRST, Credit Card Generic, and Generic Bank) exposed via `getStatementCompatibilityMatrix()` in the statement import UI.
- **Form adapter coverage:** 10 form adapters (Form 16, Form 16A, AIS/26AS, Payslip, 80C investments, Health Insurance 80D, Home Loan 24(b) & 80C, Education Loan 80E, NPS 80CCD, Donations 80G).
- **Migration & RLS assertions:** Static SQL schema checks and database function RPC contracts verified via `database-schema-audit.test.ts`. Migrations have not been applied to a live remote Supabase instance, and live RLS enforcement on storage buckets remains an external dependency requiring an active Supabase server.
- **Scanned-PDF OCR:** Browser-side local OCR uses bundled Tesseract English/Hindi LSTM models with a 25-page safety limit, displaying progress and leaving rows unselected for mandatory user review.
- **Tax engine rulesets:** Sourced directly from official Ministry of Finance / Income Tax Department enactments (Finance Acts 2023, 2024, 2025 and Income-tax Act, 2025), documented in `docs/ARTH_TAX_RULES_SOURCES.md`.

Update this page only with measured test runs and the exact fixture/ruleset commit.
