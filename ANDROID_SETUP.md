# Arth Android Setup

The initial customer release is a directly distributed Android APK from the Arth website. Build, signing, installation, update, hosting, and SMS-permission instructions are maintained in [docs/ANDROID_DIRECT_DISTRIBUTION.md](docs/ANDROID_DIRECT_DISTRIBUTION.md).

The production variant is `localRelease`, uses application ID `com.digitaldodo.arth`, and requires the persistent release keystore. It does not include `READ_SMS`, `RECEIVE_SMS`, or SMS transaction detection. The APK is signed and optimized with R8/resource shrinking.

For a local signed build, configure the four `ANDROID_*` signing variables described in the runbook and run:

```powershell
cd android
.\gradlew.bat :app:testLocalDebugUnitTest :app:assembleLocalRelease
```

Do not use a debug APK for distribution or commit APK files, keystores, passwords, or signing backups.
