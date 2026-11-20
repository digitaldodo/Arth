# SpendSense Android SMS Permission & OS Compatibility Guide

## 1. Regulatory & Operating System Evolution

Google introduced increasingly strict sandbox restrictions around `READ_SMS` and `RECEIVE_SMS` to protect end-user privacy against rogue background scrapers.

SpendSense was engineered from the ground up to operate within these security boundaries while providing seamless automated financial tracking for users who explicitly authorize it.

### 1.1 Android Version Compatibility Matrix

| Android OS Version | API Level | SMS Capture Behavior | Notification Capture | Required Configuration |
|---|---|---|---|---|
| **Android 9 (Pie)** | API 28 | Standard runtime prompt via `ActivityCompat.requestPermissions`. Background broadcast receiver works reliably. | Supported | Standard runtime grant. |
| **Android 10 (Q) – 11 (R)** | API 29-30 | Google introduced "Hard-Restricted Permissions". Sideloaded APKs have SMS permissions blocked by default package installer. | Supported | Must be installed via SpendSense Installer (`setWhitelistedRestrictedPermissions`). |
| **Android 12 (S) – 12L** | API 31-32 | Exact alarm restrictions and background broadcast limits. Foreground service requires explicit type. | Supported | Foreground notification channel registered; battery optimization exclusion recommended. |
| **Android 13 (Tiramisu)** | API 33 | `POST_NOTIFICATIONS` runtime permission separated. "Restricted settings" dialog triggered if user tries to enable accessibility or notification listener on sideloaded apps. | Requires `POST_NOTIFICATIONS` grant | User must navigate to App Info -> 3 dots -> "Allow restricted settings" if installing manually without SpendSense Installer. |
| **Android 14 (UpsideDownCake) – 15** | API 34-35 | Enforced `dataSync` foreground service type declarations. Restricted permissions strictly blocked unless allowlisted during installation session. | Supported via `NotificationListenerService` | Fully compliant via SpendSense Installer v2.0 session params. |

---

## 2. Google Play Store vs Direct Distribution Architecture

### 2.1 The Google Play SMS Policy Wall
In 2019, Google updated its Play Store Developer Policy regarding `SMS and Call Log Permissions`:
- Permissions are strictly reserved for apps registered as the user's **Default SMS Handler**, **Default Phone/Dialer**, or explicit enterprise compliance archives.
- Personal Financial Management (PFM) apps, expense trackers, and budget planners are **not eligible** for SMS permissions on Google Play, regardless of user consent or encryption guarantees.

### 2.2 SpendSense Distribution Strategy
To guarantee users access to automated SMS tracking without compromising features or resorting to dangerous root exploits, SpendSense employs a dual-channel architecture:

1. **Direct Signed APK Distribution**:
   - SpendSense distributes verified, cryptographically signed APKs via official releases and in-app auto-updates (`/api/android/download` and `/api/android/version`).
2. **SpendSense Companion Installer (`android/installer`)**:
   - The standalone installer app requests `REQUEST_INSTALL_PACKAGES`.
   - When staging the SpendSense APK, it initiates a native `PackageInstaller.Session`:
     ```kotlin
     val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
     if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
         params.setWhitelistedRestrictedPermissions(
             setOf(
                 Manifest.permission.READ_SMS,
                 Manifest.permission.RECEIVE_SMS
             )
         )
     }
     ```
   - Because the installer explicitly allowlists the restricted permissions during the OS package verification phase, Android grants the app the ability to request `READ_SMS` and `RECEIVE_SMS` at runtime without system blocking.

---

## 3. Graceful Fallback & Alternative Ingestion Channels

SpendSense never breaks if a user refuses SMS permissions or operates on a restricted device profile:

```
[User refuses or lacks SMS permissions]
                  |
                  +---> [1] Notification Listener Service (GPay, PhonePe, Paytm, CRED)
                  |
                  +---> [2] Android Share Sheet (ACTION_SEND: share receipt/SMS text)
                  |
                  +---> [3] Direct Bank Statement Import (PDF, Password PDF, CSV, Excel)
                  |
                  +---> [4] Quick Add Manual Entry (Instant thumb-friendly bottom sheet)
```

1. **Financial Notification Listener (`NotificationListenerService`)**:
   - Not subject to Google's SMS permission restrictions.
   - Monitors push notifications emitted by UPI apps (`GPay`, `PhonePe`, `Paytm`, `BHIM`, `CRED`).
   - Extracts merchant narration, transaction amount, and UPI UTR in real time.
2. **Native Android Share Sheet (`ACTION_SEND`)**:
   - Users can long-press any SMS or WhatsApp transaction alert and tap **"Share -> SpendSense"**.
   - Opens the native Quick Add sheet pre-populated with amount, counterparty, and category suggestion.
3. **Bank Statement Import**:
   - Document picker lets users import monthly statements from all major Indian banks directly into the authoritative ledger.

---

## 4. User Configuration & Troubleshooting Guide

### 4.1 Resolving "Restricted Setting" on Android 13+
If SpendSense was sideloaded via a browser instead of SpendSense Installer:
1. Open Android **Settings** -> **Apps** -> **SpendSense**.
2. Tap the **Three Dots (⋮)** in the top right corner.
3. Tap **"Allow restricted settings"**.
4. Authenticate using device PIN or fingerprint.
5. Return to SpendSense and grant SMS or Notification permissions.

### 4.2 Ensuring Reliable Background Capture
Modern OEM skins (MIUI, ColorOS, OneUI, OxygenOS) aggressively terminate background processes. For uninterrupted real-time capture:
1. **Disable Battery Optimization**:
   Settings -> Apps -> SpendSense -> Battery -> Select **"Unrestricted"**.
2. **Auto-Start Permission (Xiaomi / Vivo / Oppo)**:
   Enable "Auto-start" in the device security center to allow `SmsBroadcastReceiver` to wake on incoming SMS.
