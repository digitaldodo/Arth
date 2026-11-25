# Email Confirmation & Supabase SSR Token-Hash Configuration Guide

This document specifies the exact configuration required in the **Supabase Dashboard** to enable reliable email/password confirmation for **SpendSense** using the SSR PKCE token-hash architecture.

---

## 1. Why Use the Token-Hash Flow (`/auth/confirm`)?

Traditional PKCE email confirmation links rely on a browser cookie verifier (`sb-<project-ref>-auth-token-code-verifier`). If a user initiates registration on their computer but taps the confirmation link on their phone or inside an in-app email client, the browser cookie verifier is absent, causing Supabase Auth to fail with:
```
PKCE code verifier not found in storage
```

By directing the confirmation email link to `/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/`, the server verifies the cryptographic token hash directly via `supabase.auth.verifyOtp({ token_hash, type: 'email' })`. This approach:
- Works seamlessly across different devices, apps, and browsers.
- Requires no pre-existing client cookies on the device opening the email.
- Authoritatively sets session cookies on the outgoing redirect response to `/`.
- Keeps the user experience safe and deterministic.

---

## 2. Supabase Dashboard Configuration

Navigate to your project in the [Supabase Dashboard](https://supabase.com/dashboard/project/fbmmkqdwkayrrsodueqd).

### Step 2.1: Email Provider Settings
1. Go to **Authentication → Providers → Email**.
2. Verify **Enable Email provider** is toggled **ON**.
3. Toggle **Confirm email** to **ON** (Enabled).
4. Verify **Secure email change** is toggled **ON**.
5. Click **Save**.

### Step 2.2: URL Configuration (Redirect Allowlist)
1. Go to **Authentication → URL Configuration**.
2. **Site URL**:
   - Set to: `https://arth-9h3f.vercel.app`
   *(For purely local offline testing, this can be `http://localhost:3000`, but setting it to your production domain ensures any unexpected fallback stays on the live application).*
3. **Redirect URLs** (Allowlist):
   Add the following entries:
   - `http://localhost:3000/auth/callback`
   - `http://localhost:3000/auth/confirm`
   - `http://localhost:3000/**`
   - `https://arth-9h3f.vercel.app/auth/callback`
   - `https://arth-9h3f.vercel.app/auth/confirm`
   - `https://arth-9h3f.vercel.app/**`
4. Click **Save**.

### Step 2.3: Confirm Signup Email Template
1. Go to **Authentication → Email Templates → Confirm signup**.
2. **Subject**:
   ```
   Confirm your SpendSense Ledger account
   ```
3. **Body (HTML)**:
   ```html
   <h2>Confirm your SpendSense Ledger account</h2>
   <p>Thank you for signing up for SpendSense. Follow this link to confirm your email and activate your personal finance ledger:</p>
   <p>
     <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/">
       Confirm your email
     </a>
   </p>
   <p style="color: #78716c; font-size: 12px; margin-top: 24px;">
     If you did not sign up for SpendSense, you can safely ignore this email.
   </p>
   ```
4. Click **Save**.

---

## 3. End-to-End Registration & Verification Testing

### A. Testing Unconfirmed State & Resend Capability
1. Open the SpendSense application at `/login`.
2. Click **Create Account**.
3. Fill in:
   - Username: `alice_test`
   - Email: `alice@example.com`
   - Password: `Password123!`
   - Confirm Password: `Password123!`
4. Click **Create Account**.
5. The application will transition to the confirmation pending state:
   - *"Check your email to confirm your account."*
   - Displays the registered email.
   - Provides a **Resend Confirmation Email** button.
6. Try to sign in before confirming:
   - Switch to **Sign In** and submit credentials.
   - The application displays: *"Your email address has not been confirmed yet. Please check your inbox for the confirmation link."*
   - A direct *"Resend confirmation link &rarr;"* action is available.

### B. Testing Confirmation Link
1. Click the link in the received email (pointing to `/auth/confirm?token_hash=...&type=email`).
2. The server route handler `/auth/confirm`:
   - Exchanges `token_hash` via `supabase.auth.verifyOtp`.
   - Attaches session cookies to the redirect response.
   - Strips the token hash and parameters from the address bar.
   - Redirects to `/`.
3. The root page detects the authenticated session and displays the application shell.

### C. Testing Error Cases
- **Expired/Invalid Link**:
  Accessing `/auth/confirm?token_hash=invalid_hash&type=email` safely redirects to `/login?error=confirmation_failed` without crashing or leaking the token.
- **Open Redirect Protection**:
  Accessing `/auth/confirm?token_hash=...&type=email&next=//malicious.com` safely normalizes the destination to `/`.
