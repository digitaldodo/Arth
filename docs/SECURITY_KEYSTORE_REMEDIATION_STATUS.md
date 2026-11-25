# Keystore Secret Exposure — Remediation Status

## Summary & Current Resolution Status

- **Incident Status:** **OPEN — Pending Owner Password-Reuse Verification (and Optional Git History Rewrite)**
- **Flagged Commit in Alert:** `4609a65c051039a310b471de65e70f8fe5b95bca` (`.github/workflows/android-release.yml`, alerted Nov 23, 2026)
- **Originating Commit:** `53a2779df2b377e7b369e63acdc7748aaa7fce9e` (Nov 3, 2026)
- **Repository:** `https://github.com/digitaldodo/SpendSense1` (previously `digitaldodo/Arth`)

> **Important:** Although `.github/workflows/android-release.yml` on `main` no longer contains the hardcoded fallback password, removing a secret from `HEAD` does **not** remove it from Git history. The GitGuardian incident must **not** be marked resolved until the owner completes the manual password-reuse verification (and rotates the persistent keystore password if reused anywhere) and completes the GitGuardian closure workflow below.

---

## 1. Root Cause & Full-History Audit Findings

1. **Where the password was introduced:**
   - Commit `53a2779df2b377e7b369e63acdc7748aaa7fce9e` (`feat(android): implement native android app download experience and CI/CD release automation`, Nov 3, 2026) added an ephemeral fallback `keytool -genkey` block and hardcoded `EPHEMERAL_KEY_PASS` literal in `.github/workflows/android-release.yml` whenever GitHub signing secrets were unset (carried through `b503d51` and `365fb86`).
   - Commit `4609a65c051039a310b471de65e70f8fe5b95bca` (`feat(android): add secure direct APK distribution`, Nov 19, 2026) **removed** the ephemeral fallback path and enforced persistent secrets (`Require persistent signing secrets`). GitGuardian flagged `4609a65` because its diff exposed the deleted hardcoded literal from `.github/workflows/android-release.yml` (`53a2779`..`365fb86`).

2. **Did GitHub Actions execute the fallback?**
   - **Yes — in three early CI runs before persistent secrets were configured:**
     - Run `41674091625` (`365fb86`, Nov 3, 2026) — executed fallback; build step failed, nothing published.
     - Run `41675098927` (`18be6b1`, Nov 3, 2026) — executed fallback (`Generating ephemeral signing key`) and published `v1.2.0-b4` (`Arth.apk`, `applicationId: com.digitaldodo.arth`, signer `CN=Arth Release, OU=Mobile, O=Digital Dodo, L=Bangalore, ST=Karnataka, C=IN`, certificate SHA-256 `92a411eb0c408ec39f019ab2ab0d62332be92829655696d3466b3154facadf9b`).
     - Run `41778937516` (`3793a82`, Nov 4, 2026) — executed fallback (`Generating ephemeral signing key`) and published `v1.2.0-b5` (`Arth.apk`, distinct disposable keypair SHA-256 `36cd16e7f847609a4cef068b4a3f690f227e2b8c02aa293e863c7539a605aa6c`).

3. **Were ephemeral keystores persisted or committed?**
   - **No.** Ephemeral `android/app/release.keystore` files generated inside GitHub-hosted Ubuntu runners were never committed to Git, never uploaded as workflow artifacts, and were destroyed when the runners exited.
   - A full-history scan across all `146` commits (`git rev-list --all`) confirms zero `.jks`, `.keystore`, `.p12`, or `.pfx` files exist anywhere in Git history or `HEAD`.

4. **Did persistent production releases reuse an ephemeral key?**
   - **No.** All four GitHub Actions secrets (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`) were provisioned/updated on `2026-11-19T14:15:49Z`–`53Z`.
   - Verified releases `v1.3.0-b8` through `v1.4.0-b17` and `android-latest` share a single consistent production signing certificate:
     - **Subject DN:** `CN=Arth Release, OU=Android, O=Digital Dodo, L=Bengaluru, ST=Karnataka, C=IN`
     - **Certificate SHA-256:** `2385b27fe940bf5cae2ddfc16d615994bef8538ed8ffcb06f58404d90e386447`
   - Note: Because `v1.2.0-b4` and `v1.2.0-b5` were signed with disposable keys, Android devices that installed those Nov 3–4 builds cannot upgrade in-place to `v1.3.0-b8+` without uninstalling/reinstalling. Those legacy release tags are left intact per policy.

5. **Other credentials in repository history / `HEAD`:**
   - Full-history and `HEAD` (`724` tracked files) scans detected no other real signing passwords, tokens, or committed keystore binaries. The only private-key header hits in history and `HEAD` are synthetic mock fixtures in `frontend/tests/google-sheets-*.ts`, `frontend/tests/phase02-sheets-outbox.test.ts`, and commented placeholder lines in `.env.example`.

---

## 2. Verified Current Enforcement (`main`)

Inspected and verified directly against current repository files and Gradle execution:

- `.github/workflows/android-release.yml` (`Require persistent signing secrets` step) requires non-empty `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`, decodes the keystore to `$RUNNER_TEMP/spendsense-release.jks`, verifies the alias with `keytool -list`, and fails immediately if any secret is absent.
- `android/app/build.gradle` enforces `gradle.taskGraph.whenReady` rejection for `:app:assembleLocalRelease`, `:app:packageLocalRelease`, `:app:assembleDirectSmsRelease`, `:app:packageDirectSmsRelease`, `:installer:assembleRelease`, and `:installer:packageRelease` whenever `!releaseSigningReady`. Verified locally by running `.\gradlew.bat :app:assembleLocalRelease --no-daemon` without signing env vars, which failed with `A persistent release keystore and signing credentials are required... Unsigned or ephemeral release builds are disabled.`
- `android/installer/build.gradle` enforces the same guard on `:installer:assembleRelease` and `:installer:packageRelease`.
- Existing Android application IDs (`com.digitaldodo.arth`, `com.digitaldodo.arth.installer`) and `.gitignore` keystore exclusions (`*.keystore`, `*.jks`, `*.apk`, `*.aab`) remain intact.

---

## 3. Credential Remediation Guidance (Owner Action Required)

Because `v1.2.0-b4`/`b5` used disposable runner-only keypairs, **the exposed fallback password cannot decrypt the current persistent keystore (`2385b27f...`) UNLESS you reused that exact password string elsewhere**.

**Owner verification & rotation checklist:**

1. Confirm offline (without printing values in logs or terminals) that your persistent keystore (`%LOCALAPPDATA%\Arth\signing\release.jks`) and any GitHub/personal accounts **do not reuse** the fallback password string that was committed in `53a2779`..`365fb86`.
2. **If reused** on the persistent keystore, rotate the keystore and key passwords **without changing the keypair or alias** (never generate a replacement signing key, as that breaks Android app updates for existing users):
   ```powershell
   keytool -storepasswd -keystore "$env:LOCALAPPDATA\Arth\signing\release.jks"
   keytool -keypasswd -alias arth -keystore "$env:LOCALAPPDATA\Arth\signing\release.jks"
   ```
   Then re-encode the updated keystore (`[Convert]::ToBase64String([IO.File]::ReadAllBytes(...))`), update `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, and `ANDROID_KEY_PASSWORD` in **GitHub Settings → Secrets and variables → Actions**, and verify a release build confirms certificate SHA-256 `2385b27fe940bf5cae2ddfc16d615994bef8538ed8ffcb06f58404d90e386447`.
3. **If not reused anywhere**, no keystore rotation or key replacement is required; proceed to the Git history cleanup decision and GitGuardian closure steps below.

---

## 4. Git History Remediation Plan (Requires Explicit Owner Approval)

Historical commits `53a2779` through `365fb86` (and the diff of `4609a65`) remain in the Git history of `main` (and local backup branches `backup-before-author-fix`, `backup-head-after-two-commits-rewrite`, `backup-head-author-fix-20261026`). History was **not** rewritten automatically.

If you approve scrubbing the exposed literal from public Git history:

1. Coordinate a freeze window with all 5 team members and collaborators so no unpushed local commits sit on old SHAs.
2. Create a fresh mirror clone and replace the exposed literal across `.github/workflows/android-release.yml` using `git-filter-repo`:
   ```bash
   git clone --mirror https://github.com/digitaldodo/SpendSense1.git spendsense-mirror.git
   cd spendsense-mirror.git
   # Put "<EXPOSED_STRING>==>[REDACTED_HISTORICAL_FALLBACK_PASSWORD]" in replace.txt (outside repo)
   git filter-repo --replace-text ../replace.txt --path .github/workflows/android-release.yml
   ```
3. Verify the rewritten history locally with `gitleaks detect --log-opts="--all"` before pushing.
4. Force-push rewritten refs (`git push --force --all` and `git push --force --tags`) only after explicit approval, request GitHub Support/cache invalidation for old unreachable commit views if needed, and instruct collaborators to re-clone cleanly.

---

## 5. GitGuardian Resolution Steps

To accurately close the GitGuardian incident:

1. Verify whether the exposed fallback string was ever reused (Section 3); rotate immediately via `keytool -storepasswd` / `-keypasswd` if reused.
2. Confirm current `HEAD` is clean (verified: zero hardcoded signing passwords or `.jks`/`.keystore` files in all `724` tracked files).
3. Decide whether to perform the Section 4 history rewrite (`git-filter-repo`). Note: GitGuardian will continue flagging historical commits on full-history scans unless history is rewritten or the historical occurrence is explicitly triaged.
4. In the **GitGuardian Dashboard → Incidents**, open the alert for `4609a65c051039a310b471de65e70f8fe5b95bca`:
   - Confirm **"Key revoked / invalid"** (either because the disposable runner keys from Nov 3–4 were destroyed and non-reused, or after rotating reused persistent passwords).
   - Attach audit notes documenting that `v1.2.0-b4` and `v1.2.0-b5` used destroyed ephemeral keys while `v1.3.0-b8+` use the separate persistent keystore (`2385b27f...`).
   - Trigger a fresh full-history scan (or `ggshield secret scan repo .`) and mark the incident **Resolved** only after verifying no persistent secret remains exposed.
