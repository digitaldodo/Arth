# Arth App Lock security and offline policy

Arth App Lock is an optional device privacy barrier for an already authenticated session. It shields sensitive financial balances, transactions, and merchant names from casual observation on shared or unattended devices. It does not replace Supabase Auth, API authorization, transaction ownership checks, or RLS.

## Offline Local Passcode Unlock

- **Cryptographic Key Derivation:** Users configure a dedicated local device passcode (minimum 4 digits or characters), separate from their remote Arth account password.
- **Web Crypto PBKDF2:** The passcode is derived into a 256-bit verification key using the standard Web Crypto API (`crypto.subtle`) with:
  - Algorithm: PBKDF2 with SHA-256
  - Iterations: 100,000 iterations
  - Salt: 16-byte cryptographically secure random salt generated via `crypto.getRandomValues`
- **Zero Plaintext Storage:** The raw passcode is NEVER stored in plaintext or sessionStorage/localStorage. Only the random `passcodeSalt` and derived `passcodeHash` are persisted.
- **100% Offline Capable:** Passcode verification executes entirely locally in the browser/PWA and does not make network trips. Users can unlock Arth and record or view transactions seamlessly even with zero internet connectivity.
- **Constant-Time Verification:** Passcode comparison uses constant-time byte XOR comparison (`timingSafeEqual`) to prevent timing side-channel attacks.

## WebAuthn Biometric Verification (Optional)

- Platform authenticator unlock (Touch ID, Face ID, Android Biometrics, Windows Hello) is available as an optional hardware-backed accelerator via SimpleWebAuthn.
- The production origin is `https://arth-9h3f.vercel.app`; the RP ID is derived from the canonical request origin as `arth-9h3f.vercel.app`. Development uses `localhost`. WebAuthn requires HTTPS except for localhost.
- Server challenge creation is rate-limited per user and device. Challenges expire after two minutes and are single-use.
- The platform authenticator works alongside the local offline passcode so users always have a guaranteed offline fallback.

## Inactivity, Backgrounding, and Tab Coordination

- **Configurable Auto-Lock Timeouts:** Users can choose from:
  - `immediate` (locks as soon as the app loses focus or is backgrounded)
  - `1m` (1 minute of inactivity)
  - `5m` (5 minutes of inactivity — default)
  - `15m` (15 minutes of inactivity)
- **Lock on Background:** Optional setting to immediately lock when the PWA is minimized or tab is switched away (`document.visibilityState === 'hidden'`).
- **Activity Tracking:** Monitors pointer, touch, keyboard, and form events. Deadline calculations combine `performance.now()` with monotonic wall time to ensure sleep/hibernation does not bypass the lock.
- **Tab Coordination:** Lock events propagate instantly across open tabs of the same account via `BroadcastChannel('arth_app_lock')`. Unlocking one tab does not automatically unlock others.

## Financial Shielding

While locked:
- The entire application shell is masked with `hidden` and `inert`.
- All account balances (Cash, Online, Total Available) and transaction lists are completely shielded from the DOM.
- A clean, Ledger Minimal unlock screen prompts for the passcode or biometrics.

## Safe Online Recovery

If a user forgets their device passcode:
- Arth provides an online recovery path allowing the user to sign in with their Arth account credentials.
- Signing in successfully resets the local app lock preferences.
- **Zero Data Loss:** Resetting app lock does NOT clear IndexedDB or purge pending offline transactions. All un-synced financial operations remain queued in the durable outbox and synchronize once connected.
