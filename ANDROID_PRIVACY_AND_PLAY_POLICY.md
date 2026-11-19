# Android SMS compatibility and distribution report

## Current direct-download APK behavior

The website-distributed SpendSense APK supports **opt-in automatic detection from visible notifications** emitted by the user's current default Messages app. The user explicitly grants Android Notification access and then enables detection in SpendSense. App code filters out other packages before parsing. Recognized fields are stored as a review candidate; raw message text is discarded. The user must review and confirm before a ledger transaction is created. User-selected message sharing remains the fallback, including for older messages or hidden previews.

The website release uses the `local` flavor. Its merged APK manifest does **not** declare `READ_SMS` or `RECEIVE_SMS`, does not read the inbox, does not receive incoming-SMS broadcasts, and does not scan message history. The app registers a system-protected `NotificationListenerService`; Android requires the user to approve access in Settings. While opted in, SpendSense handles only visible notifications from the current default Messages app. It parses content in memory, stores recognized transaction fields in the existing review queue, and discards the source text. The share target uses Android's normal `ACTION_SEND` / `text/plain` flow and asks for no SMS permission.

Detection depends on a visible message preview and Android binding the listener. If previews are disabled, the Messages app is not the default, the OS redacts the content, or a device policy blocks notification listeners, automatic detection cannot see that message. Android 15 also redacts OTP notification content from untrusted listeners; the classifier discards OTP text. The manual share flow remains available.

The base manifest and existing `play` flavor retain the pre-existing SMS receiver and opt-in UI. The website release includes two app builds: the standard `local` flavor removes inbox permissions, while `directSms` retains them for installation by the separate SpendSense Installer.

## Why inbox access is not enabled

Android marks both `READ_SMS` and `RECEIVE_SMS` hard-restricted. An app cannot hold a hard-restricted permission until the installer on record allowlists it. `PackageInstaller.SessionParams.setWhitelistedRestrictedPermissions()` can set that installer allowlist, but allowlisting only permits holding a restricted permission; it does not itself grant a runtime permission. The website APK flow cannot set that allowlist, so the `local` flavor removes those declarations and its SMS broadcast receiver. Notification access is a separate user-controlled Android setting and supports visible notifications without inbox permissions.

An ordinary APK hosting service (Vercel, Cloudflare R2, Supabase Storage or GitHub Releases) only delivers bytes over HTTPS; it does not become the Android installer or set permission allowlists. The browser/system installer path does not set the allowlist. The optional SpendSense Installer creates a PackageInstaller session itself and sets an allowlist for only READ_SMS and RECEIVE_SMS on Android 10 and newer. It verifies the APK checksum, app ID, requested permissions and signing certificate before creating the session. It requires the user to enable installs from this source and to confirm Android's install/update dialog. Android still requires a separate runtime grant inside SpendSense. No updates are installed silently.

## Alternatives considered

| Channel | SMS access result | Product decision |
|---|---|---|
| Website + browser/system APK installation | No installer-controlled hard-restricted-permission allowlist in this product flow | Use opt-in notification access for visible default Messages alerts; retain share/import and statement/PDF fallback |
| Custom installer using PackageInstaller | Supports an explicit, verified install session and allowlisting; Android still requires user-confirmed installation and a separate runtime permission grant | Implemented as an optional signed SpendSense Installer; standard APK remains notification-only |
| Google Play | Current SMS/Call Log policy requires SMS permissions users to be the default SMS or Assistant handler, and the app would need to meet all applicable policy criteria | Not adopted; SpendSense is not an SMS client and will not become the default SMS handler just to obtain inbox access |
| Account Aggregator / bank data provider | Consent-based financial data channel, subject to FIU/provider onboarding, consent and certification | Team-owned integration scaffold; not represented as a production connection |
| Notification access / user-selected message share / bank statement import | Android notification access is system-approved; app filters to the default Messages app; share/file imports are user-selected | Supported opt-in detection with manual fallbacks for this direct APK |

No rooting, ADB privilege trick, hidden API, installer spoofing, default-SMS-role claim, or user security weakening is used. The optional inbox path works only when the helper is the installer performing the PackageInstaller session and the user separately grants runtime permission. A direct browser installation remains notification-only.

## Verification status

- Merged manifests and APKs must be checked in CI: `localRelease` removes `READ_SMS`, `RECEIVE_SMS`, and `SMS_RECEIVED`; `directSmsRelease` retains the existing declarations and receiver; the installer requests `REQUEST_INSTALL_PACKAGES` but no SMS permission.
- App code: notification and share inputs are bounded, parsed in memory, deduplicated, and stored as review candidates with `rawSnippet = null`. Notification capture accepts only the current default SMS app package and only while the user-enabled switch is on. Confirming a candidate uses the existing transaction repository and sync outbox; no database migration or alternate transaction table was added.
- Release artifacts: the current CI workflow is configured to verify all package names, signing identities and permission boundaries, and publish checksums for the standard APK, SMS-enabled APK and installer. This WIP change has not yet produced a new signed release artifact.
- Physical device: no Android device is currently attached, and the user confirmed none was available. Installer allowlisting, user runtime permission, inbox processing and update-over-install remain unverified on hardware.

## Maintainer checks

For a built release, inspect the merged manifest and APK rather than trusting source declarations:

```powershell
apkanalyzer manifest permissions path\to\SpendSense.apk
apkanalyzer manifest print path\to\SpendSense.apk
adb install -r path\to\SpendSense.apk
adb shell dumpsys package com.digitaldodo.arth
```

Check that neither restricted SMS permission appears, that a share target opens from Messages, a bank transaction enters review, invalid/OTP text is rejected, no raw body is present in local candidate storage, and confirming a reviewed candidate creates exactly one existing-ledger transaction. Run the same-signature update test over an existing install to confirm app-private and database records survive.

## Official references

- Android documents `READ_SMS` as hard-restricted and ties the allowlist to the installer on record: https://developer.android.com/reference/android/Manifest.permission#READ_SMS
- `PackageInstaller.SessionParams` documents installer allowlisting and clarifies that allowlisting does not grant the permission: https://developer.android.com/reference/android/content/pm/PackageInstaller.SessionParams#setWhitelistedRestrictedPermissions(java.util.Set)
- Android documents the user-approved `NotificationListenerService` lifecycle and manifest registration: https://developer.android.com/reference/android/service/notification/NotificationListenerService
- Android 15 redacts OTP notification content from untrusted listeners: https://developer.android.com/about/versions/15/behavior-changes-all
- Google Play SMS and Call Log permission policy: https://support.google.com/googleplay/android-developer/answer/18265346
