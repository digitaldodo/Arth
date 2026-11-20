# SpendSense — Supabase authentication email templates

These six responsive, self-contained HTML templates follow the Ledger Minimal design system. Their repository-root-relative paths are configured in `supabase/config.toml` as `./supabase/templates/<file>`.

| Flow | File | Subject | Flow variables |
|---|---|---|---|
| Signup confirmation | `confirmation.html` | Confirm your SpendSense email address. | `ConfirmationURL`, `Email` |
| Password recovery | `recovery.html` | Reset your SpendSense password. | `ConfirmationURL`, `Email` |
| Magic link | `magic_link.html` | Your SpendSense sign-in link. | `ConfirmationURL`, `Email` |
| Email change | `email_change.html` | Confirm your new SpendSense email address. | `ConfirmationURL`, `Email`, `NewEmail` |
| Invitation | `invite.html` | You're invited to SpendSense. | `ConfirmationURL`, `Email` |
| Reauthentication | `reauthentication.html` | Your SpendSense verification code. | `Token` |

The markup uses tables and inline styles, has no remote images or stylesheets, and includes a visible copy-and-paste link fallback for URL-based flows. See [`docs/SPENDSENSE_EMAIL_TEMPLATE_CONFIGURATION.md`](../../docs/SPENDSENSE_EMAIL_TEMPLATE_CONFIGURATION.md) for local validation and hosted-project deployment steps.
