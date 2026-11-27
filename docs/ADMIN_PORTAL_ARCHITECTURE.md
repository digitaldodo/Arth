# SpendSense Master Admin Portal Architecture

## 1. Independent Architecture Overview

The **SpendSense Master Admin Portal** is an isolated Next.js 16 App Router application (`admin/`, workspace package `@arth/admin`, local port `3002`) running alongside the normal user-facing SpendSense application (`frontend/`, local port `3000`) and connecting to the shared Fastify backend (`backend/`, local port `3001`).

- **Strict Client Isolation**: Administrators authenticate on a completely separate origin, cookie namespace (`spendsense_admin_session` with `HttpOnly; SameSite=Lax; Path=/`), and UI bundle (`admin/`).
- **BFF Session Proxy**: All browser requests from `:3002` route through Next.js App Router BFF handlers (`/api/admin/*`) which strip `sessionToken` from backend JSON responses, store the JWT exclusively in an `HttpOnly` cookie, inject `Authorization: Bearer <token>` server-side toward Fastify, and purge the cookie on `401` or sign-out.
- **UI Design Language**: Shares SpendSense's **Ledger Minimal** token architecture (`Archival Warm Paper` light theme `#F8F8F6` and `Obsidian Dark` theme `#0C0A09`) with responsive navigation and zero horizontal overflow on mobile viewports.

---

## 2. Five Pre-Authorized Administrators & Provisioning Model

Administrator identities are strictly bounded to the fixed five-person allowlist provisioned server-side in `backend/src/modules/admin/admin.provisioning.ts` and persisted in `supabase/migrations/0040_admin_portal.sql` (`admin_memberships`):

| Full Name | Username | Initial Role | Permanent Authority |
|---|---|---|---|
| **Ansh Gupta** | `Ansh` | `OWNER_ADMIN` | Permanent Primary Owner (`is_owner = true`) |
| **Ayush Chaudhary** | `Ayush` | `SUPPORT_ADMIN` | Promotable to `OPERATIONS_ADMIN` by Owner |
| **Arun Kushwah** | `Arun` | `SUPPORT_ADMIN` | Promotable to `OPERATIONS_ADMIN` by Owner |
| **Akshat Kumar** | `Akshat` | `SUPPORT_ADMIN` | Promotable to `OPERATIONS_ADMIN` by Owner |
| **Dev Chaudhary** | `Dev` | `SUPPORT_ADMIN` | Promotable to `OPERATIONS_ADMIN` by Owner |

- **No Plaintext Initial Passwords**: Initial temporary credentials are represented exclusively as randomized 16-byte salted `scrypt` digests (`scrypt$<saltHex>$<hashHex>`). No plaintext roll numbers appear anywhere in application code, bundles, database migrations, or logs.
- **No Open Registration / No Privilege Escalation**: There is no `/signup` route and no administrator registration handler. Standard SpendSense users authenticating via user Supabase JWTs are never accepted by `admin.rbac.ts`, which signs and verifies tokens with an isolated `iss: 'spendsense-admin'`, `aud: 'spendsense-admin-portal'` domain separation claim plus live database state re-validation.

---

## 3. Primary Owner Authority Protection (`Ansh`)

Ansh Gupta (`adm_ansh`, `OWNER_ADMIN`, `isOwner: true`) is protected by hard backend invariants inside `AdminService` (`backend/src/modules/admin/admin.service.ts`) and database structure:

1. Cannot be disabled via `/api/v1/admin/access/:adminId/disable`.
2. Cannot have his role changed or demoted via `/api/v1/admin/access/:adminId/role`.
3. Cannot self-disable (`403 Forbidden`).
4. Holds exclusive RBAC access to `access:manage` (`/access`) and `audit:read` (`/audit`).
5. Controls activation email approval/rejection, functional enable/disable toggles, non-owner role updates (`SUPPORT_ADMIN` <-> `OPERATIONS_ADMIN`), and owner-initiated password recovery for the other four administrators.

---

## 4. Temporary Password Activation Lifecycle

Every pre-authorized administrator begins in `status = 'PENDING_ACTIVATION'` and `activation_state = 'PENDING_EMAIL'`:

1. **Temporary Login**: Administrator submits their username and temporary credential to `POST /api/v1/admin/auth/login`. Backend verifies against `temp_credential_hash` (while `!temp_credential_invalidated`) and issues a restricted onboarding token scoped solely to `/activate` (`requiresActivation: true`). Operational routes reject all non-active tokens (`403 Forbidden`).
2. **Email Registration**: Administrator enters their personal email (`POST /api/v1/admin/auth/activation/submit-email`). Uniqueness across active/pending admins is enforced.
3. **Email OTP Verification**: Backend hashes a cryptographically random 6-digit OTP (`sha256`), enforces single-use + 15-minute TTL + rate limiting, and delivers via `AdminMailer` (Resend API in production or `backend/.local-admin-mailbox.json` in local dev). Administrator confirms OTP via `POST /api/v1/admin/auth/activation/verify-email`.
4. **Owner Approval Gate**:
   - **Ansh Gupta (Primary Owner Bootstrap)**: Verified `OWNER_ADMIN` transitions directly from email verification to `AWAITING_PASSWORD_SETUP` so initial owner bootstrap cannot deadlock.
   - **Other 4 Administrators**: Account transitions to `AWAITING_OWNER_APPROVAL`. Operational routes and password setup remain blocked until Ansh clicks **Approve Email** in `/access` (`POST /api/v1/admin/access/:adminId/email-approval`).
5. **Permanent Password Setup**: Upon `AWAITING_PASSWORD_SETUP`, administrator submits a strong permanent password (`min 12 chars`, upper + lower + digit + symbol, digits-only/roll-number strings rejected) at `POST /api/v1/admin/auth/activation/complete`.
6. **Permanent Temporary-Credential Invalidation**: Backend stores `password_hash`, sets `temp_credential_hash = NULL`, marks `temp_credential_invalidated = TRUE`, transitions account to `ENABLED` + `ACTIVE`, increments `session_version`, syncs user record cleanly to Supabase Auth when configured, and issues an operational session token. Future temporary login attempts return `401 Unauthorized`.

---

## 5. Password & Verified Email Management Lifecycle

- **Standard Password Sign-In**: Enabled active administrators log in via verified `password_hash`. Generic authentication failures prevent account state leakage; disabled accounts return explicit disabled rejection cleanly.
- **Authenticated Password Change**: `POST /api/v1/admin/auth/change-password` requires the current password, enforces permanent password complexity, rotates `password_hash`, and increments `session_version` to invalidate prior bearer tokens.
- **Verified Email Reassignment**: `POST /api/v1/admin/auth/change-email` requires current password verification, generates a fresh OTP to the new email, revokes direct active access back into activation verification (`PENDING_EMAIL_VERIFICATION`), and requires Primary Owner re-approval for non-owners before reactivation.
- **Self-Service & Owner-Initiated Recovery**: Single-use time-bounded (`30m`) recovery tokens are emailed exclusively to the verified address of `ENABLED` + `ACTIVE` accounts. Upon completion (`POST /api/v1/admin/auth/reset-password`), all prior sessions are immediately revoked via `session_version` bump and `admin_sessions.revoked_at`.

---

## 6. Role-Based Access Control (RBAC) Matrix & Data Privacy

| Capability | `SUPPORT_ADMIN` | `OPERATIONS_ADMIN` | `OWNER_ADMIN` (`Ansh`) |
|---|---|---|---|
| Overview & Release Monitor (`/overview`, `/releases`) | Yes | Yes | Yes |
| User Account Diagnostics Metadata (`/users`) | Yes | Yes | Yes |
| Capture & System Health Telemetry (`/capture`, `/system`) | Yes (read) | Yes (ops focus) | Yes |
| Security Audit Logs (`/audit`) | **Denied (403)** | **Denied (403)** | **Yes** |
| Owner Access Control (`/access`) | **Denied (403)** | **Denied (403)** | **Yes** |
| **Private Financial Ledger / Balances / Documents / Raw SMS** | **NEVER** | **NEVER** | **NEVER** |

- **Live Request Guard**: Every authenticated admin endpoint runs `createAdminAuthGuard`, checking JWT signature + `iss`/`aud`, querying live database state to confirm `status === 'ENABLED'`, `activationState === 'ACTIVE'`, matching `sessionVersion`, and `!session.revokedAt`. Disabling an admin invalidates all live tokens within milliseconds.
- **Database Isolation (`0040_admin_portal.sql`)**: Admin tables enable RLS with zero public/authenticated policies (service-role backend access only). `admin_audit_logs` carries a database trigger rejecting `UPDATE` and `DELETE`. Neither `SupabaseAdminRepository` nor `AdminService` ever queries `transactions`, `balance_movements`, `person_money_records`, `financial_documents`, or raw message payloads.

---

## 7. Local Development & Verification Architecture

| Service | Local URL | Command |
|---|---|---|
| User Web Application | `http://localhost:3000` | `pnpm dev:frontend` (or `pnpm dev` / `pnpm dev:all`) |
| Shared Fastify Backend | `http://localhost:3001` | `pnpm dev:backend` (or `pnpm dev` / `pnpm dev:all`) |
| Master Admin Portal | `http://localhost:3002` | `pnpm dev:admin` (or `pnpm dev:all`) |

### Automated Verification Suites
- `backend/tests/admin-portal.test.ts`: Covers all **24 mandatory security & authorization test scenarios**, including temporary login isolation, activation enforcement, non-owner privilege denial, session revocation upon disable, owner protection invariants, and normal SpendSense user token rejection.
- `admin/tests/admin-portal-ui.test.ts`: Verifies BFF `sessionToken` stripping, absence of credentials/secrets in browser source, Owner UI link gating, and Ledger Minimal CSS variables.
