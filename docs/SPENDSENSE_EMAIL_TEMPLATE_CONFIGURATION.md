# SpendSense Supabase email template configuration

## Root cause and configured paths

The Supabase CLI resolves configured `content_path` values from the repository working directory. The six entries in `supabase/config.toml` previously pointed at `./templates/...`; the files are stored in `supabase/templates/`, so CLI validation could not open `templates/email_change.html`.

The corrected paths are repository-root-relative:

| Auth flow | Path |
|---|---|
| Confirmation | `./supabase/templates/confirmation.html` |
| Recovery | `./supabase/templates/recovery.html` |
| Magic link | `./supabase/templates/magic_link.html` |
| Email change | `./supabase/templates/email_change.html` |
| Invite | `./supabase/templates/invite.html` |
| Reauthentication | `./supabase/templates/reauthentication.html` |

The existing `project_id = "arth"`, auth settings, and redirect URLs remain unchanged. The subjects and template branding use SpendSense.

## Template inventory and variables

Templates are table-based, responsive, use inline styles for critical presentation, have a high-contrast text link fallback, and request no remote images or stylesheets.

| File | Subject | Supabase variables |
|---|---|---|
| `confirmation.html` | Confirm your SpendSense email address. | `{{ .ConfirmationURL }}`, `{{ .Email }}` |
| `recovery.html` | Reset your SpendSense password. | `{{ .ConfirmationURL }}`, `{{ .Email }}` |
| `magic_link.html` | Your SpendSense sign-in link. | `{{ .ConfirmationURL }}`, `{{ .Email }}` |
| `email_change.html` | Confirm your new SpendSense email address. | `{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .NewEmail }}` |
| `invite.html` | You're invited to SpendSense. | `{{ .ConfirmationURL }}`, `{{ .Email }}` |
| `reauthentication.html` | Your SpendSense verification code. | `{{ .Token }}` |

URL flows use the provider's `ConfirmationURL` for the action button and copyable fallback. Email change names both the current and new addresses. Reauthentication displays the one-time token without treating it as a URL. Supabase performs template substitution; do not pre-encode or change the placeholders.

## Local and CI validation

From the repository root:

```powershell
pnpm dlx supabase@3.2.0 config validate
py scripts/validate_spendsense_email_templates.py
```

The Python check uses the standard-library TOML and HTML parsers. It checks all six configured paths, required per-flow variables, basic tag balance, no remote assets, and unchanged project identity. The GitHub Actions workflow `.github/workflows/supabase-config.yml` runs both checks from the checkout root on relevant `main` pushes, pull requests, and manual dispatch. This verifies the GitHub checkout contains readable repository-relative paths; it does not inspect separate GitHub App or deployment logs.

## Local versus hosted configuration

Local file changes and `supabase config validate` do not update Supabase Auth settings in a hosted project and do not change the hosted dashboard email bodies. No hosted project mutation is performed by this repository change. Confirm the six templates and subjects in **Supabase Dashboard → Authentication → Email Templates** for the production project, then paste the contents of each corresponding file and save. Confirm SMTP sender settings and test confirmation, recovery, magic-link, email-change, invite, and reauthentication flows using controlled accounts.

Hosted integration compatibility is not asserted until those dashboard values and the project's SMTP provider are verified. If the message came from GitHub, check the failing integration's checkout working directory and ensure validation runs at the repository root (or sets `--workdir` to the root); the `supabase/templates` directory must be present in the checkout artifact.

## Troubleshooting

- Run CLI commands from `D:\Forge\Per` (the repository root), not from `supabase/` or `supabase/templates/`.
- If a content-path error remains, inspect the exact path in `supabase/config.toml`, check that the file is included in the CI checkout, then run the CLI validator again.
- If local CLI validation passes but hosted emails remain old, update and save the hosted Dashboard templates; local HTML is not automatically deployed.
- If actions do not reach the app, validate Supabase URL Configuration redirect allowlists separately from template paths.
- If a variable renders literally, verify that it is supported by that specific Auth flow and is spelled exactly as documented by Supabase; the local validator checks the repository's chosen flow-variable contract, not provider delivery.
- Test each link using a controlled account and verify expiration and redirect behavior against the hosted site's current configuration.
