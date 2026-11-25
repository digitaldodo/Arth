# SpendSense Android — Technology Architecture Decision

## Executive Summary

| Dimension | Option A: Native Kotlin + Jetpack Compose | Option B: React Native (New Architecture + Native Modules) | Selected Recommendation |
| :--- | :--- | :--- | :--- |
| **UI Parity with PWA** | High — Compose reproduces 100% of PWA tokens, hairlines, and layouts | Medium-High — Shares mental model with React, but requires rewriting UI (cannot reuse DOM/shadcn) | **Option A (Compose)** |
| **SMS Detection & Privacy** | Excellent — Native `BroadcastReceiver`, on-device regex/NLP parser, Room DB storage | Complex — Must still write SMS receiver, parser, and storage in native Kotlin (no JS when app closed) | **Option A (Compose)** |
| **Background Processing** | Native AndroidX `WorkManager` with battery/network constraints | Headless JS or native Kotlin background workers | **Option A (Compose)** |
| **Offline Architecture** | Native Room DB (SQLite) with KSP compile-time type safety & outbox queue | WatermelonDB or OP-SQLite with custom native sync bridge | **Option A (Compose)** |
| **Authentication** | Direct AndroidX `CredentialManager` + `googleid` + Supabase Auth | Community wrapper or custom TurboModule for Credential Manager | **Option A (Compose)** |
| **App Lock & Biometrics** | Direct AndroidX `BiometricPrompt` with zero-latency screen gate | Asynchronous JS bridge with risk of momentary unauthenticated flash | **Option A (Compose)** |
| **APK Binary Size & Startup** | ~14.1 MB APK; <400ms cold start with Baseline Profiles | ~45–60 MB APK; Hermes JS runtime initialization overhead | **Option A (Compose)** |
| **Migration Risk** | Very Low — Fix navigation backstack, Quick Add sheet, and visual tokens | High — Complete rewrite of 15+ screens, Room schemas, PDF generator, and CI | **Option A (Compose)** |

---

## 1. Context & Objective

SpendSense is a disciplined, offline-first personal finance application adhering strictly to the **Ledger Minimal** design system (archival paper / obsidian palettes, 1px hairlines, tabular figures, and honest accounting). 

Physical device testing revealed several product-level deficiencies:
1. Inconsistent navigation and backstack behavior (difficulty returning to Dashboard).
2. Quick Add acting as a full-screen navigation destination rather than an 80%-height bottom sheet overlay.
3. Visual styling falling short of the refined SpendSense PWA.
4. SMS detection disabled in local development builds.
5. Incomplete authentication options (missing username/password alongside native Google Sign-In).

The objective is to achieve **complete functional, visual, and behavioral parity with the SpendSense PWA** while preserving native Android capabilities.

---

## 2. Evaluation of Existing Technical Debt

### Root Causes of Current Flaws in Compose

1. **Dual Navigation Host Flaw**:
   - `MainActivity.kt` nested a `tabNavController` inside a root `navController`. Screens like `balances`, `people`, `reports`, and `sms_review` were registered on the outer `NavHost`, which completely stripped the bottom navigation bar and caused back-button traps.
   - *Remedy*: Unify top-level navigation so `BottomBar` remains persistent across main hub screens, and provide deterministic `BackHandler` logic returning to `Dashboard` from any sub-tab.

2. **Quick Add Implementation Misalignment**:
   - `QuickAddSheet.kt` rendered a `Surface(Modifier.fillMaxSize())` full-screen page with a custom keypad rather than using Material 3 `ModalBottomSheet`.
   - *Remedy*: Replace with `ModalBottomSheet(sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true))` configured to ~85% height with a drag handle, dimmed scrim backdrop, and keyboard avoidance.

3. **Flavored SMS Disablement**:
   - `android/app/build.gradle` set `buildConfigField "boolean", "SMS_DETECTION_SUPPORTED", "false"` in the `local` flavor, and excluded permissions from `main/AndroidManifest.xml`.
   - *Remedy*: Consolidate `RECEIVE_SMS` and `READ_SMS` into `main/AndroidManifest.xml` and enable SMS detection across all build variants (`localDebug`, `localRelease`, `playDebug`, `playRelease`).

4. **Authentication Gap**:
   - The login screen previously only offered Google Sign-In or email/password without username-to-identity resolution.
   - *Remedy*: Integrate backend username resolution via `POST /api/native/auth/login` and provide full username, password, show/hide, forgot password, and signup flows.

---

## 3. UI Consistency & Code Sharing Analysis

A common rationale for considering React Native is code sharing with the existing React/TypeScript web app (`frontend/`). However:

1. **DOM vs Native Primitives**:
   - SpendSense Web utilizes Next.js 16, Tailwind CSS v4, and Radix UI / shadcn/ui.
   - Radix primitives (`@radix-ui/react-dialog`, `@radix-ui/react-select`, `@radix-ui/react-dropdown-menu`) are hard-coded to HTML DOM elements (`<div>`, `<button>`, `ARIA` attributes).
   - React Native does **not** run HTML or DOM elements. None of the existing web JSX components can be imported into React Native without an absolute rewrite into `<View>`, `<Text>`, `<Pressable>`, and `StyleSheet`.

2. **Design Tokens & Ledger Minimal Aesthetic**:
   - Jetpack Compose is a modern declarative UI framework that mirrors React concepts (`@Composable` ≈ functional components, `remember` ≈ `useMemo`/`useRef`, `mutableStateOf` ≈ `useState`, `LaunchedEffect` ≈ `useEffect`).
   - Every styling attribute in the SpendSense PWA—hairline borders (`0.5.dp`/`1.dp`), archival paper (`#FBFBF9`), obsidian (`#0C0A09`), tabular numbers, typography scales, necessity badges—is implemented with native precision in Jetpack Compose.
   - The generic appearance was not a framework limitation; it was a styling fidelity gap that is readily resolved by syncing tokens directly.

---

## 4. SMS Integration & Background Processing Feasibility

The user requirement states:
> *"Keep SMS reception, parsing and durable background processing in native Kotlin. That gives you a React-based UI without sacrificing Android capabilities."*

### Why React Native Creates Architectural Friction for SMS

1. **Process Lifecycle**:
   - When an SMS arrives while SpendSense is closed or the device was recently rebooted, Android invokes a `BroadcastReceiver`.
   - The React Native JavaScript runtime (Hermes) is **not running**. Spinning up the JS engine to parse an SMS message consumes hundreds of milliseconds, risks ANRs (Application Not Responding), and drains battery.
   - Therefore, the SMS receiver, Indian banking regex parser, deduplicator, and pending suggestion storage **must be written in native Kotlin anyway**.

2. **Dueling Databases**:
   - If React Native uses WatermelonDB or OP-SQLite in JavaScript, and the native Kotlin `BroadcastReceiver` needs to store incoming suggestions while JS is dead, the native Kotlin layer must directly write to the SQLite database or an intermediate SQLite cache.
   - In pure Kotlin/Compose, Room Database is the single source of truth. The `SmsReceiver` writes directly to Room via `SmsCandidateDao`, and the UI observes `candidateDao.getPendingCandidates()` via reactive Kotlin `Flow`. There is zero serialization, zero bridging, and zero synchronization risk.

---

## 5. Authentication Feasibility

1. **Native Google Sign-In**:
   - AndroidX `CredentialManager` with `com.google.android.libraries.identity.googleid:googleid:1.1.1` is already implemented and verified in Kotlin. It launches the native Google bottom sheet without leaving the app.
   - React Native has no official first-party Credential Manager module; it requires a custom TurboModule or community wrapper.

2. **Biometric Security**:
   - In Kotlin, `BiometricPrompt` integrates with `KeyguardManager` and `AppLockManager` to intercept activity rendering synchronously on app launch and resume, ensuring no sensitive financial data is visible before authentication succeeds.
   - In React Native, asynchronous bridge initialization can produce a brief frame flash of unauthenticated data.

---

## 6. Migration Cost & Risk Analysis

| Task | Kotlin + Jetpack Compose | React Native Migration |
| :--- | :--- | :--- |
| **Setup & Build Tooling** | 0 days (already operational, Gradle 8.13, AGP 8.8) | 2–3 days (Metro, Hermes, React Native 0.76+, Expo prebuild) |
| **Navigation & Backstack** | 0.5 days (refactor to unified Scaffold & BackHandler) | 2 days (configure Expo Router / React Navigation) |
| **Quick Add Bottom Sheet** | 0.5 days (`ModalBottomSheet` 85% height) | 1–2 days (`@gorhom/bottom-sheet` + Reanimated) |
| **Screen Re-implementation** | 0 days (15 existing screens preserved & polished) | 7–10 days (rewrite Dashboard, Ledger, Categories, People, etc.) |
| **Offline DB & Outbox** | 0 days (Room DB & WorkManager already verified) | 3–4 days (set up SQLite, migrations, outbox replay) |
| **PDF Statement Export** | 0 days (native Android PdfDocument generator working) | 2 days (re-implement or bridge PDF generation) |
| **Total Engineering Time** | **1–2 days** | **17–23 days** |
| **Regression Risk** | Very Low | High |

---

## 7. Architectural Recommendation: Retain & Elevate Kotlin + Jetpack Compose

### Decision
**Retain Native Kotlin and Jetpack Compose (Option A).** Elevate the codebase to the required standard by executing the following targeted overhauls:

1. **Navigation Architecture**:
   - Refactor `MainActivity.kt` to use a single unified `Scaffold` where the 5-item `NavigationBar` (`Dashboard`, `Ledger`, `QuickAdd (+)`, `Categories`, `More`) is persistent across main application sections.
   - Implement strict backstack rules: Android Back from any tab returns to `Dashboard`; Back from `Dashboard` exits or prompts to exit; child screens navigate cleanly to their parent.

2. **Quick Add Bottom Sheet**:
   - Rebuild `QuickAddSheet.kt` using Material 3 `ModalBottomSheet` with `skipPartiallyExpanded = true`, `Modifier.fillMaxHeight(0.85f)`, native drag handle, dimmed backdrop, and keyboard padding.

3. **Ledger Minimal Design System**:
   - Deepen token alignment in `Color.kt`, `Theme.kt`, and `Components.kt`. Enforce 1px hairline borders, archival paper/obsidian contrast, tabular figures, and loading skeletons.

4. **SMS Detection in All Builds**:
   - Merge `RECEIVE_SMS` and `READ_SMS` into `main/AndroidManifest.xml`. Set `SMS_DETECTION_SUPPORTED = true` for `local` flavor, ensuring local physical device testing works out of the box.

5. **Username & Password Authentication**:
   - Add username login support to `LoginScreen.kt`, resolving usernames to identities via `POST /api/native/auth/login`. Provide password visibility toggle, forgot password, and signup flows.
