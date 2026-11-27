'use client';

import React, { useSyncExternalStore } from 'react';

const THEME_EVENT = 'spendsense-admin-theme-change';

function subscribe(callback: () => void) {
  window.addEventListener(THEME_EVENT, callback);
  return () => window.removeEventListener(THEME_EVENT, callback);
}

function getSnapshot(): 'dark' | 'light' {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.classList.contains('light') ? 'light' : 'dark';
}

function getServerSnapshot(): 'dark' | 'light' {
  return 'dark';
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    if (next === 'light') {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
    }
    try {
      localStorage.setItem('spendsense-admin-theme', next);
    } catch {
      // Ignore storage failures
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${theme === 'dark' ? 'Archival Warm Paper (light)' : 'Obsidian Dark'} theme`}
      className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface-subtle)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
    >
      <span
        className="h-2 w-2 rounded-full border border-[var(--border-strong)]"
        style={{ backgroundColor: theme === 'dark' ? '#0C0A09' : '#F8F8F6' }}
      />
      <span suppressHydrationWarning>{theme === 'dark' ? 'Obsidian' : 'Paper'}</span>
    </button>
  );
}
