# SpendSense Android Automatic Transaction Capture — Technical Feasibility & Architecture Report

> **Research Date**: 2026-11-27  
> **Scope**: Native Android application (`com.digitaldodo.arth`), `local` / `play` / `directSms` flavors, and `com.digitaldodo.arth.installer`  
> **Status**: Audited against actual repository code and current Android / Google Play platform rules

---

## 1. Existing Implementation Audit

An inspection of the native Android codebase prior to remediation revealed **two parallel, partially disconnected transaction-capture architectures**:

1. **Orphaned SQLite Pipeline (Inactive / Unregistered)**:
   - Files: `FinancialNotificationListener.kt`, `CandidateStore.kt`, `TransactionMessageParser.kt`, `ConfirmedTransactionSyncWorker.kt`, `NativeAuth.kt`.
   - Status: `FinancialNotificationListener` was **not declared in `AndroidManifest.xml`**. `CandidateStore` used a separate raw SQLite database (`arth_detection.db`), separate from Room (`ArthDatabase`), with no Compose UI screen reading or confirming its rows and no WorkManager enqueue calls scheduling `ConfirmedTransactionSyncWorker`.
2. **Primary Room-Backed Capture Pipeline (Active UI & Sync, Partially Wired)**:
   - Storage & UI: `ArthDatabase` (`SmsSuggestionEntity`, `SmsSuggestionDao`), `SmsSuggestionRepository`, `TransactionRepository`, `SyncOutboxEntity`, `SyncWorker`, `SmsViewModel`, `SmsReviewScreen`, `SmsSettingsScreen`.
   - Capture Sources:
     - `SmsNotificationListenerService` (registered in `AndroidManifest.xml`).
     - `SmsReceiver` & `SmsInboxScanner` (`directSms` flavor only; removed in `local` merged manifest).
     - Android Share Sheet (`ACTION_SEND` `text/plain` in `MainActivity.kt` -> `SmsViewModel.importSharedMessage`).
     - CSV/Text Bank Statement Import (`StatementImportScreen.kt`).

---

## 2. Actual Working Data Flow (Post-Remediation)

```
Source Event:
  ├── [A] Notification (Default SMS app + User-selected Bank/UPI apps)
  │     └── SmsNotificationListenerService (onNotificationPosted -> IO coroutine)
  ├── [B] Direct SMS Broadcast / Inbox Scan (directSms flavor only, runtime permission granted)
  │     └── SmsReceiver / SmsInboxScanner
  ├── [C] Manual Android Share Sheet ("Share -> SpendSense")
  │     └── MainActivity (ACTION_SEND text/plain) -> SmsViewModel.importSharedMessage
  └── [D] Bank Statement CSV/Text File
        └── StatementImportScreen -> StatementImportViewModel
            │
            ▼ (100% On-Device, Raw Payload Discarded / Never Persisted or Uploaded)
  FinancialMessageClassifier + SmsNotificationParser
    (filters OTPs, balance-only alerts, promos, login alerts, mandates/reminders, failures)
            │
            ▼ (Normalized Candidate Only; rawSnippet = null)
  TransactionDeduplicator (Cross-Channel Fingerprint + Ref/UTR + Tight Window Enrichment)
            │
            ▼
  Room: sms_suggestions (status = PENDING) + Private Notification Prompt (optional)
            │
            ▼ (Explicit User Action: Confirm / Edit / Dismiss / Mark Duplicate)
  SmsReviewScreen -> SmsSuggestionRepository.confirmSuggestion()
            │
            ▼
  TransactionRepository.addTransaction() -> Room: transactions + sync_outbox (INSERT)
            │
            ▼
  WorkManager (SyncWorker) -> AccountSyncService -> Backend /api/v1/transactions -> Supabase RLS
```

---

## 3. Identified Implementation Gaps Found & Fixed

| # | Gap Identified During Code Audit | Impact Before Fix | Remediation Implemented |
|---|---|---|---|
| 1 | `SmsNotificationListenerService` and `SmsNotificationParser` rejected all apps except `Telephony.Sms.getDefaultSmsPackage()`. | Notifications from Google Pay, PhonePe, Paytm, CRED, HDFC, SBI YONO, ICICI iMobile, Axis, and Kotak were silently dropped. | Added `SupportedNotificationSources` curated package catalog + user-configurable allowlist while preserving default-SMS strict mode API compatibility. |
| 2 | `SmsSettingsScreen` declared `showNotificationDisclosure` and `notificationAccessLauncher` state variables, but rendered **zero Notification Capture card or trigger** in the UI. | Users had no discoverable control to inspect notification access, grant it, choose monitored apps, or pause notification capture. | Rebuilt `SmsSettingsScreen` as **Automatic Transaction Capture** with Notification Capture card, source toggles, real connection state, onboarding dialog, and troubleshooting guide. |
| 3 | `MainActivity` first-launch onboarding launched `SmsDisclosureDialog` (asking for `READ_SMS`/`RECEIVE_SMS`) even on `local` builds where SMS permissions are stripped. | Clicking "Enable Automatic Detection" did nothing on standard builds. | Routed first-launch onboarding transparently by flavor capabilities and direct user consent. |
| 4 | `android/app/src/play/AndroidManifest.xml` was empty while `play` had `SMS_DETECTION_SUPPORTED = true`. | Merged `play` APK still contained `READ_SMS`, `RECEIVE_SMS`, and `SmsReceiver`, violating Google Play SMS Policy. | Updated `play/AndroidManifest.xml` to remove `READ_SMS`, `RECEIVE_SMS`, and `SmsReceiver`, keeping `play` strictly notification + share-sheet compliant. |
| 5 | Cross-source duplicates when GPay notification lacked a UTR while Bank SMS 30s later included a UTR. | One transaction entered the review queue twice (`Notification` + `SMS`). | Added deterministic cross-channel deduplication + metadata enrichment on `(amountPaise, type, merchant/window)` and `refNumber`. |
| 6 | Review notification tap opened `Dashboard` instead of the review queue. | Poor UX friction after tapping `"Transaction alert ready for review"`. | Added intent route deep-linking directly to `sms_review`. |

---

## 4. Android SMS Permission Restrictions (OS Level)

Since **Android 10 (API 29)**, Android classifies `READ_SMS` and `RECEIVE_SMS` as **hard-restricted runtime permissions**:

- **Installer Allowlist Requirement**: Even if an app declares `READ_SMS`/`RECEIVE_SMS` in `AndroidManifest.xml`, Android refuses to grant the permission at runtime unless the **installer on record** explicitly allowlists it via `PackageInstaller.SessionParams.setWhitelistedRestrictedPermissions(...)` or post-install via `PackageManager.addWhitelistedRestrictedPermission(...)`.
- **Browser Sideloading**: Installing an APK directly from Chrome / a file manager uses the system package installer without an SMS allowlist, leaving `READ_SMS`/`RECEIVE_SMS` permanently ungrantable (grayed out or auto-denied) on Android 10+.
- **SpendSense Installer (`com.digitaldodo.arth.installer`)**: Solves the sideloading allowlist constraint cleanly by verifying the `SpendSense-SMS.apk` SHA-256 + signing certificate (`2385b27f...`) and opening a user-confirmed `PackageInstaller.Session` with `setWhitelistedRestrictedPermissions(setOf(READ_SMS, RECEIVE_SMS))` (plus `USER_ACTION_REQUIRED` on Android 12+). It still requires a **separate runtime permission prompt** inside SpendSense; allowlisting alone never grants SMS access.
- **Android 13 (API 33+) "Restricted Settings"**: Sideloaded APKs (installed outside session-based store installers or trusted installers) have Notification Listener and Accessibility toggles locked in System Settings until the user explicitly opens **App Info → (⋮) → Allow restricted settings**.
- **Android 14–15 (API 34–35)**: Enforces stricter background execution, `POST_NOTIFICATIONS` runtime permission (API 33+), and **OTP redaction** on untrusted notification listeners.

---

## 5. Google Play Compatibility Analysis

Under Google Play's **Use of SMS or Call Log permission groups** policy (Support Answer ID `10208820`):

- **`READ_SMS` / `RECEIVE_SMS` Eligibility**: Strictly limited to apps actively registered as the user's **Default SMS Handler**, **Default Assistant**, or narrowly scoped enterprise/connected-device compliance roles.
- **Does SpendSense Qualify?** **No.** Google Play explicitly excludes **Personal Finance Management (PFM), expense tracking, and budgeting apps** from SMS permission exceptions — regardless of user consent, offline processing, or privacy guarantees.
- **Policy Verdict**:
  - `local` and `play` variants **MUST NOT** declare `READ_SMS`, `RECEIVE_SMS`, or `SmsReceiver` in their merged manifests.
  - `directSms` + `installer` is strictly for direct sideload distribution where users explicitly opt into local inbox SMS parsing outside Google Play.
  - Note: Declaring a separate `directSms` flavor does **not** make `READ_SMS` Play-compliant; Play artifacts must be built exclusively from `play` (or `local`).

---

## 6. `NotificationListenerService` Feasibility & Real-World Limits

Android's `NotificationListenerService` (`BIND_NOTIFICATION_LISTENER_SERVICE`) is **Play-policy compliant** when transparently disclosed and explicitly enabled by the user in System Notification Access Settings (`ACTION_NOTIFICATION_LISTENER_SETTINGS`), provided SpendSense strictly limits scope and minimizes data.

### Technical Reality & Constraints
1. **System-Wide Permission vs. App-Level Allowlist**: Android grants notification listening per listener service (not per target app), so disclosure must clearly state that Android exposes active notifications to the service while SpendSense **drops all packages not in the user's allowlist before extraction**.
2. **Content Availability**: Only works when the source app actually posts a visible notification containing amount + transaction verbs.
   - **High Yield**: Google Pay (`com.google.android.apps.nbu.paisa.user`), PhonePe (`com.phonepe.app`), Paytm (`net.one97.paytm`), CRED (`com.dreamplug.androidapp`), BHIM (`in.org.npci.upiapp`), Amazon Pay (`in.amazon.mShop.android.shopping`), and Default SMS/Messages apps (`com.google.android.apps.messaging`, Samsung Messages, etc.) when notification previews are enabled.
   - **Variable Yield**: Banking apps (HDFC, SBI YONO, ICICI iMobile, Axis, Kotak, IDFC) vary — many send silent push marketing or generic *"Update available"* alerts while sending actual debit/credit figures over SMS.
3. **Android 15 Sensitive Content / OTP Redaction**: Android 15 replaces suspected OTP notifications with `"Sensitive notification content hidden"` for non-trusted listeners. `FinancialMessageClassifier` / `TransactionMessageParser` must ignore redacted strings (already handled) and OTPs (desirable privacy behavior).
4. **Lock-Screen Redaction**: If a user sets Android lock-screen notification visibility to *"Hide sensitive content"*, notifications received while locked may expose redacted placeholder text (`"Hidden content"`); `onNotificationPosted` receives extras as configured by notification visibility rules.
5. **Grouped Summary Notifications & Updates**: `FLAG_GROUP_SUMMARY` must be skipped to avoid double-counting summaries + child alerts; updated `sbn` events for the same notification must deduplicate cleanly.
6. **OEM Battery & Background Killers**: MIUI / HyperOS, ColorOS / RealmeUI, OneUI, FunTouchOS frequently throttle background listeners. On disconnect (`onListenerDisconnected`), SpendSense calls `requestRebind(ComponentName(...))` (API 24+) and documents **Unrestricted Battery** troubleshooting in Settings.

---

## 7. SMS Retriever API & SMS User Consent API Limitations

Both APIs live in `com.google.android.gms.auth.api.phone` and require **zero runtime SMS permissions**, making them Play-compliant for **authentication/OTP verification**:

| API | Mechanism | Why Unsuitable for General Expense Capture |
|---|---|---|
| **SMS Retriever API** | Automatically reads a single SMS within a **5-minute** timeout **only if** the SMS text ends with SpendSense's **11-character app hash** (`AppSignatureHelper`). | Indian banks (HDFC, SBI, ICICI, Axis, NPCI/UPI switches) will **never** append SpendSense's custom 11-char app hash to DLT-registered banking SMS templates. Works only for SpendSense's own OTP server. |
| **SMS User Consent API** | Listens for **5 minutes** for one SMS from a sender **not in Contacts** containing a **4–10 character alphanumeric OTP** (with ≥ 1 digit), showing a one-tap user bottom sheet. | Fails cleanly as a passive expense tracker: requires triggering a 5-minute listening session ahead of time, rejects messages without a 4–10 char OTP token, blocks saved contacts, and interrupts the user with a system sheet per message. |

**Conclusion**: Neither API can capture arbitrary historical or ongoing bank transaction SMS messages.

---

## 8. Other Officially Supported Alternatives Researched

1. **Android Sharesheet (`ACTION_SEND` `text/plain`)**:
   - Fully implemented in `MainActivity.kt`. Zero special permissions; user selects any SMS/WhatsApp/email snippet and chooses **Share → SpendSense** -> parsed locally into `SmsReviewScreen`.
2. **RBI Account Aggregator (AA) / Sahamati Open-Banking Framework**:
   - Officially regulated, consent-driven Indian financial API architecture (FIP = Banks, FIU = Regulated Financial Information User, AA = Licensed Aggregators like Finvu / OneMoney / CAMSFinServ / Setu AA).
   - **Status in SpendSense**: Documented as the **strategic long-term bank feed solution**. Requires FIU registration/licensed AA aggregator onboarding, backend key-management/decryption service (ReBIT schema), and Android Custom Tab / deep-link consent redirect. Not represented as live today.
3. **Device-Local Bank Statement Import (CSV / Text / PDF)**:
   - CSV/Text import already exists natively in `StatementImportScreen.kt` (and full PDF/Excel/OCR on Web). Zero sensitive permissions required (`ActivityResultContracts.OpenDocument`).

---

## 9. Supported Financial Application Sources

Curated allowlist catalog (`SupportedNotificationSources`) covering:
- **Default SMS / Messages App** (resolved dynamically via `Telephony.Sms.getDefaultSmsPackage(context)`)
- **UPI & Payment Apps**: Google Pay (`com.google.android.apps.nbu.paisa.user`), PhonePe (`com.phonepe.app`), Paytm (`net.one97.paytm`), CRED (`com.dreamplug.androidapp`), BHIM (`in.org.npci.upiapp`), Amazon Pay (`in.amazon.mShop.android.shopping`)
- **Major Indian Banking Apps**: HDFC Bank (`com.snapwork.hdfc`), SBI YONO (`com.sbi.lotusintouch`), ICICI iMobile (`com.csam.icici.bank.imobile`), Axis Mobile (`com.axis.mobile`), Kotak Mahindra (`com.msf.kbank.mobile`), IDFC FIRST (`com.idfcfirstbank.optimus`), Bank of Baroda (`com.bankofbaroda.mconnect`)

User controls exactly which categories/packages are enabled; unknown/unrelated packages (WhatsApp, Instagram, Gmail promotions, etc.) are dropped immediately before text extraction unless explicitly permitted by the default SMS handler match.

---

## 10. Security & Privacy Architecture

- **No Raw Message Retention**: `SmsSuggestionEntity.rawSnippet` stays `null`; raw SMS/notification strings exist only in memory during parsing and are never written to Room, SharedPreferences, Android Logcat, or backend APIs.
- **No Unreviewed Cloud Uploads**: Captured items remain local `PENDING` candidates in `sms_suggestions`. Only after explicit user confirmation (`SmsReviewScreen`) is a normalized `Transaction` written to `transactions` and queued in `sync_outbox`.
- **OTP & Auth Exclusion**: OTPs, secret codes, login alerts, balance-only alerts, mandates/reminders, and failed transactions are discarded before storage.
- **Account Isolation & Explicit Consent**: Android system notification access disclosure explicitly explains that OS-level permission exposes notifications from all apps while SpendSense filters strictly in memory to the allowlist. Consent requires an explicit affirmative tap on *"Open Android Settings"* (dismissal is never treated as consent).
- **Zero Prohibited Techniques**: No root access, no hidden APIs, no `AccessibilityService` misuse, no scraping other apps' storage.

---

## 11. Recommended Distribution Strategy

| Distribution Track | Build Flavor | Capture Mechanisms Active | Review Requirement |
|---|---|---|---|
| **Google Play Store** | `playRelease` | 1. Notification Capture (`NotificationListenerService` + curated bank/UPI/SMS allowlist)<br>2. Android Share Sheet (`ACTION_SEND`)<br>3. Bank Statement Import | `READ_SMS` & `RECEIVE_SMS` removed from merged manifest. |
| **Standard Website APK** | `localRelease` | Same as `playRelease` (Notification Capture + Share Sheet + Statement Import) | Standard APK install without SMS permissions. |
| **Direct SMS Helper Channel** | `directSmsRelease` + `SpendSense-Installer.apk` | All of the above **plus** `SmsReceiver` (live SMS) & `SmsInboxScanner` (historical inbox scan) | Installer verifies SHA-256 + cert, allowlists `READ_SMS`/`RECEIVE_SMS`; user separately grants runtime SMS permission. |

---

## 12. Known Limitations

1. Notification capture cannot detect transactions when a bank does not emit notifications, notification previews are hidden/redacted by OS/lock-screen rules, or Android 13+ *"Restricted settings"* has not been unlocked for sideloaded APKs.
2. OEM battery managers (Xiaomi/Redmi/Realme/Vivo/Oppo/Samsung Sleeping Apps) may unbind `NotificationListenerService` until the user sets Battery to **Unrestricted**.
3. Physical-device hardware testing on an Android phone with real carrier SMS and live bank notifications has not yet been executed in this local workspace (no physical device/AVD attached); behavior is covered by JVM unit tests and manifest/build checks.

---

## 13. Primary Official Sources (Verified 2026-11-27)

1. Android Developers — [`NotificationListenerService`](https://developer.android.com/reference/android/service/notification/NotificationListenerService)
2. Android Developers — [Android 15 Behavior Changes: Security & Privacy (OTP Notification Redaction)](https://developer.android.com/about/versions/15/behavior-changes-all)
3. Android Developers — [`READ_SMS` Hard-Restricted Permission & `PackageInstaller.SessionParams.setWhitelistedRestrictedPermissions`](https://developer.android.com/reference/android/content/pm/PackageInstaller.SessionParams#setWhitelistedRestrictedPermissions(java.util.Set))
4. Google Play Console Help — [Use of SMS or Call Log permission groups (Answer ID `10208820`)](https://support.google.com/googleplay/android-developer/answer/10208820)
5. Android Developers — [Default Handlers Policy Guide](https://developer.android.com/guide/topics/permissions/default-handlers)
6. Google Developers — [SMS Retriever API Overview](https://developers.google.com/identity/sms-retriever/overview) & [SMS User Consent API](https://developers.google.com/identity/sms-verification/user-consent/overview)
7. Reserve Bank of India / Sahamati — [Account Aggregator Ecosystem Documentation](https://sahamati.org.in/)
