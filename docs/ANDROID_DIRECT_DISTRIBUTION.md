# Arth Android Direct Distribution

This runbook covers the signed Android APK delivered from the Arth website. The website and installable PWA remain available as separate products. The direct APK is built from the `localRelease` flavor and intentionally contains no SMS inbox permissions.

## Release identity

| Setting | Value |
| --- | --- |
| Android application ID | `com.digitaldodo.arth` |
| Namespace | `com.digitaldodo.arth` |
| Minimum Android | 8.0 / API 26 |
| Target Android | 15 / API 35 |
| Direct distribution flavor | `localRelease` |
| APK filename | `Arth.apk` |
| Release host | Private GitHub Releases, reached from the website through a server-side HTTPS redirect |

The stable application ID and release signing key must remain unchanged. Android then treats a downloaded APK as an in-place update and keeps app-private Room data, authentication tokens, and preferences. Arth only starts the Android package installer after the user chooses **Download update**; Android presents the install confirmation and no update is installed silently.

## Existing direct release transition

The previously published APK is `com.digitaldodo.arth.local` and has signing certificate SHA-256 `36:CD:16:E7:F8:47:60:94:A4:CE:F0:68:B4:A3:F6:90:F2:27:E2:B8:C0:AA:29:3E:86:3C:75:39:A6:05:AA:6C`. It was produced by an older workflow that generated a one-run signing key when the release secret was missing. That private key is not available for future releases. Android cannot update that installation with the new production identity `com.digitaldodo.arth`.

The first production APK installs alongside the old app and leaves its local data untouched. Existing users should keep the old app installed until its pending data has synced to their Arth account and they have confirmed that data in the new app. Do not uninstall the old package as part of this release. The new package ID and new signing key are permanent from this production release forward. Subsequent releases must use both unchanged.

## Signing key storage and recovery

The production JKS is stored outside this repository at `%LOCALAPPDATA%\Arth\signing\release.jks`. The keystore and key passwords are generated randomly, stored in GitHub Actions secrets, and kept locally as a Windows DPAPI-encrypted value in `%LOCALAPPDATA%\Arth\signing\password.dpapi`. That encrypted password file can only be decrypted by the same Windows user on the same machine. Copy the keystore and an independently held password backup to encrypted offline storage before making the first production release.

Repository Actions secrets required by the release workflow:

| Secret | Contents |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | Base64 encoding of the production `release.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | JKS store password |
| `ANDROID_KEY_ALIAS` | `arth` |
| `ANDROID_KEY_PASSWORD` | Private key password |

To restore a backup on Windows, place it in a protected directory, set `ANDROID_KEYSTORE_PATH`, decrypt the password backup with the same Windows user, and provide the four values to Gradle or update the GitHub Actions secrets. To check the identity without exposing the private key, run `keytool -list -v -keystore release.jks -alias arth` and compare the SHA-256 certificate fingerprint with the website's release metadata. Never commit the JKS, password, base64 encoding, or DPAPI file. If the JKS is lost, Android will not accept future APKs as updates; retain the current app and publish a new package only with a documented migration.

The workflow refuses to make an unsigned release or silently generate a replacement key. It verifies the signature and certificate, package name, version metadata, and absence of SMS permissions before publishing.

## Build a release locally

Install JDK 17 or newer and Android SDK Platform 35. Supply the key path and secrets through the process environment or a local ignored properties file; never place passwords in source control.

```powershell
$env:ANDROID_KEYSTORE_PATH = 'C:\Users\<user>\AppData\Local\Arth\signing\release.jks'
$env:ANDROID_KEYSTORE_PASSWORD = '<from protected backup>'
$env:ANDROID_KEY_ALIAS = 'arth'
$env:ANDROID_KEY_PASSWORD = '<from protected backup>'
cd android
.\gradlew.bat :app:testLocalDebugUnitTest :app:assembleLocalRelease
```

The APK is produced at `android/app/build/outputs/apk/local/release/app-local-release.apk`. Check its identity and integrity before distributing:

```powershell
$apk = 'app-local-release.apk'
apksigner verify --verbose --print-certs $apk
aapt dump badging $apk
aapt dump permissions $apk
Get-FileHash $apk -Algorithm SHA256
```

Confirm the package is `com.digitaldodo.arth`, the expected version code is present, and neither `READ_SMS`, `RECEIVE_SMS`, nor `SEND_SMS` appears in the manifest. Do not copy the APK into the Git repository.

## Automated publishing

The GitHub Actions workflow runs for Android release changes merged to `main` and can also be started manually. It increments the Android version code above the last published value, builds and signs `localRelease`, verifies the APK, and attaches `Arth.apk`, `Arth.apk.sha256`, and `release.json` to both the stable `android-latest` release and an immutable versioned release. A failed build or verification does not replace the latest release.

Version name uses semantic versioning (for example `1.3.0+build.19`). Version code must increase with every release. If overriding it manually, choose a number greater than the currently published value.

## Website delivery and hosting choice

The Arth repository is private, so a direct browser link to its GitHub release cannot serve public visitors. The website API uses a read-only GitHub token server-side to find the private release asset, then redirects the user's browser to GitHub's short-lived HTTPS asset URL. The token is never sent to the browser. Configure `GITHUB_TOKEN` in the Vercel production, preview, and development environments with read-only access to release assets in `digitaldodo/Arth`; set `GITHUB_REPOSITORY=digitaldodo/Arth` if using a different repository name. The production website must have this token before removing its previously bundled APK fallback.

GitHub Releases is selected for the initial low-volume release because it already provides immutable version history, checksums, download counts, and the release automation in this repository. Keeping the repository private requires the authenticated website redirect described above. Vercel Blob offers simpler public URLs but adds per-download transfer charges and storage credentials. Cloudflare R2 has an attractive no-egress storage model but needs a separate bucket, custom public domain, and publishing credentials. Supabase Storage fits the existing backend but couples public app downloads to the financial data platform and its storage/egress configuration. Revisit R2 if direct downloads grow enough that GitHub release delivery or rate limits become a concern.

## Website release page

The page at `/download` displays the current release version, release date, APK size, minimum Android level, release notes, checksum, signing certificate fingerprint, user-confirmed installation instructions, and a privacy link. It states clearly that this is the Android app and that the web app/PWA remain separate. Release information is served from the signed release metadata, not a hard-coded old version.

## SMS permission compatibility

The direct `localRelease` manifest removes `READ_SMS` and `RECEIVE_SMS`, including declarations inherited from the shared manifest. Its SMS feature flag is false, and the SMS receiver is removed from the merged manifest. The release workflow inspects the final APK and fails if an SMS permission appears.

Android documents [`READ_SMS`](https://developer.android.com/reference/android/Manifest.permission#READ_SMS) and [`RECEIVE_SMS`](https://developer.android.com/reference/android/Manifest.permission#RECEIVE_SMS) as hard-restricted: the app cannot hold them unless its installer allowlists them. [`PackageInstaller.SessionParams.setWhitelistedRestrictedPermissions()`](https://developer.android.com/reference/android/content/pm/PackageInstaller.SessionParams#setWhitelistedRestrictedPermissions(java.util.Set%3Cjava.lang.String%3E)) is an installer-side capability. Allowlisting only permits the app to hold the permission; it does not grant the runtime permission. A website cannot set this allowlist. In this flow, the browser downloads the APK and hands installation to the device's Android package installer. Android versions and OEM installers can differ in whether that installer allowlists restricted permissions for user-initiated sideloads. The project has no physical-device evidence for that behavior, so it cannot claim the path will grant SMS access. The production direct APK removes the permissions and does not support SMS inbox detection. Notification access remains separate, user-enabled access and is not described as SMS compatibility.

An Android distribution store can act as installer of record and may allowlist restricted permissions for an eligible application under that store's rules. A managed Android administrator/installer can also configure installation-time permissions for managed devices. Those channels require their own platform eligibility, policy, and device verification; neither is configured for this website release. The secure supported fallback is consent-based Account Aggregator ingestion or statement import. Do not root devices or tell users that a manifest declaration alone enables SMS.

Legitimate consumer alternatives are to distribute through an eligible app store that accepts the required permission declaration, use consent-based Account Aggregator integration, or import bank statements. Do not ask users to root their devices or claim SMS detection works because the permission is present in a manifest.

## Physical device verification

Connect a device running Android 8.0 or newer with USB debugging enabled. Install the production APK with `adb install`, launch Arth, test sign-in, ledger read/write, offline data, and then install a higher-version APK using `adb install -r`. Confirm the app's local records and authentication remain. In Android settings or with `adb shell dumpsys package com.digitaldodo.arth`, confirm there are no SMS permissions. Record model, Android version, APK version, install/update result, and observed data retention in the release record. An emulator or successful APK build is not a substitute for physical-device verification.
