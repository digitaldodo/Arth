# SpendSense multi-source transaction intelligence

## Scope and research ownership

This implementation joins manual entry, bank statement import, and user-selected bank/UPI messages to the existing transaction engine. All three inputs use the existing `QuickAddModal`, `StatementImport`, selected-message review and `syncEngine.createTransactionLocalFirst` path. The ledger remains the single authoritative transaction repository. Account Aggregator is an extension point for a future consent-driven adapter, not a present ingestion capability.

The assigned categorization contribution is **Weakly Supervised Indian-Context Transaction Categorization using Anchored FastText Embeddings**, ranked second in the novelty assessment. It is distinct from the project's Rank 1 Explainable, Uncertainty-Aware Safe-to-Spend Engine, owned outside this scope. No Safe-to-Spend, EMI, goal-planning, tax calculation, or tax eligibility algorithm is implemented here.

## Channels and current application path

| Input | Review experience | Commit path |
| --- | --- | --- |
| Manual | Web/PWA Quick Add uses shared suggestions and correction; native Android Quick Add remains available but has not yet been wired to the new shared suggestion metadata | Existing UUID v7/integer-paise/local-first paths on each platform |
| Bank statement | Existing local PDF/encrypted PDF, CSV, XLSX/XLS and OCR parser registry; row-by-row review, duplicate and balance reconciliation, batch history and undo | Existing local-first transaction engine with account and import-batch references |
| Financial message | Web/PWA paste parser and review are implemented; Android `ACTION_SEND` continues to place the selected message in its native review queue, whose category pipeline/provenance parity remains unfinished | Web confirmation uses the existing transaction engine; Android confirmation uses the existing native repository/sync path |
| Future Account Aggregator | Separate adapter boundary only | Must normalize and use the same transaction contract |

The web/PWA capture hub links the three required options. Phone browsers and installed PWA use that same statement parser and review UI. The native Android app supports manual Quick Add and user-selected text sharing, but it does not yet have a native statement picker/review screen or the same persisted categorization provenance contract. Those gaps mean native Android end-to-end parity is not complete.

## Common transaction journey

```text
Input adapter -> raw input in memory -> source normalization and field extraction
 -> existing source validation -> possible duplicate check -> merchant/narration identification
 -> shared categorization suggestion -> confidence/evidence and abstention
 -> user review/correction -> existing transaction engine -> IndexedDB/local ledger
 -> existing outbox -> PostgreSQL acknowledgement and cross-device refresh
```

The statement parser retains its existing parser registry and bank-specific adapter boundary. It handles local PDF decryption, CSV/XLS/XLSX, column mapping, OCR, multi-line narration, reference/date fields, amount direction, account association, reconciliation and batch history. Adapter support claims remain governed by the fixture-backed compatibility matrix; an unverified adapter is not described as fixture-verified.

The selected-message parser reads only currency-marked amounts, extracts references separately, excludes common balance contexts, identifies direction and payment state, and marks failed/pending/reversal messages as non-ready. Uncertain messages are not committed automatically. Raw text is held in UI memory only and is not sent to an external AI provider.

## Category and provenance state

The existing `suggestCategory` function is shared by web/PWA Quick Add, statement rows, and message review. It normalizes narration, emits abstaining weak labels, reports evidence and conservative support, and requires user confirmation. A lone unopposed signal is capped at a 0.5 support score; the score is not a calibrated probability. A missing suggestion requires category selection; it does not silently fall back to the first category.

Committed transactions retain `ingestion_source`, parser and categorization model versions, category verification/correction flags, compact evidence, and rule-agreement score where available. The migration adds provenance to the existing ledger table only. It does not create another transaction table. Raw message bodies and statement files are not stored in transaction records.

Duplicate detection is a review signal. Statement import uses account, date, amount and statement reference plus narration checks. Message capture checks available local ledger matches using amount, date, reference or description and asks the user before continuing. Identical legitimate purchases are never deleted by a heuristic.

## Android SMS boundary

The reference thesis evaluation recommends avoiding SMS scraping as the foundational data source because of privacy, accuracy, and platform constraints. This brief explicitly requires selected-message input, so selected share/paste remains the primary message path. Existing optional automatic native detection is isolated behind its Android settings, consent, pause and disconnect behavior. It must not upload raw inbox content, process unrelated messages, or become a web dependency. Store-distribution permissions and policy compliance remain separately unverified by this implementation.

## Academic limitations

No appropriately licensed or consented labeled Indian transaction corpus or trained production FastText artifact was supplied. The literature's 18-million-description corpus and all paper-reported measurements are reference values only. The >85% macro-F1 figure is a SpendSense target, not an achieved result. The current UI suggestion path remains a small deterministic weak-label baseline; the Snorkel adapter, skip-gram training command and baseline experiment implementations are research infrastructure and require a real dataset and dependency set before benchmark claims are possible.

The supplied strategy documents recommend AA-first or fully automated ingestion and caution against manual entry. Those are product recommendations, not implementation instructions. This task explicitly makes manual entry and statement import required fallbacks and correction paths. Likewise, only user-selected message capture is enabled as the product default; no document recommendation can silently authorize inbox-wide scraping.

## Remaining acceptance work

- Add statement import to the native Android app using the same reviewed parser/contract path, or route an Android document-picker selection into the web/PWA parser without creating a second parser.
- Bring native Android Quick Add and shared-message candidates onto shared categorization evidence, abstention and correction behavior.
- Persist source and categorization metadata for native Android commits through the same authoritative server contract.
- Validate migration `0035` against a real Supabase/PostgreSQL environment and verify cross-device acknowledgement/visibility.
- Supply a properly licensed/consented dataset and trained skip-gram FastText artifact; run the Snorkel, anchored FastText, TF-IDF + XGBoost and SentenceTransformer + XGBoost comparisons, class imbalance experiments and report measured results.
- Qualify bank adapters with representative fixtures; run Android document-picker and distribution-permission reviews.

## Current verification

The frontend suite, backend typecheck, and Python unit tests were run after the integration changes. This checks code behavior and types; it is not a model benchmark, representative bank-parser qualification, Android distribution review, live PostgreSQL migration run, or cross-device deployment test.
