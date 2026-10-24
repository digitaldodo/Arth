import Link from 'next/link';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { formatPaiseToINR } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const verifiedPaiseSample = 145000; // 1,450.00 INR demonstration

  let authenticatedUser: { id: string; email?: string } | null = null;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      authenticatedUser = {
        id: user.id,
        email: user.email,
      };
    }
  } catch {
    // Graceful fallback if credentials unconfigured in development
    authenticatedUser = null;
  }

  return (
    <main className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] px-4 py-8 md:py-16 transition-colors">
      <div className="max-w-[760px] mx-auto space-y-8">
        {/* Header Bar */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[var(--border-hairline)]">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
                Arth
              </h1>
              <span className="px-2 py-0.5 text-[10px] font-semibold tracking-[0.05em] uppercase rounded-[2px] bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                Ledger Minimal
              </span>
            </div>
            <p className="text-[13px] text-[var(--text-secondary)]">
              Modular personal finance architecture with verified backend authentication
            </p>
          </div>
          <div className="flex items-center gap-3">
            {authenticatedUser ? (
              <form action="/auth/logout" method="POST">
                <button
                  type="submit"
                  className="px-2.5 py-1.5 rounded-[3px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-colors cursor-pointer"
                >
                  Sign Out
                </button>
              </form>
            ) : (
              <Link
                href="/login"
                className="px-2.5 py-1.5 rounded-[3px] bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] text-[12px] font-medium hover:bg-[var(--action-primary-hover)] transition-colors inline-block"
              >
                Sign In
              </Link>
            )}
            <ThemeToggle />
          </div>
        </header>

        {/* Phase Status Banner */}
        <section className="p-5 rounded-[4px] bg-[var(--bg-surface)] border border-[var(--border-hairline)] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--income-fg)]" />
              <span className="text-[13px] font-medium text-[var(--text-primary)]">
                System Status: Authentication &amp; Sessions Active
              </span>
            </div>
            <span className="font-mono text-[11px] text-[var(--text-muted)]">
              Phase 01H Complete
            </span>
          </div>
          <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
            Google OAuth PKCE flow implemented with HTTP-only secure session cookies, server-side BFF proxy (<code className="font-mono text-[12px] bg-[var(--bg-surface-subtle)] px-1 py-0.5 rounded-[2px]">/api/backend/auth/me</code>), and cryptographic JWT verification at the Fastify backend boundary (<code className="font-mono text-[12px] bg-[var(--bg-surface-subtle)] px-1 py-0.5 rounded-[2px]">GET /api/v1/auth/me</code>).
          </p>
        </section>

        {/* Authenticated Identity Card */}
        <section className="rounded-[4px] bg-[var(--bg-surface)] border border-[var(--border-hairline)] p-5 space-y-3">
          <h2 className="text-[11px] font-semibold tracking-[0.05em] uppercase text-[var(--text-secondary)]">
            Active Session Context
          </h2>
          {authenticatedUser ? (
            <div className="space-y-2 text-[13px]">
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-secondary)]">User Identifier (sub)</span>
                <span className="font-mono text-[12px] text-[var(--text-primary)]">
                  {authenticatedUser.id}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-secondary)]">Verified Email</span>
                <span className="font-mono text-[12px] text-[var(--text-primary)]">
                  {authenticatedUser.email ?? 'No email claim'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-secondary)]">Cookie Security</span>
                <span className="font-mono text-[12px] text-[var(--income-fg)]">
                  HttpOnly &middot; Secure &middot; SameSite=Lax
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-[var(--text-secondary)]">No active session detected.</span>
              <Link
                href="/login"
                className="text-[12px] text-[var(--text-primary)] underline hover:opacity-80"
              >
                Sign in with Google OAuth &rarr;
              </Link>
            </div>
          )}
        </section>

        {/* Architectural Boundaries Matrix */}
        <section className="rounded-[4px] bg-[var(--bg-surface)] border border-[var(--border-hairline)] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)]">
            <h2 className="text-[11px] font-semibold tracking-[0.05em] uppercase text-[var(--text-secondary)]">
              Authentication &amp; Session Boundaries
            </h2>
          </div>
          <dl className="divide-y divide-[var(--border-hairline)] text-[13px]">
            <div className="px-5 py-3 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
              <dt className="text-[var(--text-secondary)]">Client Session Storage</dt>
              <dd className="font-mono text-[12px] text-[var(--text-primary)]">HTTP-only Cookies (No browser token access)</dd>
            </div>
            <div className="px-5 py-3 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
              <dt className="text-[var(--text-secondary)]">BFF Authentication Proxy</dt>
              <dd className="font-mono text-[12px] text-[var(--text-primary)]">Next.js Route Handler &rarr; Fastify Bearer JWT</dd>
            </div>
            <div className="px-5 py-3 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
              <dt className="text-[var(--text-secondary)]">Backend Identity Gateway</dt>
              <dd className="font-mono text-[12px] text-[var(--text-primary)]">Fastify <code className="text-[11px]">GET /api/v1/auth/me</code> (jose verified)</dd>
            </div>
            <div className="px-5 py-3 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
              <dt className="text-[var(--text-secondary)]">Database Isolation</dt>
              <dd className="font-mono text-[12px] text-[var(--text-primary)]">PostgreSQL RLS (<code className="text-[11px]">auth.uid() = user_id</code>)</dd>
            </div>
            <div className="px-5 py-3 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
              <dt className="text-[var(--text-secondary)]">Currency Representation</dt>
              <dd className="font-mono text-[12px] text-[var(--text-primary)]">
                Integer Paise (100 paise = ₹1.00) &rarr; {formatPaiseToINR(verifiedPaiseSample)}
              </dd>
            </div>
          </dl>
        </section>

        {/* Documentation & Blueprint References */}
        <section className="rounded-[4px] bg-[var(--bg-surface)] border border-[var(--border-hairline)] p-5 space-y-4">
          <h2 className="text-[11px] font-semibold tracking-[0.05em] uppercase text-[var(--text-secondary)]">
            Canonical Specifications &amp; Documentation
          </h2>
          <ul className="space-y-2 text-[13px]">
            <li className="flex items-center justify-between py-1 border-b border-[var(--border-hairline)]">
              <span className="text-[var(--text-primary)] font-medium">Architecture Specification</span>
              <code className="font-mono text-[11px] text-[var(--text-muted)]">docs/ARTH_ARCHITECTURE.md</code>
            </li>
            <li className="flex items-center justify-between py-1 border-b border-[var(--border-hairline)]">
              <span className="text-[var(--text-primary)] font-medium">Architecture Decision Record (ADR-001)</span>
              <code className="font-mono text-[11px] text-[var(--text-muted)]">docs/decisions/ADR-001-modular-monorepo.md</code>
            </li>
            <li className="flex items-center justify-between py-1 border-b border-[var(--border-hairline)]">
              <span className="text-[var(--text-primary)] font-medium">Phase Build Plan</span>
              <code className="font-mono text-[11px] text-[var(--text-muted)]">docs/ARTH_BUILD_PLAN.md</code>
            </li>
            <li className="flex items-center justify-between py-1 border-b border-[var(--border-hairline)]">
              <span className="text-[var(--text-primary)] font-medium">Database Migrations (0001-0007)</span>
              <code className="font-mono text-[11px] text-[var(--text-muted)]">supabase/migrations/</code>
            </li>
            <li className="flex items-center justify-between py-1">
              <span className="text-[var(--text-primary)] font-medium">Approved Interactive Prototype</span>
              <code className="font-mono text-[11px] text-[var(--text-muted)]">docs/design-concepts/arth-prototype.html</code>
            </li>
          </ul>
        </section>

        {/* Next Phase Indicator */}
        <footer className="pt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between text-[12px] text-[var(--text-muted)] gap-2">
          <span>Next: Phase 01I &middot; Transaction Engine &amp; Outbox Writes</span>
          <span className="font-mono">v0.1.0-alpha &middot; Phase 01H</span>
        </footer>
      </div>
    </main>
  );
}
