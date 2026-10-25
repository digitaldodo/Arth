# Arth — Supabase Authentication Email Templates

This directory contains production-ready HTML email templates designed for Arth's authentication flows under the **Ledger Minimal** design system.

## Template Index

| Flow | File | Supabase Dashboard Section | Subject Line |
|---|---|---|---|
| **Password Reset** | [`recovery.html`](./recovery.html) | Reset Password | `Reset your Arth password` |
| **Signup Confirmation** | [`confirmation.html`](./confirmation.html) | Confirm Signup | `Confirm your Arth email address` |
| **Magic Link** | [`magic_link.html`](./magic_link.html) | Magic Link | `Your Arth sign-in link` |
| **Email Address Change** | [`email_change.html`](./email_change.html) | Change Email Address | `Confirm your new email address for Arth` |
| **User Invitation** | [`invite.html`](./invite.html) | Invite User | `You have been invited to Arth` |
| **Reauthentication** | [`reauthentication.html`](./reauthentication.html) | Reauthentication | `Your Arth verification code` |

## Design & Compatibility Notes

- **Ledger Minimal Aesthetic**: Warm paper surface (`#FBFBF9`), pure white card container (`#FFFFFF`), high-contrast primary typography (`#1C1917`), secondary supporting text (`#57534E`), and subtle hairline borders (`#E7E5E4`).
- **Resilient Brand Mark**: Typographic header with a monochrome square emblem renders cleanly without relying on external images that might be blocked by email clients.
- **Universal Email Client Support**: Table-based layout with inline styles, tested for Apple Mail, Gmail (iOS/Android/Web), and Microsoft Outlook.
- **Bulletproof Fallback**: Plain-text monospace URL box ensures users can copy and paste links if interactive buttons are stripped.

For detailed deployment instructions and testing steps, see [`docs/AUTHENTICATION_EMAILS.md`](../../docs/AUTHENTICATION_EMAILS.md).
