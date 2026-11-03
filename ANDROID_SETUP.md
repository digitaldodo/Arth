# Arth Native Android App — Build & Setup Guide

Arth Android is a native Kotlin + Jetpack Compose application designed for offline-first personal financial management, featuring bank & UPI transaction parsing, Room database caching, WorkManager cloud synchronization, and biometric security.

---

## 1. Dual Build Configurations & Product Flavors

To resolve Google Play Protect security warnings during direct APK sideloading while preserving full SMS detection for official Play Store releases, the Android project utilizes Gradle `productFlavors`:

| Variant | Application ID | SMS Permissions | Target Use Case | Play Protect Status |
|---|---|---|---|---|
| **`localDebug`** | `com.digitaldodo.arth.local.debug` | **None** (0 SMS permissions) | Personal physical device testing & sideloading | **100% Clean** (No warnings or blocks) |
| **`localRelease`** | `com.digitaldodo.arth.local` | **None** (0 SMS permissions) | Optimized local sideload installation | **100% Clean** (No warnings or blocks) |
| **`playDebug`** | `com.digitaldodo.arth.debug` | `RECEIVE_SMS`, `READ_SMS` | Private testing of SMS detection flow | Requires Play Console internal track / Play Protect approval |
| **`playRelease`** | `com.digitaldodo.arth` | `RECEIVE_SMS`, `READ_SMS` | Official Google Play Store production distribution | Accompanied by Google Play Sensitive Permissions declaration |

### Why Two Configurations?
Google Play Protect employs device-side heuristics that warn or block sideloaded APKs declaring high-risk permissions (`RECEIVE_SMS`, `READ_SMS`) because malicious sideloaded APKs frequently abuse SMS to steal banking OTPs.

- By isolating SMS capabilities into the `play` flavor (`src/play/AndroidManifest.xml`), the `local` flavor builds without any SMS permissions or receivers.
- Developers and testers can sideload `app-local-debug.apk` directly via USB or download without Play Protect blocking the installation.
- In `local` builds, `BuildConfig.SMS_DETECTION_SUPPORTED` is `false`, displaying a polite notice in Settings rather than requesting unavailable permissions.

---

## 2. Prerequisites

- **Android Studio Ladybug** or newer (or CLI build environment).
- **JDK 17** (configured as `JAVA_HOME`).
- **Android SDK Platform 35** (`compileSdk 35`, `targetSdk 35`, `minSdk 26`).
- **ADB platform-tools** (typically located at `C:\Users\<User>\AppData\Local\Android\Sdk\platform-tools`).

---

## 3. Environment Variables & Configuration

Build arguments can be supplied via environment variables or Gradle project properties (`-P` flags):

| Variable / Property | Description | Default Fallback |
|---|---|---|
| `ARTH_API_URL` | Arth Next.js backend API origin | `https://arth-9h3f.vercel.app` |
| `ARTH_SUPABASE_URL` | Supabase instance URL | `https://arth-9h3f.vercel.app` |
| `ARTH_SUPABASE_ANON_KEY` | Public Supabase anonymous API key | `""` |

All network URLs are automatically validated with `NetworkClient.safeBaseUrl()` to guarantee that Retrofit never crashes with invalid or relative URL exceptions on startup.

---

## 4. Building the Application

From PowerShell or terminal in the repository root:

### A. Build Local Debug APK (For Personal Phone Sideloading)
```powershell
cd android
.\gradlew.bat :app:assembleLocalDebug
```
Output APK location:
`android/app/build/outputs/apk/local/debug/app-local-debug.apk`

### B. Build Google Play Debug APK
```powershell
cd android
.\gradlew.bat :app:assemblePlayDebug
```
Output APK location:
`android/app/build/outputs/apk/play/debug/app-play-debug.apk`

### C. Build Release APKs
```powershell
cd android
.\gradlew.bat :app:assembleLocalRelease
.\gradlew.bat :app:assemblePlayRelease
```

---

## 5. Installing on a Physical Device via ADB

1. Enable **Developer Options** and **USB Debugging** on your Android device.
2. Connect the phone via USB cable and trust the computer.
3. Verify connection:
   ```powershell
   & "C:\Users\Ansh\AppData\Local\Android\Sdk\platform-tools\adb.exe" devices
   ```
4. Install the `localDebug` build:
   ```powershell
   & "C:\Users\Ansh\AppData\Local\Android\Sdk\platform-tools\adb.exe" install -r android/app/build/outputs/apk/local/debug/app-local-debug.apk
   ```
5. Launch the app:
   ```powershell
   & "C:\Users\Ansh\AppData\Local\Android\Sdk\platform-tools\adb.exe" shell am start -n com.digitaldodo.arth.local.debug/com.digitaldodo.arth.MainActivity
   ```
6. Monitor startup logs in realtime:
   ```powershell
   & "C:\Users\Ansh\AppData\Local\Android\Sdk\platform-tools\adb.exe" logcat -s Arth:V AndroidRuntime:E
   ```

---

## 6. Startup Reliability & Bug Fixes

Previous installation crashes have been permanently resolved:
1. **Network Initialization Guard**: `NetworkClient` now ensures all base URLs start with `http://` or `https://` with trailing slash, preventing `IllegalArgumentException: baseUrl must be an absolute URL: /`.
2. **Android Keystore Resilience**: `SecureStorage` catches `KeyStoreException` and `GeneralSecurityException` with a graceful fallback to app-private storage, preventing startup crashes on devices with corrupted keystores.
3. **Native Splash Screen**: Implemented `androidx.core:core-splashscreen` with `Theme.Arth.Starting` and `installSplashScreen()` called before `super.onCreate()`.
4. **Retryable Biometric Screen**: Added an unlock UI with manual retry button and fallback to device credentials (`PIN/Pattern/Password`) if biometrics are cancelled.
