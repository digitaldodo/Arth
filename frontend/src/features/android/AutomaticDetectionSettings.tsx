'use client';

import { useSyncExternalStore } from 'react';

const subscribeToPlatform = () => () => {};
const getAndroidSnapshot = () => typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
const getServerSnapshot = () => false;

export function AutomaticDetectionSettings() {
  const isAndroid = useSyncExternalStore(subscribeToPlatform, getAndroidSnapshot, getServerSnapshot);

  return (
    <section className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="mt-0.5 h-5 w-5 shrink-0 text-[var(--text-secondary)]" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12a2 2 0 0 0 4 0" />
          </svg>
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Automatic transaction detection</h2>
            <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
              Manage notification access, selected apps, privacy, and pending reviews in the Android companion. Notifications are parsed on-device; Arth asks you to confirm before saving.
            </p>
          </div>
        </div>
        {isAndroid ? (
          <a
            href="arth://detection"
            className="inline-flex min-h-11 w-full shrink-0 items-center justify-center rounded-md border border-[var(--action-secondary-border)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 active:scale-[0.99] sm:w-auto"
          >
            Open Android detection settings <span aria-hidden="true" className="ml-2">→</span>
          </a>
        ) : (
          <p className="shrink-0 text-xs text-[var(--text-muted)]">Available in the Arth Android companion.</p>
        )}
      </div>
    </section>
  );
}
