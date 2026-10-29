# Arth App Lock security and offline policy

Arth App Lock is an optional device privacy barrier for an already authenticated session. It does not replace Supabase Auth, API authorization, transaction ownership checks, or RLS.

## WebAuthn verification

- Registration and authentication use the browser's Web Authentication API through SimpleWebAuthn. The operating system or authenticator performs user verification. Arth never receives biometric samples or stores private authenticator keys.
- The production origin is `https://arth-9h3f.vercel.app`; the RP ID is derived from the canonical request origin as `arth-9h3f.vercel.app`. Development uses `localhost`. WebAuthn requires HTTPS except for localhost, and a platform authenticator must be available in the current browser.
- The server creates short-lived challenges, binds each challenge to the authenticated Supabase user, this browser's local device ID, and a ceremony type, then atomically consumes it before verification. Registration and assertion responses are checked for challenge, origin, RP ID, and user verification.
- Public credential keys, IDs, signature counters, and transport hints are stored in `app_lock_credentials`. Challenge records are stored temporarily in `app_lock_challenges`. Both tables have RLS enabled and no `anon`/`authenticated` table grants; Next.js handlers access them with the server-only Supabase service-role key after validating the HTTP-only Supabase session. Apply migration `0022_app_lock_webauthn.sql` before enabling the feature in a deployment.
- Challenge creation is rate-limited per user and device to 12 ceremonies in a 15-minute window. Challenges expire after two minutes and are single use.

## Inactivity and tabs

The client tracks meaningful pointer, touch, keyboard, and form input events. A single 300,000 ms deadline uses `performance.now()` and wall time, and is checked again on visibility, focus, and page resume. Background network work does not reset it. Lock messages propagate to same-account tabs; activity does not propagate, so an active tab cannot keep an idle tab unlocked. Unlocking one tab does not unlock the others.

The lock gate is rendered before the authenticated shell during startup, and the shell is hidden and inert while locked. Locking does not sign out, reload the PWA, clear caches, touch IndexedDB, delete transactions, or mutate the pending synchronization queue.

## Offline policy and limitations

Arth uses server-verified WebAuthn assertions and the existing Supabase password verification flow. **Unlock verification therefore requires a network connection.** If the application reaches the idle deadline while offline, it remains locked until connectivity returns or the user completes the account sign-in recovery path. Local transactions and pending mutations remain in IndexedDB unchanged and are available again after successful verification. No client-only signature check or boolean success flag is treated as authentication.

The lock preference and device identifier are stored in browser local storage, separately for each Arth account in that browser. This makes the preference device-level, but it is not tamper-proof: a person with control of developer tools, same-origin script execution, a compromised browser/extension, or an XSS vulnerability can alter client state or inspect data already delivered to the browser. The lock is intended to deter casual access to an unattended open app, not an attacker controlling the device or browser. Server authorization remains mandatory regardless of UI lock state.

Disabling App Lock in settings requires platform verification or the existing account-password reauthentication flow. On the lock screen, password-enabled accounts can use that same flow; passwordless accounts can sign out and complete the existing account sign-in again. This recovery option needs the account's configured sign-in provider and network access.
