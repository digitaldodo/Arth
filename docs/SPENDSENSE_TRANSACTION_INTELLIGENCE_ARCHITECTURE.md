# SpendSense transaction intelligence architecture

## Design

SpendSense has one transaction ledger and one categorization interface. Source adapters are responsible for extracting candidate fields; they do not choose a source-specific category. Manual input goes through `QuickAddModal`; bank files go through the existing `StatementImport` parser registry and review list; selected financial messages go through the local message parser and review component. Each confirmed candidate calls the existing local-first sync engine.

## Contracts and persistence

`CreateTransactionRequest` remains the shared commit request. Amounts are decimal strings at the API edge and exact integer paise in PostgreSQL. The client creates UUID v7 identifiers. `ingestion_source` distinguishes `manual`, `bank_statement`, `message`, and reserved `account_aggregator`. Parser/model versions, category evidence, category verification and correction state are optional metadata on the same transaction row. Migration `0035_transaction_ingestion_provenance.sql` is append-only and adds these columns to `transactions`.

Raw documents and complete messages do not belong in transaction records. Statement batch metadata continues in the established import batch structures. A message reference may be retained as a transaction reference, but raw message text is not.

## Pipeline stages

1. Acquire input through a channel adapter.
2. Parse source-specific fields and retain the original input only transiently.
3. Normalize narration via the shared categorization pipeline while retaining amount, date, direction, reference and account as separate fields.
4. Validate with channel parser checks and the existing transaction validation rules.
5. Compare against ledger/import data and present possible duplicates without destructive auto-resolution.
6. Identify a merchant when deterministic evidence supports it; preserve the narration otherwise.
7. Call the shared categorizer with narration and transaction type.
8. Preserve evidence, method, version, abstention/confirmation requirement and user decision.
9. Present the candidate for review; OCR, uncertain messages and low-confidence classification do not become authoritative silently.
10. Commit only through the existing ledger, local-first IndexedDB persistence, outbox and server sync.

## Existing parser reuse

`frontend/src/features/imports/statement-parser.ts`, `statement-adapters.ts`, `statement-ocr.ts`, and `StatementImport.tsx` remain the statement implementation. The shared UX composes the existing parser; it does not replace it with a reduced mobile parser. PDF, password handling, local English/Hindi OCR and desktop/mobile file inputs remain in the existing flow.

## Account Aggregator extension

The source union includes `account_aggregator` so a future consent-driven AA adapter can normalize into the same commit contract. No AA provider, consent flow, or automated synchronization is claimed as implemented.

## Sync and idempotency

The web/PWA transaction engine retains IndexedDB local-first writes, UUID v7 idempotency and the existing outbox queue. The backend writes to the existing PostgreSQL `transactions` table under the existing authenticated/RLS path. Android native uses its established local repository and sync API, but its commit metadata is not yet mapped to the new provenance columns. The service has a legacy-column fallback for deployments where migration `0035` is not yet applied. Do not infer server acknowledgement from a local save.

## Platform parity gaps

Native Android does not yet expose the statement parser/review flow or the shared category evidence/correction contract. Its selected-message flow remains in the existing native candidate review subsystem. The browser/PWA capture flow is the implemented complete path; native parity and live cross-device verification remain required acceptance work.
