# Google OAuth Redirect & Branding Configuration Guide

This document specifies the exact configuration required in the **Google Cloud Console (Google Auth Platform)**, **Supabase Dashboard**, and **Vercel Deployment** to ensure Google OAuth sign-in identifies the app as **Arth** and redirects seamlessly in both local development and production.

---

## 1. Architectural Diagnosis

### Why did the browser redirect to `http://localhost:3000/?code=...` with `ERR_CONNECTION_REFUSED`?
1. **Allowlist Exact-Matching & Query String Rejection**:
   When `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: '...' } })` initiates an OAuth flow, Supabase validates the supplied `redirectTo` against its allowlist (**Authentication → URL Configuration → Redirect URLs**).
   If `redirectTo` contains a query parameter like `https://arth-9h3f.vercel.app/auth/callback?next=/`, Supabase compares the entire URI against the allowlist entries. If the allowlist contains only `https://arth-9h3f.vercel.app/auth/callback` without wildcards, the exact string match fails.
2. **Supabase Silent Fallback to Site URL**:
   When Supabase rejects a requested `redirectTo`, it does not throw an error; instead, it silently falls back to the configured **Site URL** in the Supabase Dashboard.
   If the default Site URL in Supabase is still `http://localhost:3000` (or `http://localhost:3000/`), Supabase sends the browser redirect upon completion of Google OAuth directly to:
   `http://localhost:3000/?code=...` (landing on the root path `/` of localhost:3000, NOT `/auth/callback`).
3. **Missing Localhost Service**:
   Because the redirect sent the user to `http://localhost:3000/?code=...` while the user was interacting with the production deployment on Vercel (where no local server was listening on port 3000 of their device), Chrome immediately aborted with `ERR_CONNECTION_REFUSED`.
4. **Resolution**:
   - The application now explicitly requests the exact, clean callback URL without trailing query parameters:
     - Local development: `http://localhost:3000/auth/callback`
     - Production: `https://arth-9h3f.vercel.app/auth/callback`
   - In production, origin derivation strictly prevents localhost fallbacks under all circumstances.
   - The Supabase Dashboard **Site URL** must be updated to `https://arth-9h3f.vercel.app`.
   - The Supabase Dashboard **Redirect URLs** must contain `http://localhost:3000/auth/callback` and `https://arth-9h3f.vercel.app/auth/callback`.

### Why did the Google Consent Screen display `fbmmkqdwkayrrsodueqd.supabase.co`?
1. **OAuth Redirect Origin**:
   Google OAuth consent screens display the domain where the user is being directed back to after authentication. For Supabase-managed authentication, the authorized redirect URI registered in Google Cloud Console is `https://fbmmkqdwkayrrsodueqd.supabase.co/auth/v1/callback`.
2. **Branding Verification & Custom Domain**:
   If the Google Cloud OAuth consent screen branding is unconfigured or in testing mode, Google prioritizes showing the hosted callback domain (`fbmmkqdwkayrrsodueqd.supabase.co`).
   Additionally, because Supabase hosts the authentication endpoints on `<project-ref>.supabase.co`, Google’s origin banner will display that domain unless a **Supabase Custom Domain** (e.g., `auth.arth.app`) is provisioned via Supabase Pro/Team. A codebase modification cannot alter a hosted provider domain.

---

## 2. Google Cloud Console Configuration

Navigate to [Google Cloud Console](https://console.cloud.google.com/apis/credentials).

### Step 2.1: OAuth Consent Screen (Google Auth Platform → Branding)
1. Go to **APIs & Services → OAuth consent screen**.
2. Set **User Type** to **External** (unless restricting to Google Workspace organization).
3. Under **App Information**:
   - **App name**: `Arth`
   - **User support email**: Select your developer/support email (e.g. `anshkmrn@gmail.com`).
   - **App logo**: Upload the Arth Ledger Minimal logo (120×120 px PNG).
4. Under **App Domain**:
   - **Application home page**: `https://arth-9h3f.vercel.app`
   - **Application privacy policy link**: `https://arth-9h3f.vercel.app`
   - **Application terms of service link**: `https://arth-9h3f.vercel.app`
5. Under **Authorized Domains**:
   Add the following top-level domains:
   - `vercel.app`
   - `supabase.co`
   *(If you configure a custom root domain like `arth.app`, add `arth.app` here as well).*
6. Under **Developer Contact Information**:
   - Enter your contact email.
7. Click **Save and Continue**.

### Step 2.2: Scopes
Ensure the following standard non-sensitive scopes are selected:
- `.../auth/userinfo.email`
- `.../auth/userinfo.profile`
- `openid`

### Step 2.3: OAuth 2.0 Web Client Credentials
1. Go to **APIs & Services → Credentials**.
2. Select your Web Application client (e.g., "Arth Web Client").
3. Under **Authorized JavaScript Origins**:
   - `http://localhost:3000`
   - `https://arth-9h3f.vercel.app`
4. Under **Authorized redirect URIs**:
   - `https://fbmmkqdwkayrrsodueqd.supabase.co/auth/v1/callback`
   > [!IMPORTANT]
   > Do **NOT** add `/auth/callback` to the Google Cloud Console redirect URIs. Google talks exclusively to Supabase's hosted callback (`https://fbmmkqdwkayrrsodueqd.supabase.co/auth/v1/callback`). Supabase then forwards the user to Arth's `/auth/callback`.
5. Click **Save**.
> [!CAUTION]
> Never commit or publicly expose the Google OAuth Client Secret.

---

## 3. Supabase Dashboard Configuration

Navigate to the [Supabase Dashboard](https://supabase.com/dashboard/project/fbmmkqdwkayrrsodueqd).

### Step 3.1: URL Configuration (Redirect Allowlist)
1. Navigate to **Authentication → URL Configuration**.
2. **Site URL**:
   - Set to: `https://arth-9h3f.vercel.app`
   *(For purely local offline workflows, this can be `http://localhost:3000`, but setting to production ensures any fallback redirects to the live application).*
3. **Redirect URLs** (Allowlist):
   Add the following explicit entries:
   - `http://localhost:3000/auth/callback`
   - `http://localhost:3000/**`
   - `https://arth-9h3f.vercel.app/auth/callback`
   - `https://arth-9h3f.vercel.app/**`
4. Click **Save**.

### Step 3.2: Google Provider Verification
1. Navigate to **Authentication → Providers → Google**.
2. Verify **Enable Sign in with Google** is toggled **ON**.
3. Confirm **Client ID** matches the Client ID from Google Cloud Console.
4. Confirm **Client Secret** is populated and valid.
5. Click **Save**.

---

## 4. Environment Variables Reference

### Local Development (`.env.local`)
```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://fbmmkqdwkayrrsodueqd.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
NEXT_PUBLIC_API_URL=http://localhost:3001
INTERNAL_API_URL=http://localhost:3001
```

### Production (Vercel Project Settings)
```env
NEXT_PUBLIC_APP_URL=https://arth-9h3f.vercel.app
NEXT_PUBLIC_SUPABASE_URL=https://fbmmkqdwkayrrsodueqd.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
INTERNAL_API_URL=https://arth-backend.onrender.com
```

---

## 5. Summary of Code Defenses Implemented in Arth

1. **Centralized Origin Resolver (`auth-config.ts`)**:
   - Derives `getAppOrigin(headers)` from `NEXT_PUBLIC_APP_URL`, `x-forwarded-host`, and `x-forwarded-proto`.
   - Never returns localhost in production (`process.env.NODE_ENV === 'production'`), preventing reliance on a local dev server.
2. **Explicit Callback (`/auth/callback`)**:
   - OAuth flows explicitly request `${origin}/auth/callback?next=/`.
   - The route handler exchanges the code for a session using `@supabase/ssr`, writes HTTP-only cookies, and redirects with HTTP 303.
   - Cleans the authorization code from the browser URL completely.
3. **Open-Redirect Hardening**:
   - `sanitizeRedirectPath()` strictly rejects protocol-relative (`//evil.com`), external (`https://evil.com`), or backslash bypasses (`/\evil.com`), defaulting safely to `/`.
4. **Root & Login Redirection Resilience**:
   - Both `frontend/src/app/page.tsx` and `frontend/src/app/login/page.tsx` intercept any stray `?code=` query parameters and immediately route them to `/auth/callback` for PKCE exchange.
   - Any OAuth error parameters (`?error=...`) are mapped to user-friendly messages via `formatAuthError()`.
