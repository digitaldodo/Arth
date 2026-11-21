'use client';

import React from 'react';

export type BadgeVariant =
  | 'essential'
  | 'optional'
  | 'luxury'
  | 'cash'
  | 'online'
  | 'upi'
  | 'income'
  | 'expense'
  | 'connected'
  | 'disconnected'
  | 'success'
  | 'warning'
  | 'error'
  | 'neutral';

export type BadgeSize = 'xs' | 'sm' | 'md';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  pulse?: boolean;
  children: React.ReactNode;
  className?: string;
}

const VARIANT_STYLES: Record<
  BadgeVariant,
  {
    container: string;
    dot: string;
  }
> = {
  essential: {
    container:
      'bg-[var(--tag-essential-bg)] text-[var(--tag-essential-fg)] border-[var(--tag-essential-border)]',
    dot: 'bg-[var(--tag-essential-dot)]',
  },
  optional: {
    container:
      'bg-[var(--tag-optional-bg)] text-[var(--tag-optional-fg)] border-[var(--tag-optional-border)]',
    dot: 'bg-[var(--tag-optional-dot)]',
  },
  luxury: {
    container:
      'bg-[var(--tag-luxury-bg)] text-[var(--tag-luxury-fg)] border-[var(--tag-luxury-border)]',
    dot: 'bg-[var(--tag-luxury-dot)]',
  },
  cash: {
    container:
      'bg-[var(--tag-cash-bg)] text-[var(--tag-cash-fg)] border-[var(--tag-cash-border)]',
    dot: 'bg-[var(--tag-cash-dot)]',
  },
  online: {
    container:
      'bg-[var(--tag-online-bg)] text-[var(--tag-online-fg)] border-[var(--tag-online-border)]',
    dot: 'bg-[var(--tag-online-dot)]',
  },
  upi: {
    container:
      'bg-[var(--tag-upi-bg)] text-[var(--tag-upi-fg)] border-[var(--tag-upi-border)]',
    dot: 'bg-[var(--tag-upi-dot)]',
  },
  income: {
    container:
      'bg-[var(--income-bg)] text-[var(--income-fg)] border-[var(--income-border)]',
    dot: 'bg-[var(--income-dot)]',
  },
  expense: {
    container:
      'bg-[var(--expense-bg)] text-[var(--expense-fg)] border-[var(--expense-border)]',
    dot: 'bg-[var(--expense-dot)]',
  },
  connected: {
    container:
      'bg-[var(--tag-connected-bg)] text-[var(--tag-connected-fg)] border-[var(--tag-connected-border)]',
    dot: 'bg-[var(--tag-connected-dot)]',
  },
  disconnected: {
    container:
      'bg-[var(--tag-disconnected-bg)] text-[var(--tag-disconnected-fg)] border-[var(--tag-disconnected-border)]',
    dot: 'bg-[var(--tag-disconnected-dot)]',
  },
  success: {
    container:
      'bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border-[var(--status-success-border)]',
    dot: 'bg-[var(--income-dot)]',
  },
  warning: {
    container:
      'bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)] border-[var(--status-warning-border)]',
    dot: 'bg-[var(--status-warning-fg)]',
  },
  error: {
    container:
      'bg-[var(--status-error-bg)] text-[var(--status-error-fg)] border-[var(--status-error-border)]',
    dot: 'bg-[var(--status-error-fg)]',
  },
  neutral: {
    container:
      'bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] border-[var(--border-hairline)]',
    dot: 'bg-[var(--text-muted)]',
  },
};

const SIZE_STYLES: Record<BadgeSize, { badge: string; dot: string }> = {
  xs: {
    badge: 'text-[9px] px-1.5 py-0.25 gap-1 font-medium rounded-sm border',
    dot: 'w-1 h-1',
  },
  sm: {
    badge: 'text-[10px] px-2 py-0.5 gap-1.5 font-medium rounded-md border',
    dot: 'w-1.5 h-1.5',
  },
  md: {
    badge: 'text-xs px-2.5 py-1 gap-1.5 font-semibold rounded-md border',
    dot: 'w-2 h-2',
  },
};

export function Badge({
  variant,
  size = 'sm',
  dot = false,
  pulse = false,
  children,
  className = '',
  ...rest
}: BadgeProps) {
  const variantConfig = VARIANT_STYLES[variant] || VARIANT_STYLES.neutral;
  const sizeConfig = SIZE_STYLES[size] || SIZE_STYLES.sm;

  return (
    <span
      className={`inline-flex items-center tracking-tight select-none shrink-0 ${sizeConfig.badge} ${variantConfig.container} ${className}`}
      {...rest}
    >
      {dot && (
        <span
          className={`rounded-full shrink-0 ${sizeConfig.dot} ${variantConfig.dot} ${
            pulse ? 'animate-pulse' : ''
          }`}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}
