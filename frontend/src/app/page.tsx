import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { formatPaiseToINR } from "@/lib/format";
import type { HealthCheckResponse } from "@arth/contracts";

export default function HomePage() {
  const verifiedPaiseSample = 145000; // 1,450.00 INR demonstration

  const sampleHealthContract: HealthCheckResponse = {
    status: "ok",
    service: "arth-backend",
    version: "0.1.0",
    uptimeSeconds: 0,
    timestamp: "2026-10-25T00:00:00.000Z",
  };

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
              Modular personal finance architecture with strict domain boundaries
            </p>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
          </div>
        </header>

        {/* Phase Status Banner */}
        <section className="p-5 rounded-[4px] bg-[var(--bg-surface)] border border-[var(--border-hairline)] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--income-fg)]" />
              <span className="text-[13px] font-medium text-[var(--text-primary)]">
                System Status: Modular Monorepo Established
              </span>
            </div>
            <span className="font-mono text-[11px] text-[var(--text-muted)]">
              Phase 01F Active
            </span>
          </div>
          <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
            Workspace restructured into decoupled packages: <code className="font-mono text-[12px] bg-[var(--bg-surface-subtle)] px-1 py-0.5 rounded-[2px]">frontend/</code> (Next.js 16 UI), <code className="font-mono text-[12px] bg-[var(--bg-surface-subtle)] px-1 py-0.5 rounded-[2px]">backend/</code> (Fastify API service), <code className="font-mono text-[12px] bg-[var(--bg-surface-subtle)] px-1 py-0.5 rounded-[2px]">packages/contracts/</code> (shared types), and <code className="font-mono text-[12px] bg-[var(--bg-surface-subtle)] px-1 py-0.5 rounded-[2px]">supabase/</code> (PostgreSQL migrations &amp; RLS).
          </p>
        </section>

        {/* Architectural Boundaries Matrix */}
        <section className="rounded-[4px] bg-[var(--bg-surface)] border border-[var(--border-hairline)] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)]">
            <h2 className="text-[11px] font-semibold tracking-[0.05em] uppercase text-[var(--text-secondary)]">
              Modular Architecture Boundaries
            </h2>
          </div>
          <dl className="divide-y divide-[var(--border-hairline)] text-[13px]">
            <div className="px-5 py-3 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
              <dt className="text-[var(--text-secondary)]">Frontend Package (<code className="text-[11px]">@arth/frontend</code>)</dt>
              <dd className="font-mono text-[12px] text-[var(--text-primary)]">Next.js 16 App Router · Port 3000</dd>
            </div>
            <div className="px-5 py-3 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
              <dt className="text-[var(--text-secondary)]">Backend Service (<code className="text-[11px]">@arth/backend</code>)</dt>
              <dd className="font-mono text-[12px] text-[var(--text-primary)]">Fastify API Service · Port 3001</dd>
            </div>
            <div className="px-5 py-3 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
              <dt className="text-[var(--text-secondary)]">Shared Contracts (<code className="text-[11px]">@arth/contracts</code>)</dt>
              <dd className="font-mono text-[12px] text-[var(--text-primary)]">TypeScript API definitions ({sampleHealthContract.service})</dd>
            </div>
            <div className="px-5 py-3 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
              <dt className="text-[var(--text-secondary)]">Database Layer (<code className="text-[11px]">supabase/</code>)</dt>
              <dd className="font-mono text-[12px] text-[var(--text-primary)]">PostgreSQL · RLS Enforced · UTC Timestamps</dd>
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
            Canonical Specifications & Documentation
          </h2>
          <ul className="space-y-2 text-[13px]">
            <li className="flex items-center justify-between py-1 border-b border-[var(--border-hairline)]">
              <span className="text-[var(--text-primary)] font-medium">Architecture Specification</span>
              <code className="font-mono text-[11px] text-[var(--text-muted)]">docs/ARTH_ARCHITECTURE.md</code>
            </li>
            <li className="flex items-center justify-between py-1 border-b border-[var(--border-hairline)]">
              <span className="text-[var(--text-primary)] font-medium">Architecture Decision Record (ADR)</span>
              <code className="font-mono text-[11px] text-[var(--text-muted)]">docs/decisions/ADR-001-modular-monorepo.md</code>
            </li>
            <li className="flex items-center justify-between py-1 border-b border-[var(--border-hairline)]">
              <span className="text-[var(--text-primary)] font-medium">Ledger Minimal Design System</span>
              <code className="font-mono text-[11px] text-[var(--text-muted)]">docs/ARTH_DESIGN_SYSTEM.md</code>
            </li>
            <li className="flex items-center justify-between py-1 border-b border-[var(--border-hairline)]">
              <span className="text-[var(--text-primary)] font-medium">Phase Build Plan</span>
              <code className="font-mono text-[11px] text-[var(--text-muted)]">docs/ARTH_BUILD_PLAN.md</code>
            </li>
            <li className="flex items-center justify-between py-1">
              <span className="text-[var(--text-primary)] font-medium">Approved Interactive Prototype</span>
              <code className="font-mono text-[11px] text-[var(--text-muted)]">docs/design-concepts/arth-prototype.html</code>
            </li>
          </ul>
        </section>

        {/* Next Phase Indicator */}
        <footer className="pt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between text-[12px] text-[var(--text-muted)] gap-2">
          <span>Next: Phase 01G · Supabase Setup &amp; Authentication Flow</span>
          <span className="font-mono">v0.1.0-alpha · Phase 01F</span>
        </footer>
      </div>
    </main>
  );
}
