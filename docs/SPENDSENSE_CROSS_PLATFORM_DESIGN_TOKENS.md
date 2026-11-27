# SpendSense — Cross-Platform Design Token & Brand Parity Reference

> **Design Direction**: Ledger Minimal (Archival Warm Paper Light + Obsidian Dark)  
> **Platforms**: Web / Installed PWA (`frontend/src/app/globals.css`) & Native Android Jetpack Compose (`android/app/src/main/java/com/digitaldodo/arth/core/designsystem/`)

---

## 1. Unified Color Tokens

| Semantic Role | Web CSS Variable (Light / Dark) | Android Compose Token (`Color.kt` / `ArthTheme.colors`) | Light Hex | Dark Hex |
|---|---|---|---|---|
| Canvas background | `--bg-canvas` | `LightCanvas` / `DarkCanvas` (`MaterialTheme.colorScheme.background`) | `#F8F8F6` | `#0C0A09` |
| Elevated card / container | `--bg-surface` | `LightSurface` / `DarkSurface` (`MaterialTheme.colorScheme.surface`) | `#FFFFFF` | `#171513` |
| Subtle surface / input backing | `--bg-surface-subtle` | `LightSurfaceSubtle` / `DarkSurfaceSubtle` (`ArthTheme.colors.surfaceSubtle`) | `#F1F1ED` | `#221F1C` |
| Modal / sheet elevated surface | `--bg-surface-elevated` | `LightSurfaceElevated` / `DarkSurfaceElevated` (`ArthTheme.colors.surfaceElevated`) | `#FFFFFF` | `#1E1B18` |
| Primary ink | `--text-primary` | `LightTextPrimary` / `DarkTextPrimary` | `#181615` | `#F5F5F4` |
| Secondary metadata ink | `--text-secondary` | `LightTextSecondary` / `DarkTextSecondary` | `#494541` | `#A8A29E` |
| Muted / timestamp ink | `--text-muted` | `LightTextMuted` / `DarkTextMuted` | `#736E66` | `#78716C` |
| Hairline divider / card border | `--border-hairline` | `LightBorderHairline` / `DarkBorderHairline` (`ArthTheme.colors.border`) | `#E4E2DC` | `#292524` |
| Subtle input / control border | `--border-subtle` | `LightBorderSubtle` / `DarkBorderSubtle` (`ArthTheme.colors.borderSubtle`) | `#CDCABF` | `#3F3B37` |
| Strong active border | `--border-strong` | `LightBorderStrong` / `DarkBorderStrong` (`ArthTheme.colors.borderStrong`) | `#9C978D` | `#57534E` |
| Income foreground | `--income-fg` | `LightIncomeFg` / `DarkIncomeFg` (`ArthTheme.colors.emerald`) | `#166534` | `#86EFAC` |
| Income surface | `--income-bg` | `LightIncomeBg` / `DarkIncomeBg` (`ArthTheme.colors.emeraldContainer`) | `#F0FDF4` | `rgba(34,197,94,0.14)` |
| Expense foreground | `--expense-fg` | `LightExpenseFg` / `DarkExpenseFg` (`ArthTheme.colors.crimson`) | `#991B1B` | `#FCA5A5` |
| Expense surface | `--expense-bg` | `LightExpenseBg` / `DarkExpenseBg` (`ArthTheme.colors.crimsonContainer`) | `#FEF2F2` | `rgba(239,68,68,0.14)` |
| Essential tag | `--tag-essential-fg` / `-bg` | `LightTagEssentialFg` / `DarkTagEssentialFg` (`ArthTheme.colors.blue`) | `#1E40AF` / `#EFF6FF` | `#93C5FD` / `rgba(59,130,246,0.14)` |
| Optional tag | `--tag-optional-fg` / `-bg` | `LightTagOptionalFg` / `DarkTagOptionalFg` (`ArthTheme.colors.amber`) | `#92400E` / `#FFFBEB` | `#FCD34D` / `rgba(245,158,11,0.14)` |
| Luxury tag | `--tag-luxury-fg` / `-bg` | `LightTagLuxuryFg` / `DarkTagLuxuryFg` (`ArthTheme.colors.purple`) | `#6B21A8` / `#FAF5FF` | `#D8B4FE` / `rgba(168,85,247,0.14)` |
| Online payment tag | `--tag-online-fg` / `-bg` | `LightTagOnlineFg` / `DarkTagOnlineFg` (`ArthTheme.colors.tagOnlineFg`) | `#0369A1` / `#F0F9FF` | `#7DD3FC` / `rgba(2,132,199,0.14)` |
| Cash payment tag | `--tag-cash-fg` / `-bg` | `LightTagCashFg` / `DarkTagCashFg` (`ArthTheme.colors.tagCashFg`) | `#292524` / `#F5F5F4` | `#E7E5E4` / `rgba(255,255,255,0.08)` |
| Brand Evergreen / Copper | `#193F37` / `#B67645` | `BrandEvergreen` / `BrandCopper` | `#193F37` / `#B67645` | `#193F37` / `#B67645` |

---

## 2. Typography & Tabular Numerals

- **Prose / Navigation**: `Inter` on Web (`--font-sans`), Roboto/System Sans on Android (`FontFamily.SansSerif`).
- **Financial Amounts, Totals & Dates**: `Geist Mono` (`tabular-nums`) on Web (`--font-mono`); `FontFamily.Monospace` with `fontFeatureSettings = "tnum"` on Android (`ArthFigureStyle`, `ArthTimestampStyle`).
- **INR Formatting**: Strictly Indian numbering system (`₹1,25,000.00` via `Intl.NumberFormat('en-IN')` on Web and `Money.formatPaise` on Android; integer paise storage).
- **Minimum Readability Floor**: Micro-labels never fall below `10px` / `10.sp`.

---

## 3. Geometry, Borders & Dual-Encoding

- **Corner Radii**: Restrained architectural corners across both platforms (`2px–4px` badges/tags, `4px–6px` web controls & `6.dp–8.dp` native Android cards/buttons, `8.dp–12.dp` mobile bottom sheets — no bubbly `16dp–24dp` pill cards).
- **Card Elevation**: Flat `0.dp` / `0px` shadow with `1px` / `1.dp` hairline borders.
- **Dual-Encoding Accessibility**:
  - Income: `+` prefix + green + `↑`
  - Expense: `−` prefix + red + `↓`
  - Essential: `▲ Essential`
  - Optional: `● Optional`
  - Luxury: `◆ Luxury`

---

## 4. Platform Feature Parity Matrix (Verified Against Repository)

| Capability | Web / PWA | Native Android APK | Classification |
|---|---|---|---|
| Email/Password & Google Sign-In | Supabase Auth (`AuthContext`, `AuthForm`) | Native Credential Manager + Browser OAuth + Password (`LoginScreen`) | Fully implemented (both) |
| Offline-First Local Storage | IndexedDB v7 (`arth_offline_db`, 11 stores) + SyncEngine | Room v4 (`arth_native.db`, 7 tables) + `SyncOutbox` + `SyncWorker` | Fully implemented (both) |
| Dashboard (Balances, Net Flow, Necessity, Categories, Recent) | `DashboardPage` + SWR cache | `DashboardScreen` + Period chips | Fully implemented (both) |
| Full Searchable/Filtered Ledger & Detail View | `TransactionLedger` | `LedgerScreen` + `TransactionDetailSheet` | Fully implemented (both) |
| Quick Transaction Entry (< 5s flow + Necessity + Notes) | `QuickAddModal` | `QuickAddSheet` | Fully implemented (both) |
| Category Taxonomy & Indian Rule Engine | `CategoryManager` + server/local rules | `CategoriesScreen` + `IndianCategorizationEngine` | Fully implemented (both) |
| Starting Balances & Cash/Online Transfers | `ConfigureStartingBalancesModal` + Balances | `BalancesScreen` | Fully implemented (both) |
| People & Debt Tracker + Settlements | `PeoplePage` | `PeopleScreen` + `PersonDetailScreen` | Fully implemented (both) |
| PDF Statement Export | `ExportPdfDialog` (`jspdf`) | `ReportsScreen` + `PdfStatementGenerator` | Fully implemented (both) |
| Bank Statement Import | CSV, Excel (`xlsx`), PDF, Password PDF, OCR (`StatementImport`) | CSV & Text statements (`StatementImportScreen`) | Partial parity (Web supports PDF/XLSX/OCR; Android CSV/Text) |
| Biometric / Passkey App Lock | WebAuthn / Passkey App Lock | Android `BiometricPrompt` + Device Credential (`ArthLockScreen`) | Fully implemented (both, native hardware on Android) |
| Automatic Capture (Notifications) | N/A (Browser restriction) | `SmsNotificationListenerService` (selected bank/UPI/SMS apps -> Review Queue) | Android-only |
| Automatic Capture (Direct SMS Broadcast & Inbox Scan) | N/A | `SmsReceiver` + `SmsInboxScanner` (`directSms` flavor via Installer) | Android-only (`directSms` flavor) |
| Share Sheet Transaction Import | Web Share Target not wired for SMS parsing | `ACTION_SEND` `text/plain` -> `SmsReviewScreen` | Android-only |
| Documents & Tax Vault | `DocumentsTaxCentre` | Not implemented on Android | Web-only |
| Financial Planning Suite (Safe-to-Spend, EMI, Goals, Forecast) | Planning views & tools | Not implemented on Android | Web-only |
| Google Sheets Bi-directional Sync UI | `DataSyncSettings` + `/api/backend/sheets/*` | Backend-only / Web UI | Web-only |
| Theme Toggle (Light Warm Paper / Obsidian Dark / System) | `ThemeToggle` | `ThemePreferenceRepository` + `SettingsScreen` | Fully implemented (both) |
| PWA Install & Offline Fallback Page | `InstallPromptCard` + `/offline` + custom SW | Native APK (`SettingsScreen` / Auto-update check) | Platform-specific |
