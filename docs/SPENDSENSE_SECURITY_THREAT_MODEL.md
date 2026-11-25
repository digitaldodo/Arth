# SpendSense document and financial-data threat model

## Scope and security boundaries

Sensitive assets include transaction descriptions/references, masked account identity, tax fields, PAN and employer identifiers, source files, extracted values and PDF passwords. Existing Supabase Auth/JWT, BFF and RLS boundaries remain authoritative. Browser extraction is preferred. The document password exists only in a short-lived input/state value and is cleared after processing; it must never enter storage, logs, analytics, URLs or network payloads.

## Threats and controls

| Threat | Required controls | Verification |
|---|---|---|
| Malicious/oversized PDF, spreadsheet formula or decompression bomb | File type/size/page/row limits; parse in browser worker where supported; treat extracted text as data; disable formula evaluation; handle parser exceptions; keep libraries patched. | Malformed, oversized, nested/large sheet and hostile PDF fixtures; memory/time bounds. |
| Wrong password, password leakage | User-entered password only; local PDF.js password callback; no persistence or telemetry; clear state and destroy PDF task after use. | Static search and browser instrumentation for wrong/correct password cases. |
| Cross-user document or tax record access | User-scoped tables, RLS on each table, ownership checks for parent/child links and storage object paths; least-privileged JWT client. | SQL tests using two authenticated users; direct API/storage access attempts. |
| PAN/account number in logs or UI | Store only masked account tail where possible; redact identifiers before diagnostics; never log extracted raw text; masked display. | Sentinel-value log inspection and UI snapshots. |
| Incorrect OCR/parser extraction changes ledger/tax | Provenance/confidence, manual review and explicit confirmation; deterministic amount validation; no auto import on uncertainty. | Low-confidence fixtures must remain uncommitted until user action. |
| Reconciliation false match hides real transaction | Explanations, match confidence/evidence, no fuzzy auto-merge, preserve separate identical purchases. | Adversarial same-date/amount and near-date transfer fixtures. |
| Unsafe undo after later edits/use | Batch-level transaction IDs, verify the transaction is still unchanged and not linked/used before reversal; soft-delete through existing engine; report skipped conflicts. | Modify/link a transaction after import then attempt undo. |
| Sensitive original retained too long | Do not retain by default; if retention is enabled, private user-scoped encrypted storage, retention setting and deletion workflow. | Storage/RLS/delete tests and retention audit. |
| Tax recommendation overstates certainty | Ruleset source/date, verified/unverified input status, unsupported scenarios refused, transparent calculation trace and no LLM numeric authority. | Official examples, boundaries, missing-data and outdated-rules tests. |

## Current implementation gap

The statement reader keeps source files in browser memory and does not persist them; its password stays in component state and is cleared after each password attempt or processing. Scanned statement PDFs offer an explicit local OCR action using app-bundled English/Hindi worker, WASM and language assets (25 pages maximum); raw document pages and OCR text are not sent to a processing provider. OCR text is untrusted and all derived rows require review. OCR accuracy on representative statements is not measured. Statement history is stored in local IndexedDB and batch metadata is also available through user-scoped APIs. The Documents & Tax centre stores metadata and user-reviewed extracted candidates, not original files by default. Scanned tax PDFs also offer explicit local OCR using the same bundled assets, with extracted fields capped at low confidence. Migrations 0028-0032 and user-JWT APIs define account, batch, document, extracted-field, snapshot, undo, explicit transfer-pair behavior and exact account balances, but they have not been applied or exercised against a Supabase instance. Bank-format extraction, live account-balance summaries, broad tax form adapters and complete tax reconciliation remain incomplete. Static tests do not establish deployed RLS or storage correctness. This threat model is a checklist, not a claim that the controls are complete.
