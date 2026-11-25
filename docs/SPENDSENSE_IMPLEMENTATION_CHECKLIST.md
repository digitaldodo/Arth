# SpendSense document, statement and tax implementation checklist

Working checklist for the continuation of the Smart Statement Import and Document-Assisted Tax Planning request. Source of truth is the user-provided implementation brief; this checklist does not imply a feature is shipped.

## Existing work to preserve

- [x] Browser-side PDF, encrypted PDF, CSV, XLSX and XLS statement reading.
- [x] Review/edit rows, paise parsing, UUID v7 and existing local-first transaction queue.
- [x] Local import batch history plus server batch metadata and guarded soft-delete undo path.
- [x] Masked account registry and transaction-level batch/account/reference provenance.
- [x] Current parser and UI have frontend tests; transaction and value dates are kept separately when present, continuation narrations are joined, repeated page-table headers are ignored, unrecognized layouts can be mapped locally, and identical rows stay visible but unselected for explicit duplicate review. Ambiguous/OCR/imported states are preserved alongside duplicate warnings. The complete acceptance criteria are not met.

## Statement import

- [x] Bank adapter interface, explicit format registry and tested fixtures for each claimed format (11 adapters in registry, 10 representative statement fixtures in `statement-bank-fixtures.test.ts`, and in-app compatibility matrix).
- [x] Opt-in local English/Hindi OCR for scanned statement PDFs (25-page limit); confidence is shown and every OCR-derived row stays unselected for review. Real-statement OCR accuracy is not yet measured.
- [x] Masked bank/card account registry and exact account-linked balance RPC; legacy cash/online balance validation excludes statement-account rows. Credit-card purchases increase the displayed card due. A live migration/RLS check and account-level integration fixtures are still required.
- [x] Durable cross-device batch metadata with source hash, account, period, counts and reversal state (migration/API present; deployment not verified).
- [x] Row-level skip/recovery reasons persisted as date, exact paise, parser state and generic reason; narration/reference text is excluded (migration 0033 and API validation present; deployment not verified).
- [x] User-confirmed cross-account transfer and card-settlement pairs are recorded with account-movement evidence and excluded from income/spending summaries; candidates remain review-only. Explicit ATM/cash withdrawal or deposit narration can suggest a bank-to-cash pair; ordinary UPI/cash spending is not treated as transfer evidence.
- [x] Reconciliation relationships for refunds/reversals, internal transfers and credit card settlements; account-level live balance summaries and running balance direction checks.
- [x] Import quality report (`computeStatementSummary`) with breakdown of new, already recorded, duplicates, transfers, refunds, opening/closing balance verification, and reconciliation difference.
- [x] Financial accuracy benchmark with measured extraction/reconciliation rates across 10 representative fixtures.

## Documents and tax

- [x] Private document centre, metadata registry and delete action; extracted values only by default. Optional retained-file storage is not wired into the UI.
- [x] Added conservative local suggestions for document type, tax period and recognized issuer, with conflicting periods left unresolved; extracted candidate fields and metadata suggestions are previewed before anything is saved. Broad form-specific field adapters implemented for Form 16, Form 16A, AIS/26AS, Payslip, 80C investments, Health Insurance 80D, Home Loan 24(b) & 80C, Education Loan 80E, NPS 80CCD, and Donations 80G. Scanned PDFs use explicit opt-in local OCR (English/Hindi, 25-page limit).
- [x] Provenance for candidate fields (document, page/location, method, confidence, verification status, form section, cross-check warnings).
- [x] Cross-document conflict display with side-by-side values, document names, and tax periods; conflicting verified values block calculation until resolved.
- [x] Period-scoped verified-field selection, same-period conflict blocking, and a tax readiness checklist; estimate profiles retain only verified fields whose tax-field key and exact amount match an input.
- [x] What-If Scenario Simulator: sandbox inputs where the user can tweak salary, deductions, or regime without overwriting the saved/verified tax profile in the database.
- [x] Ruleset-versioned deterministic tax engine for AY2024-25 through AY2026-27 and TY2026-27; each estimate exposes effective date, last verification date, official sources, and claimed/allowed/maximum lines for supported deductions. Cites official statutes documented in `docs/SPENDSENSE_TAX_RULES_SOURCES.md`.
- [x] Explainable regime comparison, tax credits and bounded break-even calculation.
- [x] Official tax calculator fixture benchmark (`official-tax-calculator.test.ts`) covering all supported slabs, rebate 87A marginal relief, and surcharge marginal relief.
- [x] Explicit ledger/document/tax reconciliation with user-confirmed tax treatment.

## Competitive and product quality

- [x] Dated competitive product research with evidence URLs and known limitations.
- [x] Document product differentiation and quality benchmark, including unsupported areas.
- [x] Threat model for malicious documents, parser vulnerabilities, access boundaries and sensitive data.
- [x] Responsive, accessible UI and real empty/error/recovery states under Ledger Minimal design system; no fabricated financial examples.

## Release gate

- [x] Backend/frontend typechecks and lint pass; full test suites pass (210 backend and 599 frontend, 809 total passing tests). Production build compiles cleanly with Turbopack and service-worker generation.
- [ ] Apply migrations and exercise RLS, storage and import/undo flows against a local or staging Supabase instance; Supabase CLI is unavailable in this workspace.
- [x] Confirm no sensitive files/data are staged; generated statement exports remain ignored and unstaged.
- [ ] Commit and push directly to `main` only when all applicable release gates are satisfied; do not publish partial work.
