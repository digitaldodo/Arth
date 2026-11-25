# SpendSense app lock security and platform limits

The app lock is an optional local privacy barrier. It does not replace Supabase authentication, backend authorization, or RLS. Account login and recovery are unchanged.

## Android companion (Trusted Web Activity)

`BiometricGateActivity` is the exported TWA entry activity. It checks the Android fingerprint feature and `BiometricManager.canAuthenticate(BIOMETRIC_STRONG)`, then invokes AndroidX `BiometricPrompt` with only `BIOMETRIC_STRONG`. Device credential is not allowed, and no custom PIN or JavaScript fingerprint dialog exists. Authentication success launches the existing Chrome Trusted Web Activity. Cancellation closes the gate; unavailable or unenrolled biometrics display recovery guidance.

Android exposes biometric strength to `BiometricPrompt`, not a universal fingerprint-only selector. A device may satisfy strong biometric authentication with a modality other than fingerprint. SpendSense therefore labels this as device biometric authentication and does not claim fingerprint-only behavior. The gate runs on a new native TWA launch. Chrome owns the active TWA task and provides no JavaScript bridge here, so this implementation cannot guarantee re-lock when an already running TWA returns from background. It also does not use a Keystore authentication-bound encryption key.

## Installed mobile PWA / browser

WebAuthn platform authentication is offered only in an installed mobile PWA. Desktop browsers, including desktop-installed PWAs, do not show the biometric lock settings or prompt. The browser and platform choose authenticator behavior; SpendSense cannot promise fingerprint specifically or prevent browser-defined credential fallbacks. WebAuthn verification currently depends on the authenticated server challenge, so it is not an offline unlock mechanism. If authentication is cancelled or unavailable, the PWA stays masked and offers account recovery.

The former local PBKDF2 passcode setup, entry form, password fallback, and passcode verification code have been removed. On reading legacy lock preferences, the app rewrites them without the old passcode hash or salt. Authentication account passwords remain separate and unchanged.

## Browser storage and offline data

IndexedDB financial data is readable by same-origin JavaScript and is not protected by Android Keystore. The service worker does not cache authenticated API responses or personalized root HTML. Locking the UI does not delete pending transactions. User-scoped local records remain available to that user after reauthentication; a different account reads only its own rows.

## Lifecycle and recovery

The PWA lock uses configured inactivity and visibility events, and lock messages propagate between tabs. The Android prompt gates native entry as described above; Android background/foreground lifecycle coverage is limited by the TWA boundary. Recovery requires normal SpendSense account authentication. It does not silently unlock using the device PIN and does not erase the IndexedDB outbox.
