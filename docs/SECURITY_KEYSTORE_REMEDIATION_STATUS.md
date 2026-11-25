# Keystore Secret Exposure — Remediation Status

## Finding

GitGuardian flagged a hardcoded temporary Android keystore password in commit `4609a65c051039a310b471de65e70f8fe5b95bca`, in the removed fallback path of `.github/workflows/android-release.yml`. The fallback generated an ephemeral signing key when a production signing secret was unavailable.

The literal is intentionally not reproduced in this report.

## Current repository state inspected

- The current `main` release workflow no longer contains the hardcoded fallback or ephemeral-key generation path.
- The current workflow requires `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD` as GitHub Actions secrets, decodes the keystore into the runner temporary directory, and validates it with `keytool`.
- The current Android app Gradle configuration reads signing values from environment variables and blocks protected release tasks unless a persistent keystore and credentials are present.
- The current repository tree contains no committed `.jks` or `.keystore` file.

## Risk / limitations

- The exposed password must still be treated as compromised. The current source cleanup does not invalidate a credential previously published in a public commit.
- The flagged fallback key was generated ephemerally inside the GitHub Actions runner. The inspected diff shows this fallback was not the configured persistent signing keystore.
- This inspection cannot establish whether the exposed password was reused elsewhere, whether an external signing keystore was separately compromised, or whether GitGuardian has cleared the alert.
- Git history was not rewritten. The flagged commit remains part of repository history. History rewriting was deliberately not performed.

## Required owner actions

1. Check GitHub Actions secrets and confirm the persistent release keystore is still the intended signing identity.
2. Rotate `ANDROID_KEYSTORE_PASSWORD` and `ANDROID_KEY_PASSWORD` if the affected key is the persistent production key, after confirming the exact keystore and release distribution arrangements. If the exposed value was only the removed ephemeral fallback password, ensure it is not reused anywhere.
3. If a released APK was signed using the ephemeral fallback key, identify affected releases and determine whether users received that APK. Do not replace the persistent signing identity without assessing Android update compatibility / Play App Signing.
4. Run a full-history secret scan (for example GitGuardian or Gitleaks) and resolve the alert only after the scanner confirms the finding is addressed or appropriately revoked.
5. Consider history cleanup separately. Coordinate with collaborators before any rewrite; do not force-push without a deliberate repository-wide plan.

## Verification performed

- Inspected the flagged commit diff and current `main` workflow and Gradle signing configuration.
- Confirmed the current workflow and Gradle file no longer contain the hardcoded ephemeral fallback.
- Confirmed no `.jks` or `.keystore` files are present in the current repository tree.
- No build or release was run by this GitHub-only inspection.
- No application source, database, production settings, signing credentials, or Git history were changed by this audit.