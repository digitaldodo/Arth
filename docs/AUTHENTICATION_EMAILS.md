# Arth — Production Authentication Email Guide

> **Aesthetic Direction**: Ledger Minimal  
> **Target Platform**: Supabase Auth + SSR Next.js App Router  
> **Supabase Project**: `https://supabase.com/dashboard/project/fbmmkqdwkayrrsodueqd`  
> **Production App**: `https://arth-9h3f.vercel.app`  

---

## 1. Overview & Visual Standards

Arth uses a disciplined, minimal design aesthetic inspired by Swiss typography and physical accounting ledgers (**Ledger Minimal**). These authentication email templates replace the default Supabase email designs with restrained, production-grade templates tailored for high deliverability, security reassurance, and cross-client compatibility.

### Key Visual & Technical Principles
- **Monochrome & Warm Palette**: Soft warm background (`#FBFBF9`), pure white content container (`#FFFFFF`), dark stone text (`#1C1917`), neutral supporting copy (`#57534E`), and subtle hairline borders (`#E7E5E4`).
- **Zero Image Dependencies**: Rather than referencing external raster/SVG images (which Gmail, Outlook, and corporate filters routinely block or strip), the email header uses an inline HTML/CSS typographic mark paired with an obsidian emblem badge. It loads instantly and renders crisply across all screens.
- **Table-Based Architecture**: Nested `<table>` elements with explicit pixel widths, inline styles, and email-safe fonts (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`) guarantee consistency across desktop Outlook, webmail, and mobile mail clients.
- **Accessibility & Action Fallbacks**: Every action button is paired with a secondary monospace URL fallback box (`word-break: break-all`) allowing users to easily copy the link if interactive buttons or links are restricted.
- **Security Reassurance**: Every template explicitly specifies token expiration, single-use constraints, and reassurance for uninitiated actions.

---

## 2. Template Mapping & Configuration Matrix

| # | Flow Name | Template File | Supabase Dashboard Section | Subject Line | Supabase Variables Used |
|---|---|---|---|---|---|
| 1 | **Password Reset** | [`supabase/templates/recovery.html`](../supabase/templates/recovery.html) | **Reset Password** | `Reset your Arth password` | `{{ .ConfirmationURL }}`, `{{ .Email }}` |
| 2 | **Signup Confirmation** | [`supabase/templates/confirmation.html`](../supabase/templates/confirmation.html) | **Confirm Signup** | `Confirm your Arth email address` | `{{ .ConfirmationURL }}`, `{{ .Email }}` |
| 3 | **Magic Link** | [`supabase/templates/magic_link.html`](../supabase/templates/magic_link.html) | **Magic Link** | `Your Arth sign-in link` | `{{ .ConfirmationURL }}`, `{{ .Email }}` |
| 4 | **Email Address Change** | [`supabase/templates/email_change.html`](../supabase/templates/email_change.html) | **Change Email Address** | `Confirm your new email address for Arth` | `{{ .ConfirmationURL }}`, `{{ .Email }}` |
| 5 | **User Invitation** | [`supabase/templates/invite.html`](../supabase/templates/invite.html) | **Invite User** | `You have been invited to Arth` | `{{ .ConfirmationURL }}`, `{{ .Email }}` |
| 6 | **Reauthentication (OTP)** | [`supabase/templates/reauthentication.html`](../supabase/templates/reauthentication.html) | **Reauthentication** | `Your Arth verification code` | `{{ .Token }}` |

---

## 3. Step-by-Step Supabase Dashboard Deployment Guide

Follow these steps to apply the upgraded templates in your live hosted Supabase project:

### Step 3.1: Open Supabase Email Templates
1. Log in to the [Supabase Dashboard](https://supabase.com/dashboard/project/fbmmkqdwkayrrsodueqd).
2. In the left-hand navigation sidebar, click on **Authentication** (the key icon).
3. Under the **Configuration** section, select **Email Templates**.

### Step 3.2: Update Each Template

#### 1. Reset Password
1. Click on the **Reset Password** tab.
2. In the **Subject** field, enter:
   ```
   Reset your Arth password
   ```
3. In the **Body (HTML)** editor, clear the default content and paste the entire contents of [`supabase/templates/recovery.html`](../supabase/templates/recovery.html).
4. Click **Save** in the bottom-right corner.

#### 2. Confirm Signup
1. Click on the **Confirm Signup** tab.
2. In the **Subject** field, enter:
   ```
   Confirm your Arth email address
   ```
3. In the **Body (HTML)** editor, clear the default content and paste the entire contents of [`supabase/templates/confirmation.html`](../supabase/templates/confirmation.html).
4. Click **Save**.

> **Note on Token-Hash vs ConfirmationURL**: If your project strictly utilizes the custom SSR token-hash URL pattern (`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/`), you may substitute `{{ .ConfirmationURL }}` in the template with that URL. However, `{{ .ConfirmationURL }}` natively routes through your configured `emailRedirectTo` parameter and is fully supported by `/auth/confirm`.

#### 3. Magic Link
1. Click on the **Magic Link** tab.
2. In the **Subject** field, enter:
   ```
   Your Arth sign-in link
   ```
3. In the **Body (HTML)** editor, clear the default content and paste the entire contents of [`supabase/templates/magic_link.html`](../supabase/templates/magic_link.html).
4. Click **Save**.

#### 4. Change Email Address
1. Click on the **Change Email Address** tab.
2. In the **Subject** field, enter:
   ```
   Confirm your new email address for Arth
   ```
3. In the **Body (HTML)** editor, clear the default content and paste the entire contents of [`supabase/templates/email_change.html`](../supabase/templates/email_change.html).
4. Click **Save**.

#### 5. Invite User
1. Click on the **Invite User** tab.
2. In the **Subject** field, enter:
   ```
   You have been invited to Arth
   ```
3. In the **Body (HTML)** editor, clear the default content and paste the entire contents of [`supabase/templates/invite.html`](../supabase/templates/invite.html).
4. Click **Save**.

#### 6. Reauthentication
1. Click on the **Reauthentication** tab.
2. In the **Subject** field, enter:
   ```
   Your Arth verification code
   ```
3. In the **Body (HTML)** editor, clear the default content and paste the entire contents of [`supabase/templates/reauthentication.html`](../supabase/templates/reauthentication.html).
4. Click **Save**.

---

## 4. Verification of URL Configuration & Redirect Allowlist

Before sending emails in production, ensure your Supabase project's redirect URLs are properly configured to avoid `redirect_uri_not_allowed` errors:

1. Navigate to **Authentication → URL Configuration** in the Supabase Dashboard.
2. **Site URL**:
   - Production: `https://arth-9h3f.vercel.app`
3. **Redirect URLs** (Allowlist):
   - `https://arth-9h3f.vercel.app/auth/callback`
   - `https://arth-9h3f.vercel.app/auth/confirm`
   - `https://arth-9h3f.vercel.app/auth/update-password`
   - `https://arth-9h3f.vercel.app/**`
   - `http://localhost:3000/auth/callback`
   - `http://localhost:3000/auth/confirm`
   - `http://localhost:3000/auth/update-password`
   - `http://localhost:3000/**`
4. Click **Save**.

---

## 5. End-to-End Testing Guide

### A. Testing Password Reset
1. Navigate to the login page (`/login`) on `https://arth-9h3f.vercel.app` (or `http://localhost:3000`).
2. Click **Forgot password?**.
3. Enter your test account email address and click **Send Reset Link**.
4. Check your inbox:
   - Confirm the subject line reads: `Reset your Arth password`.
   - Verify that the Arth brand header, title, and email address appear crisp and formatted.
   - Click the **Reset password** action button.
   - Confirm that your browser navigates to `/auth/callback?next=/auth/update-password` and lands on `/auth/update-password`.
   - Enter a new password, submit, and verify successful password update.

### B. Testing Signup Confirmation
1. Navigate to `/login` and select **Create Account**.
2. Provide a new unique username (e.g. `test_user_01`), a valid inbox email, and a password.
3. Submit the registration form.
4. Check the inbox:
   - Verify the subject line reads: `Confirm your Arth email address`.
   - Verify that the card displays the recipient's email address.
   - Click **Confirm email address**.
   - Confirm the route handler at `/auth/confirm` verifies the token and establishes the session, redirecting to the main dashboard `/`.

### C. Testing Visual Rendering & Link Fallbacks
1. Open the received email in:
   - **Mobile Mail** (iOS Mail or Gmail app on Android/iOS): Verify the card scales fluidly, padding adjusts cleanly, and the CTA button is wide and easy to tap.
   - **Webmail** (Gmail Web, Outlook Web): Verify fonts render cleanly using system font stacks, and no broken image placeholder icons appear.
2. Test the fallback link:
   - Copy the URL from the monospace box below the button and paste it directly into an incognito window.
   - Verify that the authentication flow completes normally.

---

## 6. Email Delivery & Production SMTP Notes

- By default, Supabase provides a built-in email service intended for development with a strict rate limit (typically 3–4 emails per hour).
- For production reliability, connect a custom SMTP provider (e.g. **Resend**, **SendGrid**, or **Postmark**) under **Authentication → Settings → SMTP Settings** in the Supabase Dashboard.
- When configuring custom SMTP, set the **Sender Name** to `Arth` and the **Sender Email** to your verified domain (e.g. `auth@yourdomain.com`).
