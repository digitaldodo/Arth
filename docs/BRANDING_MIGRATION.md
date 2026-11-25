# SpendSense — Branding Migration & Identifier Preservation Registry

**Audit & Cleanup Date:** 2026-11-25  
**Customer-Facing Product Name:** **SpendSense**  
**Legacy Technical Origin Identifier:** **Arth** (`अर्थ`)

---

## 1. Branding Standard

| Surface | Canonical Name |
|---|---|
| Customer-facing product | **SpendSense** |
| Web & PWA application | **SpendSense Web** |
| Native Android application | **SpendSense Android** |
| Backend API service | **SpendSense Backend** |
| Ingestion & categorization subsystem | **SpendSense Transaction Intelligence** |
| Decision-support modules | **SpendSense Financial Modules** |

---

## 2. References Updated to SpendSense

| File | What Was Updated | Verification |
|---|---|---|
| [README.md](../README.md) | Updated title (`# Arth (अर्थ)` → `# SpendSense`), product description, accurate monorepo layout (`frontend/`, `backend/`, `packages/`, `ml/`, `android/`, `supabase/`), implemented vs. placeholder/scaffolded feature status, env var names (no values), and current test commands. | Reviewed for accuracy against `main` @ `518d3c9` |
| [MANUAL_DEPLOYMENT.md](../MANUAL_DEPLOYMENT.md) | Updated document title and prose (`Arth` → `SpendSense`) while preserving exact SQL migration file paths (`0025`–`0027`), RPC names, and database verification queries. | Zero SQL or identifier changes |
| [frontend/README.md](../frontend/README.md) | Created SpendSense Web package documentation noting legacy `@arth/frontend` workspace identifier. | Additive file |
| [backend/README.md](../backend/README.md) | Created SpendSense Backend package documentation noting legacy `@arth/backend` workspace identifier and registered vs. pending routes. | Additive file |
| [packages/contracts/README.md](../packages/contracts/README.md) | Created SpendSense Shared Contracts documentation noting legacy `@arth/contracts` workspace identifier. | Additive file |
| [packages/financial-modules/README.md](../packages/financial-modules/README.md) | Created SpendSense Financial Modules documentation noting active scaffold/disabled-flag status. | Additive file |

### Already Clean Prior to This Task (Verified)
- `frontend/src/app/layout.tsx` (`title: "SpendSense — Personal Finance"`, `applicationName: "SpendSense"`, OG tags)
- `frontend/src/app/manifest.ts` (`name: "SpendSense — Personal Finance Tracker"`, `short_name: "SpendSense"`)
- `supabase/templates/*.html` (all 6 email templates already branded **SpendSense**)
- `frontend/src/app/UnauthenticatedHome.tsx`, `frontend/src/app/login/`, `frontend/src/features/tax/DocumentsTaxCentre.tsx`, `frontend/src/features/settings/SettingsView.tsx`

---

## 3. Compatibility-Sensitive Legacy Identifiers Preserved

These identifiers **must NOT be blindly renamed** because doing so would break package resolution, installed Android upgrades, existing browser IndexedDB/localStorage data, OAuth callbacks, or Supabase storage/migration history:

| Identifier / Pattern | Locations | Classification | Reason for Preservation & Future Migration Note |
|---|---|---|---|
| `@arth/frontend`, `@arth/backend`, `@arth/contracts`, `arth-monorepo` | `package.json`, `frontend/`, `backend/`, `packages/contracts/`, `render.yaml`, `vercel.json` | **Requires coordinated migration** (Preserve now) | Changing npm workspace scopes requires updating every TS import, `tsconfig`, `pnpm-lock.yaml`, `render.yaml`, and `vercel.json` simultaneously. |
| `arth_offline_db` & IndexedDB stores | `frontend/src/lib/offline-db.ts` | **Preserve for backward compatibility** | Renaming wipes offline cached transactions, categories, and pending outbox mutations for existing PWA users unless a versioned IndexedDB migration copies all 11 stores. |
| `arth_last_payment_method`, `arth_last_category_*`, `arth_ledger_sort_preference`, `arth_build_id`, `arth_last_sw_reload`, `arth_pwa_critical_channel` | `QuickAddModal.tsx`, `TransactionLedger.tsx`, `usePwaUpdate.ts`, `critical-operation.ts` | **Preserve for backward compatibility** | User preferences and PWA update coordination keys in browser `localStorage`/`sessionStorage`/`BroadcastChannel`. |
| `?arth_runtime=installed-mobile-pwa` | `frontend/src/app/manifest.ts`, `platform-mode.ts` | **Preserve for backward compatibility** | Existing installed PWAs pinned to home screens launch with this exact `start_url` query parameter. |
| `com.digitaldodo.arth`, `com.digitaldodo.arth.installer`, `arth://auth/callback`, `ARTH_SUPABASE_*`, `ARTH_API_URL`, `Arth.apk` attachment filename | `android/`, `.github/workflows/android-release.yml`, `frontend/next.config.ts`, `frontend/src/app/api/android/*`, `assetlinks.json`, `auth/native-callback/` | **Preserve for backward compatibility** | Changing Android `applicationId` breaks in-place APK upgrades, signing continuity, Digital Asset Links (`assetlinks.json`), and mobile OAuth deep links. |
| `arth-private-documents` storage bucket | `supabase/migrations/0028_*`, `backend/src/modules/documents/documents.service.ts` | **Preserve (Database/Storage boundary)** | Existing private storage bucket & RLS policies in production Supabase. |
| Migrations `0001`–`0039`, table/RPC names, `backend/src/types/database.types.ts` | `supabase/migrations/`, `backend/src/` | **Preserve (Immutable DB history)** | Append-only migration rule; never rename historical migration files. |
| Git remote `digitaldodo/Arth` & fallback URLs (`arth-9h3f.vercel.app`, `arth-backend-nchl.onrender.com`) | `.git/config`, `auth-config.ts`, `layout.tsx`, `android-release-asset.ts` | **Legacy internal / deployment identifier** | Live hosting/repo origins; changing breaks fallback links unless DNS/repo moves are coordinated. |
| Component/symbol names (`ArthLogo`, `ArthApi`, `ArthDatabase`, `ArthBackupPayload`, `service: 'arth-backend'`) | `frontend/src/components/brand/ArthLogo.tsx`, `android/`, `json-export.ts`, `health.controller.ts`, `tests/` | **Legacy internal identifier** | Internal code symbols; note `ArthLogo.tsx` already renders the **SpendSense** SVG wordmark. |
| `tax-engine.ts:178` (`"within Arth's ₹1000 comparison threshold"`) | `backend/src/modules/tax/tax-engine.ts` | **Deferred safe UI copy fix** | Left untouched during workspace prep per zero-logic-edit safety directive; Module E (Dev Chaudhary) should update this string to `"SpendSense's"` alongside Tax UI integration. |
| Historical specs (`docs/SPENDSENSE_*.md`, `ANTIGRAVITY.md`) | `docs/`, `ANTIGRAVITY.md` | **Renamed & aligned (`0ad9ef3`)** | Renamed 13 `docs/ARTH_*.md` docs to `docs/SPENDSENSE_*.md` with updated product prose/links while preserving `ANTIGRAVITY.md` and compatibility identifiers. |
