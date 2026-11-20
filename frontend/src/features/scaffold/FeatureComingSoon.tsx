'use client';

import React from 'react';

export interface FeatureComingSoonProps {
  title: string;
  subtitle: string;
  moduleName: string;
  phase: string;
  description: string;
  plannedCapabilities: string[];
  ownerNote: string;
  onBack?: () => void;
}

export function FeatureComingSoon({
  title,
  subtitle,
  moduleName,
  phase,
  description,
  plannedCapabilities,
  ownerNote,
  onBack,
}: FeatureComingSoonProps) {
  return (
    <div className="space-y-6 max-w-4xl mx-auto py-2">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1 cursor-pointer transition-colors"
        >
          &larr; Back to Dashboard
        </button>
      )}

      {/* Header Banner */}
      <div className="p-6 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-mono tracking-wider font-semibold px-2 py-0.5 rounded-md bg-[var(--bg-surface-subtle)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
              {phase}
            </span>
            <span className="text-[10px] uppercase font-mono tracking-wider font-semibold px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400">
              Scaffolded Specification
            </span>
          </div>
          <span className="text-[11px] font-mono text-[var(--text-muted)]">
            Module: {moduleName}
          </span>
        </div>

        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            {title}
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1 max-w-2xl leading-relaxed">
            {subtitle}
          </p>
        </div>
      </div>

      {/* Architectural Description */}
      <div className="p-6 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl shadow-xs space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wide">
            Architectural Specification
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed">
            {description}
          </p>
        </div>

        <div>
          <h3 className="text-xs font-semibold text-[var(--text-primary)] mb-2.5">
            Planned Capabilities
          </h3>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-[var(--text-secondary)]">
            {plannedCapabilities.map((cap, i) => (
              <li
                key={i}
                className="p-3 bg-[var(--bg-canvas)] border border-[var(--border-hairline)] rounded-lg flex items-start gap-2.5"
              >
                <span className="text-emerald-500 font-bold leading-none mt-0.5">•</span>
                <span className="leading-snug">{cap}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Honest Ownership Callout */}
      <div className="p-5 bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] rounded-xl space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-sm">🛡️</span>
          <h3 className="text-xs font-semibold text-[var(--text-primary)]">
            Implementation Notice
          </h3>
        </div>
        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
          {ownerNote}
        </p>
        <div className="text-[11px] text-[var(--text-muted)] font-mono pt-1">
          In accordance with SpendSense architectural standards, this module will not display simulated AI outputs, speculative calculations, or mocked financial projections until its official implementation.
        </div>
      </div>
    </div>
  );
}
