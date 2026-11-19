# Arth Android Release Automation

The direct Android release workflow builds and verifies the signed `localRelease` APK and publishes versioned artifacts to GitHub Releases. It will stop before publishing if the persistent signing secrets are missing or if the APK manifest contains an SMS permission.

Use [docs/ANDROID_DIRECT_DISTRIBUTION.md](docs/ANDROID_DIRECT_DISTRIBUTION.md) for the workflow, required secrets, release metadata, checksum verification, website delivery, recovery process, Android user update flow, and physical-device checklist.

The workflow never creates an ephemeral signing key. The key outside Git and the four GitHub Actions signing secrets must be backed up before the first production release. The private GitHub repository also requires a read-only release-asset token in the Vercel server environment for public website downloads.
