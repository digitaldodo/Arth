'use client';

import React, { useState, useEffect } from 'react';
import { syncEngine, type SyncState } from './sync-engine';

interface HeaderSyncIndicatorProps {
  onOpenSyncSettings?: () => void;
  className?: string;
}

export function HeaderSyncIndicator({
  onOpenSyncSettings,
  className = '',
}: HeaderSyncIndicatorProps) {
  const [syncState, setSyncState] = useState<SyncState>(syncEngine.getState());

  useEffect(() => {
    return syncEngine.subscribe((state) => {
      setSyncState(state);
    });
  }, []);

  const { isOnline, isSyncing, pendingCount, failedCount } = syncState;

  let label = 'Synced';
  let dotColor = 'bg-emerald-500';
  let isPulsing = false;

  if (!isOnline) {
    label = 'Offline';
    dotColor = 'bg-amber-500';
  } else if (isSyncing) {
    label = 'Syncing…';
    dotColor = 'bg-sky-500';
    isPulsing = true;
  } else if (failedCount > 0) {
    label = `${failedCount} failed`;
    dotColor = 'bg-rose-500';
  } else if (pendingCount > 0) {
    label = `${pendingCount} pending`;
    dotColor = 'bg-amber-500';
  }

  return (
    <button
      type="button"
      onClick={onOpenSyncSettings}
      title={`Data & Sync: ${label}. Click to open sync details.`}
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-subtle)] transition-colors cursor-pointer select-none ${className}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor} ${
          isPulsing ? 'animate-pulse' : ''
        }`}
        aria-hidden="true"
      />
      <span className="font-mono text-[10px] sm:text-[11px] tracking-tight">{label}</span>
    </button>
  );
}
