import { ThemeToggle } from "@/components/ThemeToggle";
import { formatPaiseToINR } from "@/lib/format";

export default function HomePage() {
  const verifiedPaiseSample = 145000; // 1,450.00 INR demonstration

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
              Personal finance tracking foundation with local-first ledger clarity
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
                System Status: Foundation Scaffold Ready
              </span>
            </div>
            <span className="font-mono text-[11px] text-[var(--text-muted)]">
              Phase 01E Complete
            </span>
          </div>
          <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
            The Next.js 16 App Router application has been successfully initialized in the workspace with strict TypeScript, Tailwind CSS v4, and the complete Ledger Minimal semantic design token foundation.
          </p>
        </section>

        {/* Technical Architecture Matrix */}
        <section className="rounded-[4px] bg-[var(--bg-surface)] border border-[var(--border-hairline)] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)]">
            <h2 className="text-[11px] font-semibold tracking-[0.05em] uppercase text-[var(--text-secondary)]">
              Active Technical Specifications
            </h2>
          </div>
          <dl className="divide-y divide-[var(--border-hairline)] text-[13px]">
            <div className="px-5 py-3 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
              <dt className="text-[var(--text-secondary)]">Application Runtime</dt>
              <dd className="font-mono text-[12px] text-[var(--text-primary)]">Next.js 16 (App Router) + React 19</dd>
            </div>
            <div className="px-5 py-3 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
              <dt className="text-[var(--text-secondary)]">Type Safety</dt>
              <dd className="font-mono text-[12px] text-[var(--text-primary)]">TypeScript 5 (Strict Mode enabled)</dd>
            </div>
            <div className="px-5 py-3 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
              <dt className="text-[var(--text-secondary)]">Design System Baseline</dt>
              <dd className="text-[var(--text-primary)]">Ledger Minimal (Concept 1: Warm Paper / Obsidian)</dd>
            </div>
            <div className="px-5 py-3 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
              <dt className="text-[var(--text-secondary)]">Currency Representation</dt>
              <dd className="font-mono text-[12px] text-[var(--text-primary)]">
                Integer Paise (100 paise = ₹1.00) &rarr; {formatPaiseToINR(verifiedPaiseSample)}
              </dd>
            </div>
            <div className="px-5 py-3 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
              <dt className="text-[var(--text-secondary)]">Timezone Standard</dt>
              <dd className="font-mono text-[12px] text-[var(--text-primary)]">UTC database storage, Asia/Kolkata presentation</dd>
            </div>
            <div className="px-5 py-3 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
              <dt className="text-[var(--text-secondary)]">Package Manager</dt>
              <dd className="font-mono text-[12px] text-[var(--text-primary)]">pnpm 10.24.0</dd>
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
              <span className="text-[var(--text-primary)] font-medium">UX Blueprint & Workflows</span>
              <code className="font-mono text-[11px] text-[var(--text-muted)]">docs/ARTH_UX_BLUEPRINT.md</code>
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
          <span>Next: Phase 01F · Supabase Project Setup &amp; Migrations</span>
          <span className="font-mono">v0.1.0-alpha · Phase 01E</span>
        </footer>
      </div>
    </main>
  );
}
