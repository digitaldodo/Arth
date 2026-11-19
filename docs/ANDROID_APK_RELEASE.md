# SpendSense Android release reference

SpendSense ships a signed native Android APK through the website's `/download` page. It is not a Trusted Web Activity. The application ID and existing signing identity are preserved so Android can install future signed updates over an existing installation.

Release and signing details are maintained in [`ANDROID_DIRECT_DISTRIBUTION.md`](./ANDROID_DIRECT_DISTRIBUTION.md). Android's direct-download SMS permission constraints and supported user-selected message import are documented in [`ANDROID_PRIVACY_AND_PLAY_POLICY.md`](../ANDROID_PRIVACY_AND_PLAY_POLICY.md).

The release workflow is [`.github/workflows/android-release.yml`](../.github/workflows/android-release.yml). It publishes the `SpendSense.apk`, checksum, and release metadata after signature, package, version, and manifest-permission checks. Keep the keystore and its credentials out of Git and preserve them using the offline backup procedure in the runbook.
