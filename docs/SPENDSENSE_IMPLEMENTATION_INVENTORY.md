# SpendSense implementation inventory

This inventory records the scope implemented for the user's contribution and the handoff boundary for the rest of the team. It is a map of the current tree, not a claim that every research target or production integration has been validated.

## User-owned implementation

| Area | Current entry point | Status |
|---|---|---|
| Product name, visual identity, and responsive app shell | `frontend/src/components/brand/ArthLogo.tsx`, `frontend/src/app/layout.tsx`, `frontend/src/app/UnauthenticatedHome.tsx`, `frontend/src/app/globals.css` | Customer-facing web identity is SpendSense; existing storage, APIs, auth, package IDs, and offline keys remain stable. |
| Transaction category suggestions | `frontend/src/features/categorization/` and `frontend/src/features/transactions/QuickAddModal.tsx` | Conservative Indian merchant/context weak-label baseline; only distinct signals that agree can suggest; the user confirms or corrects; explicit user feedback is account-scoped and local. |
| Categorization research/evaluation | `ml/transaction-categorization/`, `frontend/tests/categorization-pipeline.test.ts`, `docs/SPENDSENSE_TRANSACTION_CATEGORIZATION_RESEARCH.md` | Reproducible evaluation entrypoints and synthetic fixtures exist. No production-trained artifact or measured macro-F1 claim is included. |
| Tax document intake and review | `frontend/src/features/tax/`, `backend/src/modules/documents/`, `supabase/migrations/0028_financial_documents_accounts_and_tax.sql` | Local PDF/text extraction, optional local OCR, spreadsheet intake, document classification, field provenance, authenticated user-scoped metadata API, review/verification, and deletion. Uploaded originals are not stored by this UI. Numeric values are stored as integer paise; legacy whole/decimal rupee values are normalized when written. |
| Verified financial facts handoff | `frontend/src/features/tax/tax-document-review.ts`, `packages/financial-modules/src/shared/contracts.ts` | Provenance-aware reviewed fields and shared contracts. Tax calculations and deduction eligibility remain unimplemented. |
| Module integration architecture | `packages/financial-modules/`, `docs/SPENDSENSE_TEAM_MODULE_OWNERSHIP.md` | Typed inputs/outputs, provider interfaces, disabled flags, and unavailable results. No teammate formulas, models, or fabricated results. |
| Android message import | `android/app/src/main/AndroidManifest.xml`, `android/app/src/local/AndroidManifest.xml`, `android/app/src/main/java/com/digitaldodo/arth/core/sms/`, `android/app/src/main/java/com/digitaldodo/arth/feature/sms/` | Website APK uses the local flavor: opt-in visible-notification detection from the default Messages app, on-device parsing, candidate review, and user-selected sharing fallback. Its merged manifest requests no inbox SMS permission; the pre-existing SMS-capable flavor remains preserved separately. |

## Team-owned scaffolds

Each module is under `packages/financial-modules/src/modules/<module>/` and has `domain/`, `contracts/`, `application/`, `adapters/`, `tests/`, an `index.ts`, and a `README.md`:

- `safe-to-spend`
- `purchase-simulator`
- `emi-affordability`
- `goal-planner`
- `fire-planner`
- `spending-forecast`
- `recurring-payments`
- `personalized-categories`
- `tax-calculation`
- `account-aggregator`
- `behavioral-insights`

All flags are disabled by default. Scaffold services return `unavailable` until an owner provides and reviews a real implementation. These folders are reserved for the relevant team member; don't place work from another module in them.

## Android SMS support boundary

Direct APK distribution uses Android's user-granted Notification access to detect visible alerts from the default Messages app. It does not grant `READ_SMS` or `RECEIVE_SMS`, read inbox history, or receive SMS broadcasts. App code filters out other notification packages; raw notification text is discarded after on-device parsing, and each candidate requires review. Detection cannot work when previews are hidden, the default Messages app is not posting visible text, Android redacts content, or notification access is revoked. Sharing a message remains the fallback. No rooted-device workaround is supported. Physical-device behavior remains pending because no device was available.

## Not claimed as complete

- The Android binary has not been physically installed or tested in this workspace.
- The categorization research target of greater than 85% macro F1 has not been measured.
- No production FastText artifact is trained or shipped.
- Automatic inbox/history access is not available in the direct-download APK; visible notification detection is opt-in and best effort.
- Tax estimation and deduction rules are team-owned and are not implemented by the document intake feature.
- The user-owned `/api/v1/financial/documents` and `/fields` endpoints are registered by `backend/src/modules/documents/`. The tax calculation module must consume these verified facts and must not register duplicate document handlers.
- Account Aggregator connectivity is a scaffold, not a live provider integration.
