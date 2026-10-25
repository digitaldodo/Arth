# Arth — Android APK Release & Trusted Web Activity (TWA) Guide

> **Application ID**: `com.digitaldodo.arth`  
> **Production Web Origin**: `https://arth-9h3f.vercel.app`  
> **Architecture**: Android Trusted Web Activity (TWA) via Google Android Browser Helper  
> **Release Target**: GitHub Releases (`Arth.apk`)  

---

## 1. Architectural Foundation

Arth for Android is packaged as an **Android Trusted Web Activity (TWA)**. 

### Why TWA?
- **Server-Side Rendering & SSR Cookies**: Arth is a Next.js App Router application with authenticated SSR cookies, server actions, and a Fastify backend. A TWA runs the live hosted web application (`https://arth-9h3f.vercel.app`) without requiring a static export or rewriting the backend/auth layer.
- **Native Full-Screen Experience**: When verified with **Digital Asset Links**, Chrome removes the browser URL bar, giving the user a borderless, native application feel.
- **Single Source of Truth**: All UI enhancements, bug fixes, database rules, and features deployed to Vercel are instantly live in the Android application without requiring users to download a new APK for every web change.
- **Zero Heavy Native Bridges**: Avoids battery drain and unnecessary complexity compared to hybrid frameworks.

---

## 2. One-Time Setup: Generating the Release Signing Keystore

To publish reproducible, update-compatible APKs, generate a dedicated release keystore.

> [!CAUTION]
> **Never commit your release keystore to Git.**  
> Keep a secure offline backup of `release.keystore` and its passwords. If the release keystore is lost, existing users will not be able to install subsequent updates without uninstalling the app and losing their app data.

### Step 2.1: Generate the Keystore
Run the following command locally in your terminal (JDK 17+ `keytool`):

```bash
keytool -genkeypair -v \
  -keystore release.keystore \
  -alias arth \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -dname "CN=DigitalDodo, OU=Mobile, O=Arth, L=Bangalore, ST=Karnataka, C=IN"
```
*(Enter a strong password when prompted, e.g. at least 16 characters).*

### Step 2.2: Extract the SHA-256 Certificate Fingerprint
Run:

```bash
keytool -list -v -keystore release.keystore -alias arth
```
Locate the line beginning with `SHA256:`. It will look like:
```
14:6D:E9:CD:AB:23:45:67:89:01:23:45:67:89:AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90:AB:CD
```
Save this fingerprint. You will need it for Digital Asset Links verification.

### Step 2.3: Convert Keystore to Base64 (for GitHub Secrets)
- **macOS / Linux**:
  ```bash
  base64 -w 0 release.keystore > keystore_base64.txt
  ```
- **Windows (PowerShell)**:
  ```powershell
  [Convert]::ToBase64String([IO.File]::ReadAllBytes("release.keystore")) | Out-File -Encoding ascii keystore_base64.txt
  ```

---

## 3. GitHub Repository Secrets Configuration

Navigate to your GitHub repository: **Settings → Secrets and variables → Actions → Repository secrets**.

Add the following secrets:

| Secret Name | Value | Purpose |
|---|---|---|
| `ANDROID_RELEASE_KEYSTORE_BASE64` | The entire contents of `keystore_base64.txt` | Decoded during CI to sign the release APK |
| `ANDROID_KEYSTORE_PASSWORD` | The password chosen during keystore creation | Keystore authentication |
| `ANDROID_KEY_ALIAS` | `arth` | Key alias in the keystore |
| `ANDROID_KEY_PASSWORD` | The key password | Key authentication |
| `ANDROID_CERT_SHA256` | The extracted SHA-256 fingerprint string | Embedded into APK asset statements |

---

## 4. Digital Asset Links Verification (`assetlinks.json`)

Android verifies that `https://arth-9h3f.vercel.app` authoritatively owns `com.digitaldodo.arth` by checking:
```
https://arth-9h3f.vercel.app/.well-known/assetlinks.json
```

### Step 4.1: Configure Vercel Environment Variable
1. Open the [Vercel Dashboard](https://vercel.com) for project `arth-9h3f`.
2. Go to **Settings → Environment Variables**.
3. Add a new variable:
   - **Key**: `ANDROID_RELEASE_CERT_SHA256`
   - **Value**: Your SHA-256 fingerprint (e.g. `14:6D:E9:CD:AB:23:...`)
   - **Environment**: Select `Production`, `Preview`, and `Development`.
4. Click **Save** and trigger a redeployment.

### Step 4.2: Verify Public Accessibility
Once redeployed, test the endpoint:
```bash
curl -i https://arth-9h3f.vercel.app/.well-known/assetlinks.json
```
The response will be `200 OK` with `Content-Type: application/json` containing:
```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.digitaldodo.arth",
      "sha256_cert_fingerprints": [
        "14:6D:E9:CD:AB:23:..."
      ]
    }
  }
]
```

### Step 4.3: Validate via Google's Digital Asset Links Tool
Verify the domain association using Google's testing API:
```
https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://arth-9h3f.vercel.app&relation=delegate_permission/common.handle_all_urls
```

---

## 5. Automated Build & Release Pipeline

The repository includes a GitHub Actions workflow: [`.github/workflows/release-android.yml`](../.github/workflows/release-android.yml).

### Triggering a Release
You can trigger a build in either of two ways:

1. **Via GitHub Actions UI**:
   - Go to **Actions → Release Android APK**.
   - Click **Run workflow**.
   - Enter the version name (e.g. `1.0.0`) and version code (e.g. `1`).
   - Click **Run workflow**.

2. **Via Git Tag**:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

### Workflow Actions:
1. Sets up JDK 17 and the Android SDK on `ubuntu-latest`.
2. Decodes the release keystore from `ANDROID_RELEASE_KEYSTORE_BASE64`.
3. Runs `./gradlew assembleRelease` inside `android/`.
4. Renames the signed output binary to `Arth.apk`.
5. Computes `Arth.apk.sha256`.
6. Publishes a versioned GitHub Release with the attached APK and checksum.
7. Makes the APK available via the stable URL:
   ```
   https://github.com/digitaldodo/Arth/releases/latest/download/Arth.apk
   ```

---

## 6. End-User Installation Guide

For users downloading the APK:

1. Tap **Download APK** from **More & Settings** in Arth (or navigate to `https://github.com/digitaldodo/Arth/releases/latest/download/Arth.apk`).
2. When the download finishes, tap the file in your browser's notification or Downloads folder.
3. If Android prompts:  
   *"For your security, your phone is not allowed to install unknown apps from this source"*:  
   - Tap **Settings**.  
   - Enable **Allow from this source**.  
4. Tap **Install**.
5. Launch **Arth** from your home screen.

---

## 7. Versioning Strategy for Subsequent Updates

When updating the Android wrapper in future releases:
- Increment `versionCode` sequentially (e.g. `1` → `2` → `3`).
- Increment `versionName` semantically (e.g. `1.0.0` → `1.0.1` → `1.1.0`).
- Always sign with the exact same `release.keystore`. Android will block in-place upgrades if the signing certificate changes.
