import React from 'react';
import Link from 'next/link';

export function OwnerDeniedNotice({ section }: { section: string }) {
  return (
    <div
      role="alert"
      className="rounded-xl border p-6"
      style={{
        color: 'var(--status-error-fg)',
        backgroundColor: 'var(--status-error-bg)',
        borderColor: 'var(--status-error-border)',
      }}
    >
      <h2 className="text-base font-semibold">Primary Owner Authorization Required</h2>
      <p className="mt-1.5 text-sm leading-relaxed">
        The <span className="font-semibold">{section}</span> module is restricted exclusively to the Primary Owner (Ansh Gupta, <code className="font-mono text-xs">OWNER_ADMIN</code>). Support and Operations administrators cannot view audit logs or modify administrator access.
      </p>
      <div className="mt-4">
        <Link
          href="/"
          className="inline-flex rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)]"
        >
          Return to Operations Overview
        </Link>
      </div>
    </div>
  );
}
