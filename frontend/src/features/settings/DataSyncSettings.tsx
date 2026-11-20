'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { syncEngine, type SyncState } from '@/features/sync/sync-engine';
import { getCachedTransactions } from '@/lib/offline-db';
import { StatusBanner } from '@/components/ui/StatusBanner';

interface DataSyncSettingsProps {
  userId: string;
  onBack: () => void;
}

export function DataSyncSettings({ userId, onBack }: DataSyncSettingsProps) {
  const [syncState, setSyncState] = useState<SyncState>(syncEngine.getState());
  const [localTxCount, setLocalTxCount] = useState<number>(0);
  const [isManualSyncing, setIsManualSyncing] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const refreshCounts = useCallback(async () => {
    if (!userId) return;
    try {
      const txs = await getCachedTransactions(userId);
      setLocalTxCount(txs.length);
    } catch {
      // Non-fatal
    }
  }, [userId]);

  useEffect(() => {
    let active = true;

    const loadCounts = () => {
      if (!userId) return;
      void getCachedTransactions(userId).then((txs) => {
        if (active) {
          setLocalTxCount(txs.length);
        }
      }).catch(() => {});
    };

    const unsubscribe = syncEngine.subscribe((state) => {
      setSyncState(state);
      loadCounts();
    });

    const timer = setTimeout(() => {
      loadCounts();
    }, 0);

    return () => {
      active = false;
      clearTimeout(timer);
      unsubscribe();
    };
  }, [userId]);

  const handleSyncNow = async () => {
    setIsManualSyncing(true);
    setFeedback(null);
    try {
      await syncEngine.processQueue(userId);
      const success = await syncEngine.refreshAll(userId);
      await refreshCounts();
      if (success) {
        setFeedback({ message: 'Synchronization completed successfully.', type: 'success' });
      } else {
        setFeedback({
          message: syncEngine.getState().refreshError || 'Synchronization could not refresh all resources.',
          type: 'error',
        });
      }
    } catch (err: unknown) {
      setFeedback({
        message: err instanceof Error ? err.message : 'Synchronization failed. Check connection.',
        type: 'error',
      });
    } finally {
      setIsManualSyncing(false);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  const handleRetryFailed = async () => {
    setIsManualSyncing(true);
    setFeedback(null);
    try {
      await syncEngine.retryFailedMutations(userId);
      await refreshCounts();
      setFeedback({ message: 'Queued operations retried.', type: 'success' });
    } catch (err: unknown) {
      setFeedback({
        message: err instanceof Error ? err.message : 'Retry failed.',
        type: 'error',
      });
    } finally {
      setIsManualSyncing(false);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  const formattedLastSync = syncState.lastSyncedAt
    ? new Date(syncState.lastSyncedAt).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      })
    : 'Never';

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1 cursor-pointer"
        >
          &larr; Back to Settings
        </button>
      </div>

      <div>
        <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
          Data &amp; Synchronization
        </h1>
        <p className="text-xs text-[var(--text-secondary)] mt-0.5">
          Local storage cache, multi-device sync status, and offline queue management
        </p>
      </div>

      {feedback && (
        <StatusBanner
          variant={feedback.type === 'success' ? 'success' : 'error'}
          onDismiss={() => setFeedback(null)}
        >
          {feedback.message}
        </StatusBanner>
      )}

      {/* Sync Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl shadow-xs space-y-1">
          <span className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-medium">
            Connection State
          </span>
          <div className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                syncState.isOnline ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
            />
            <span>{syncState.isOnline ? 'Connected' : 'Offline'}</span>
          </div>
          <span className="text-[10px] text-[var(--text-muted)] block">
            {syncState.isOnline ? 'Cloud database reachable' : 'Working from local device storage'}
          </span>
        </div>

        <div className="p-4 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl shadow-xs space-y-1">
          <span className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-medium">
            Locally Cached Records
          </span>
          <div className="text-2xl font-mono font-semibold text-[var(--text-primary)]">
            {localTxCount}
          </div>
          <span className="text-[10px] text-[var(--text-muted)] block">
            Available offline on this device
          </span>
        </div>

        <div className="p-4 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl shadow-xs space-y-1">
          <span className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-medium">
            Pending Queue
          </span>
          <div className="text-2xl font-mono font-semibold text-[var(--text-primary)]">
            {syncState.pendingCount}
          </div>
          <span className="text-[10px] text-[var(--text-muted)] block">
            {syncState.pendingCount === 0
              ? 'All changes synchronized'
              : `${syncState.pendingCount} mutation${syncState.pendingCount === 1 ? '' : 's'} waiting to upload`}
          </span>
        </div>

        <div className="p-4 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl shadow-xs space-y-1">
          <span className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-medium">
            Last Synced (IST)
          </span>
          <div className="text-sm font-mono font-semibold text-[var(--text-primary)] truncate mt-1">
            {formattedLastSync}
          </div>
          <span className="text-[10px] text-[var(--text-muted)] block">
            Bidirectional sync timestamp
          </span>
        </div>
      </div>

      {/* Sync Actions Card */}
      <div className="p-5 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border-hairline)]">
          <div>
            <h3 className="text-xs font-semibold text-[var(--text-primary)]">
              Manual Synchronization
            </h3>
            <p className="text-[11px] text-[var(--text-muted)]">
              Reconcile offline transactions with PostgreSQL and refresh account balances
            </p>
          </div>
          <button
            type="button"
            onClick={handleSyncNow}
            disabled={isManualSyncing || syncState.isSyncing}
            className="px-4 py-2 text-xs font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-lg hover:bg-[var(--action-primary-hover)] transition-colors shadow-2xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            {isManualSyncing || syncState.isSyncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>

        {syncState.failedCount > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <div>
              <h4 className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                {syncState.failedCount} Failed Queue Item{syncState.failedCount === 1 ? '' : 's'}
              </h4>
              <p className="text-[11px] text-[var(--text-secondary)]">
                Some offline actions could not be committed. You can retry sending them now.
              </p>
            </div>
            <button
              type="button"
              onClick={handleRetryFailed}
              disabled={isManualSyncing}
              className="px-3.5 py-1.5 text-xs font-semibold border border-amber-600/30 bg-[var(--bg-surface)] text-amber-700 dark:text-amber-300 rounded-md hover:bg-amber-500/10 transition-colors cursor-pointer shrink-0"
            >
              Retry Failed
            </button>
          </div>
        )}

        <div className="text-[11px] text-[var(--text-muted)] leading-relaxed space-y-1">
          <p>
            • <strong>Multi-Device Sync</strong>: Changes made on other devices are automatically pulled when this window is focused or online.
          </p>
          <p>
            • <strong>Local-First Guarantee</strong>: Your entries are saved immediately to local IndexedDB before uploading, ensuring zero data loss during network interruptions.
          </p>
          <p>
            • <strong>Authoritative Integrity</strong>: PostgreSQL remains the single source of truth for balances, RLS access control, and transaction history.
          </p>
        </div>
      </div>
    </div>
  );
}
