'use client';

import React from 'react';

export type StatusBannerVariant = 'info' | 'warning' | 'error' | 'success';

export interface StatusBannerProps {
  variant?: StatusBannerVariant;
  title?: string;
  children: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  };
  onDismiss?: () => void;
  className?: string;
}

export function StatusBanner({
  variant = 'info',
  title,
  children,
  action,
  onDismiss,
  className = '',
}: StatusBannerProps) {
  const isAlert = variant === 'error';

  // Archival theme-aware styling tokens:
  // Low saturation, warm paper/obsidian contrast, hairline borders.
  const variantStyles: Record<StatusBannerVariant, { container: string; icon: string; iconColor: string }> = {
    info: {
      container:
        'bg-[var(--bg-surface-subtle)] border-[var(--border-hairline)] text-[var(--text-secondary)]',
      icon: 'ℹ',
      iconColor: 'text-[var(--text-muted)]',
    },
    warning: {
      container:
        'bg-amber-500/10 dark:bg-amber-500/10 border-amber-600/25 dark:border-amber-400/20 text-[var(--text-primary)]',
      icon: '▲',
      iconColor: 'text-amber-600 dark:text-amber-400',
    },
    error: {
      container:
        'bg-rose-500/10 dark:bg-rose-500/10 border-rose-600/25 dark:border-rose-400/20 text-[var(--text-primary)]',
      icon: '✕',
      iconColor: 'text-rose-600 dark:text-rose-400',
    },
    success: {
      container:
        'bg-emerald-500/10 dark:bg-emerald-500/10 border-emerald-600/25 dark:border-emerald-400/20 text-[var(--text-primary)]',
      icon: '✓',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
    },
  };

  const style = variantStyles[variant];

  return (
    <div
      role={isAlert ? 'alert' : 'status'}
      aria-live={isAlert ? 'assertive' : 'polite'}
      className={`rounded-lg border px-3.5 py-2.5 text-xs transition-colors flex items-center justify-between gap-3 ${style.container} ${className}`}
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <span
          className={`shrink-0 font-bold select-none mt-0.5 text-xs leading-none ${style.iconColor}`}
          aria-hidden="true"
        >
          {style.icon}
        </span>
        <div className="min-w-0 space-y-0.5">
          {title && (
            <div className="font-semibold text-[var(--text-primary)] text-xs">
              {title}
            </div>
          )}
          <div className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
            {children}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            disabled={action.disabled}
            className="px-2.5 py-1 text-xs font-semibold rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs"
          >
            {action.label}
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss notice"
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-0.5 transition-colors cursor-pointer"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
