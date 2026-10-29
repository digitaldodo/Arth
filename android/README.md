# Arth Android notification companion

The Android module now contains a native notification-listener companion alongside the existing Trusted Web Activity. The existing TWA remains the launcher; its **Automatic transaction detection** settings action opens the native companion, and notifications open the native review screen. **Open Arth** in the companion returns to the web application. The companion requires Android 6.0 (API 23) or later.

## Configure and build

Use JDK 17, Gradle 8.13, Android Gradle Plugin 8.13.2, and Android SDK Platform 36. The project targets Android 16/API 36 for current Google Play submission requirements. Supply these non-secret build values as Gradle properties (`-P...`) or environment variables:

| Name | Value |
| --- | --- |
| `ARTH_SUPABASE_URL` | The existing Supabase project URL (`https://…supabase.co`) |
| `ARTH_SUPABASE_ANON_KEY` | The project’s public anon/publishable key; never use the service-role key |
| `ARTH_API_URL` | The HTTPS origin serving Arth’s Next.js BFF, such as `https://arth-9h3f.vercel.app` |

The repository currently omits `gradle-wrapper.jar`, so its `gradlew.bat` falls back to an installed `gradle` executable. From PowerShell with Gradle 8.13 on `PATH`:

```powershell
cd android
gradle testDebugUnitTest assembleDebug `
  -PARTH_SUPABASE_URL=https://YOUR_PROJECT.supabase.co `
  -PARTH_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY `
  -PARTH_API_URL=https://YOUR_ARTH_HOST
```

Install the debug APK on a connected device or emulator:

```powershell
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Do not commit populated `local.properties`, generated APKs, signing files, or credentials. A release build should use the existing Android signing environment variables documented by the Android Gradle configuration.

## First-run setup

1. In the Arth Android app, open **More & Settings → Automatic transaction detection → Open Android detection settings**. Sign in to the companion with the same Arth email/password account. The companion exchanges credentials only with Supabase Auth over HTTPS. Google-only accounts must first set a password through Arth’s existing account recovery flow; this companion does not implement a separate OAuth client.
2. Select **Open notification access settings**, find Arth, and grant access in Android Settings. Android requires the user to grant this special access; Arth cannot enable it programmatically.
3. On Android 13 and later, grant **transaction review alerts** when asked. Android also lets the user disable Arth’s app notifications or the review-alert channel separately; the companion reports these alert settings as unavailable.
4. Return to the companion and enable automatic detection.
5. Select only the bank, UPI, wallet, or SMS applications whose visible notifications you want Arth to inspect. The available installed apps are device-specific.
6. Keep **Hide merchant and amount on the lock screen** enabled for generic alerts. Select **Refresh categories for offline review** while connected so an offline review can still use your existing Arth categories.
7. Review each candidate. Fill missing fields, choose the category and (for expenses) necessity, then select **Confirm and add**. Ignore removes a candidate from review.

Pending structured candidates are stored in the app-private SQLite database for 7, 30 (default), or 90 days, according to Settings. Raw notification text is parsed in memory and is not stored or uploaded. The listener stores selected package names, an opaque hash of the Android notification key, extracted fields, field provenance, and a duplicate fingerprint. Android app-private storage plus disabled app backup protects this local data. Sign out disables monitoring; disabling monitoring stops candidate processing. **Clear pending candidates** removes all unconfirmed candidates.

## Authentication, save, and offline behavior

Supabase access and refresh tokens are stored in AndroidX encrypted shared preferences backed by Android Keystore. The app uses the existing authenticated BFF endpoints:

- `GET /api/native/categories`
- `GET /api/native/transactions` (bounded, same-day lookup for a possible-match warning)
- `POST /api/native/transactions`

The BFF validates the bearer token with Supabase Auth, derives the user identity from that verified token, and proxies the request to the existing Fastify endpoints. It strips any body `user_id`; Fastify validates transaction fields and ownership, preserves UUID v7 idempotency, and the PostgreSQL transaction trigger creates the normal Sheets outbox event. When a provider reference is available, the confirmed reference is saved in transaction notes (the current transaction schema has no reference column) so a later notification can warn about the likely duplicate; raw notification text is never saved. The BFF also starts the same best-effort outbox drain used by web transaction creation. The companion contains no privileged backend/database key and never writes directly to Supabase tables.

Detected candidates never enter the ledger automatically. Pending detections and confirmed-but-unsynced payloads are scoped to the verified Supabase user on the device, so switching accounts cannot expose or submit another user’s queue. After confirmation, the structured transaction payload and one UUID v7 are kept locally until WorkManager can reach the HTTPS BFF. Network retries reuse that same payload and ID; the backend’s existing idempotent create protects retries. The companion only shows “waiting to sync” until the server accepts it. This is a small native queue, not a claim that the web PWA’s Phase 03 IndexedDB outbox is already available or shared with Android.

## Detection behavior and limits

The local parser recognizes common rupee/INR amounts, debit/credit wording, UPI, card and bank-transfer hints, reference/UTR labels, common numeric and month-name dates, and message times. It distinguishes completed debit, completed credit, refund/reversal, pending, failed, payment request, promotional/nonfinancial, and unknown content. Completed debit/credit/refund events and amount-bearing ambiguous transaction-like notices may enter the review queue; only user-confirmed records enter the ledger. Ambiguous candidates require an explicit transaction type. No category or necessity is guessed. Refunds are presented as income under Arth’s current income/expense model and tagged in transaction notes as refunds.

Notification content is untrusted and app formats vary. Arth ignores unselected packages, group summaries, ongoing notifications, redacted/empty text, and promotional/OTP-only content. Repeated notification updates are deduplicated by notification key and update the same quiet review alert; dismissing the source notification does not delete its local review candidate. A matching provider reference is treated as a strong duplicate; otherwise, candidates are retained separately and matching amount/date/direction values trigger a possible-match warning for the user. The local merchant-aware fingerprint is not used to silently discard a potentially legitimate repeat purchase. Package selection is an allowlist, not a promise that each selected bank/provider is compatible.

The manifest requests `POST_NOTIFICATIONS` for Arth’s own review alerts on Android 13 and later, separately from Android’s special notification-listener access. The implementation intentionally does not request `READ_SMS`, `RECEIVE_SMS`, or inbox access. An SMS is detectable only when the SMS app displays its content in a visible notification and the user selected that app. Disabled notification delivery, Android redaction, notification/alert permission revocation, device/OEM background restrictions, work profiles, or provider-specific hidden content can prevent detection. The service asks Android to rebind after disconnect; Android controls service lifecycle and can still delay or suppress callbacks.

Google Play restricts SMS/Call Log permissions to limited eligible roles/use cases. Notification access is a separate Android special access and still requires prominent disclosure and user consent. Review the current [Android NotificationListenerService reference](https://developer.android.com/reference/android/service/notification/NotificationListenerService) and [Google Play SMS/Call Log permission policy](https://support.google.com/googleplay/android-developer/answer/10208820) before distribution. The app manifest does not declare SMS permissions.

## Tests

The parser has synthetic JUnit fixtures in `app/src/test`. Run `./gradlew.bat testDebugUnitTest` and build with `./gradlew.bat assembleDebug` using the SDK above. Android service/settings flows also need device testing: grant/revoke notification access, post/update/remove notifications from selected and unselected apps, test redacted/grouped/ongoing notices, and retry a confirmed item offline before expecting it in the Arth ledger.
