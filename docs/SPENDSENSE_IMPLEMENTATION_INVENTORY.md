# SpendSense implementation inventory

This inventory records the scope implemented for the user's contribution and the handoff boundary for the rest of the team. It is a map of the current tree, not a claim that every research target or production integration has been validated.

## User-owned implementation

| Area | Current entry point | Status |
|---|---|---|
| Product name, visual identity, and responsive app shell | `frontend/src/components/brand/ArthLogo.tsx`, `frontend/src/app/layout.tsx`, `frontend/src/app/UnauthenticatedHome.tsx`, `frontend/src/app/globals.css` | Customer-facing web identity is SpendSense; existing storage, APIs, auth, package IDs, and offline keys remain stable. |
| Transaction category suggestions | `frontend/src/features/categorization/` and `frontend/src/features/transactions/QuickAddModal.tsx` | Conservative Indian merchant/context weak-label baseline; only distinct signals that agree can suggest; the user confirms or corrects; explicit user feedback is account-scoped and local. |
| Categorization research/evaluation | `ml/transaction-categorization/`, `frontend/tests/categorization-pipeline.test.ts`, `docs/SPENDSENSE_TRANSACTION_CATEGORIZATION_RESEARCH.md` | Reproducible evaluation entrypoints and synthetic fixtures exist. No production-trained artifact or measured macro-F1 claim is included. |
| Tax document intake and review | `frontend/src/features/tax/` | Local PDF/text extraction, optional local OCR, spreadsheet intake, document classification, field evidence, review/verification, and deletion. Uploaded originals are not stored by this UI. |
| Verified financial facts handoff | `frontend/src/features/tax/tax-document-review.ts`, `packages/financial-modules/src/shared/contracts.ts` | Provenance-aware reviewed fields and shared contracts. Tax calculations and deduction eligibility remain unimplemented. |
| Module integration architecture | `packages/financial-modules/`, `docs/SPENDSENSE_TEAM_MODULE_OWNERSHIP.md` | Typed inputs/outputs, provider interfaces, disabled flags, and unavailable results. No teammate formulas, models, or fabricated results. |
| Android message import | `android/app/src/main/AndroidManifest.xml`, `android/app/src/main/java/com/digitaldodo/arth/feature/sms/` | User-selected share import, on-device parsing, candidate review, and explicit date review. The manifest requests no inbox SMS permission. |

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

Direct APK distribution supports sharing a selected message into SpendSense and reviewing the parsed candidate. It does not grant `READ_SMS` or `RECEIVE_SMS`; it cannot scan an inbox or automatically observe incoming messages. The APK must be installed through Android's normal user-confirmed installer, which cannot apply PackageInstaller's restricted-permission allowlist on behalf of this website. A supported alternative would require a distribution/installer path that legitimately grants the restricted permission, or a product flow based on user-selected sharing/Account Aggregator consent. No rooted-device workaround is supported. A physical-device install check remains pending because no device was available during this implementation.

## Not claimed as complete

- The Android binary has not been physically installed or tested in this workspace.
- The categorization research target of greater than 85% macro F1 has not been measured.
- No production FastText artifact is trained or shipped.
- Automatic SMS inbox access is not available in the direct-download APK.
- Tax estimation and deduction rules are team-owned and are not implemented by the document intake feature.
- Account Aggregator connectivity is a scaffold, not a live provider integration.
