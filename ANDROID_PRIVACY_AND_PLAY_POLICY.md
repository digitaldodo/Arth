# Android SMS compatibility and distribution report

## Current direct-download APK behavior

The website-distributed SpendSense APK supports **user-selected SMS import**. From the device's Messages app, the user chooses Share and selects SpendSense. The app parses the shared text on-device, keeps only a recognized transaction candidate (amount, direction, bank/merchant, reference, timestamp and confidence), discards the raw message text, and requires the user to review before creating a ledger transaction. Potential duplicates are rejected from the candidate path.

The direct APK does **not** declare `READ_SMS` or `RECEIVE_SMS`, does not read the inbox, does not receive incoming-SMS broadcasts, and does not scan message history. Its Settings copy says so. The share target uses Android's normal `ACTION_SEND` / `text/plain` flow and asks for no SMS permission. This is functional message import, not automatic SMS detection.

## Why inbox access is not enabled

Android marks both `READ_SMS` and `RECEIVE_SMS` hard-restricted. An app cannot hold a hard-restricted permission until the installer on record allowlists it. `PackageInstaller.SessionParams.setWhitelistedRestrictedPermissions()` can set that installer allowlist, but allowlisting only permits holding a restricted permission; it does not itself grant a runtime permission. The current delivery route is a website download followed by Android's user-confirmed package installer. SpendSense does not control that installer session and cannot request that it set the allowlist, so manifest declarations or a runtime prompt would not make automatic SMS work on this route. We removed those permission declarations and the SMS broadcast receiver from the installed APK instead of presenting a misleading permission screen.

An ordinary APK hosting service (Vercel, Cloudflare R2, Supabase Storage or GitHub Releases) only delivers bytes over HTTPS; it does not become the Android installer or set permission allowlists. The existing update action opens the release/download URL and leaves the APK installation to Android's system UI. It does not silently install updates.

## Alternatives considered

| Channel | SMS access result | Product decision |
|---|---|---|
| Website + browser/system APK installation | No installer-controlled hard-restricted-permission allowlist in this product flow | Keep inbox permissions out; support explicit share/import and statement/PDF import |
| Custom installer using PackageInstaller | API exposes installer allowlisting, but needs a controlled install session and still does not equal a permission grant; adds a high-trust installer surface and security burden | Not introduced; no custom installer app or bypass |
| Google Play | Current SMS/Call Log policy requires SMS permissions users to be the default SMS or Assistant handler, and the app would need to meet all applicable policy criteria | Not adopted; SpendSense is not an SMS client and will not become the default SMS handler just to obtain inbox access |
| Account Aggregator / bank data provider | Consent-based financial data channel, subject to FIU/provider onboarding, consent and certification | Team-owned integration scaffold; not represented as a production connection |
| User-selected message share / bank statement import | User chooses each message/file; no inbox-wide SMS permission | Supported and preferred for this direct APK |

No rooting, ADB privilege trick, hidden API, installer spoofing, or user security weakening is proposed. If automatic SMS becomes a hard product requirement, it requires choosing a channel and product role that legitimately supports the required installer permissions and platform policies; a generic sideloaded APK cannot promise that capability. A default-SMS-handler implementation would be a separate, substantial product scope, not a permission workaround.

## Verification status

- Source manifests for the release flavor: inspected; `READ_SMS`, `RECEIVE_SMS`, and `SMS_RECEIVED` receiver are absent. The manifest accepts only a user share intent.
- App code: share input is bounded, parsed in memory, deduplicated, and stored as a review candidate with `rawSnippet = null`. Confirming a candidate uses the existing transaction repository and sync outbox; no database migration or alternate transaction table was added.
- Release APK/device: the previously published APK was verified for package, signer, signature, and absence of SMS permissions. The current SpendSense-branded/share-import build requires a new signed release before this exact implementation is in a published binary.
- Physical device: no ADB device was available in the workstation session. The user also confirmed there is no physical test device. Share-sheet interoperability, OS installer behavior, and permission state therefore remain unverified on a physical device; do not report that test as passed.

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
- Google Play SMS and Call Log permission policy: https://support.google.com/googleplay/android-developer/answer/18265346
