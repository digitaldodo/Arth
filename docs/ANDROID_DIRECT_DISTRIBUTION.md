# SpendSense Android direct distribution

This runbook covers the native Android APK available from the SpendSense website. The web application and installable PWA remain separate and continue to use the existing backend, authentication, and records.

## Stable release identity

| Setting | Value |
| --- | --- |
| Customer-facing name | SpendSense |
| Android application ID | `com.digitaldodo.arth` |
| Android namespace | `com.digitaldodo.arth` |
| Minimum Android | Android 8.0 / API 26 |
| Target Android | Android 15 / API 35 |
| Direct distribution flavor | `localRelease` |
| Stable APK name | `SpendSense.apk` |
| Website page | `/download` |
| Stable GitHub Release tag | `android-latest` |
| Source repository | `digitaldodo/Arth` (private) |

Keep the application ID and release signing identity unchanged for every future release. The release workflow refuses to generate a replacement signing key. Updating in place with Android's system installer preserves the installed package's private database, auth session, and preferences; users must not uninstall first. The download and update UI does not perform a silent install.

## Signing key storage, backup, and recovery

The existing release keystore is outside the repository at `%LOCALAPPDATA%\Arth\signing\release.jks`. CI receives it through these GitHub Actions secrets:

| Secret | Purpose |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded release keystore |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Key alias (`arth`) |
| `ANDROID_KEY_PASSWORD` | Private key password |

Before releasing, maintain two independent encrypted offline backups: one of the keystore and one of the credentials, stored separately from the development workstation and repository. Restrict recovery access to the maintainers who must sign production updates. Test a restore by checking the keystore certificate with `keytool -list -v`; compare its SHA-256 fingerprint to the current website release metadata. Do not paste passwords or base64 material into source files, issues, or logs.

Recovery steps:

1. Restore the JKS into a protected directory outside the checkout.
2. Restore its passwords through the approved secret manager and rotate GitHub Actions secrets if access may have been exposed.
3. Confirm the certificate fingerprint matches the most recent published release.
4. Run the signing and package verification commands below before publishing.

If the signing key is lost, Android will reject updates signed by a replacement. Do not silently replace it; plan a separately documented migration that explains the reinstall and local-data consequences.

Never commit the keystore, passwords, base64 value, local credential backup, or APK binary. `.gitignore` excludes local signing materials and build outputs.

## Build and verify

The CI workflow is `.github/workflows/android-release.yml`. It checks the persistent signing secrets, runs the Android unit suite, builds `localRelease`, verifies APK signature/package/version and rejects `READ_SMS`, `RECEIVE_SMS`, and `SEND_SMS`, then computes a SHA-256 checksum. It uploads `SpendSense.apk`, `SpendSense.apk.sha256`, and `release.json` to both the stable release and an immutable versioned release.

Local build, when Android SDK 35 and the protected signing credentials are available:

```powershell
$env:ANDROID_KEYSTORE_PATH = 'C:\Users\<user>\AppData\Local\Arth\signing\release.jks'
$env:ANDROID_KEYSTORE_PASSWORD = '<from protected credential backup>'
$env:ANDROID_KEY_ALIAS = 'arth'
$env:ANDROID_KEY_PASSWORD = '<from protected credential backup>'
Set-Location android
.\gradlew.bat :app:testLocalDebugUnitTest :app:assembleLocalRelease
```

Inspect the resulting APK before publication:

```powershell
$apk = 'app\build\outputs\apk\local\release\app-local-release.apk'
apksigner verify --verbose --print-certs $apk
aapt dump badging $apk
aapt dump permissions $apk
Get-FileHash $apk -Algorithm SHA256
```

Check that the package remains `com.digitaldodo.arth`, the version code increases, the signer fingerprint matches the previous release, and no SMS inbox permissions appear. Do not check the APK into Git.

The workflow defaults to version `1.4.0` and generates a monotonically increasing version code above the last published code. A release must use a semantic `version_name` and a version code greater than the current stable release when overriding those defaults.

## Website download and update flow

The private GitHub repository is not directly downloadable by public visitors. The `/download` page requests release details from `/api/android/release`; the server uses a read-only `GITHUB_TOKEN` and `GITHUB_REPOSITORY=digitaldodo/Arth` to verify the stable assets and return public metadata. `/api/android/download` resolves the APK asset over HTTPS and never sends the token to the browser. Vercel Production must retain the user's configured, repo-scoped read-only token.

The release page shows version, file size, release date, release notes, minimum Android version, checksum, signing certificate fingerprint, install steps, privacy link, and an explicit separation between the native app and web/PWA. The Android update checker compares release metadata, then sends the user to download the APK. Android's own installer requires user confirmation.

GitHub Releases is the selected initial host because this repository already builds immutable version archives and checksums. If download scale or rate limits become material, reassess Cloudflare R2, Vercel Blob, or Supabase Storage with actual usage estimates and migration testing.

## SMS/message import compatibility

The APK supports opt-in transaction detection from visible notifications posted by the user's current default Messages app. The user must grant Android Notification access and enable detection in SpendSense. The app filters other notification packages, parses text on-device, discards raw message text, and places recognized fields in the review queue. OTPs and unrecognized messages are rejected. When notification previews are hidden or unavailable, the user can share a selected message to SpendSense for review.

This direct APK does not read inbox/history or receive SMS broadcasts. `READ_SMS` and `RECEIVE_SMS` are hard-restricted permissions. The website download plus system installer flow cannot set the PackageInstaller installer allowlist, and an allowlist would permit but not itself grant a restricted permission. Notification access is a user-approved, separate Android setting and works only with visible notifications from the default Messages app. The app does not become a default SMS client or use a custom installer. Manual message sharing and statement imports remain available as fallbacks.

More detail and primary Android references are in [`ANDROID_PRIVACY_AND_PLAY_POLICY.md`](../ANDROID_PRIVACY_AND_PLAY_POLICY.md).

## Physical-device verification status

No physical Android device was available for this implementation, so no physical install, share-sheet, sign-in, update-over-install, or local-data preservation test is reported as passed. Before calling device acceptance complete, install the signed APK on a supported Android phone, test share-to-review and explicit confirmation, verify login and existing ledger data, then install a higher-version APK over it and verify the same local records remain. Record device model, Android version, APK version, signer fingerprint, and observed outcomes. A build or emulator run does not substitute for a physical-device test.
