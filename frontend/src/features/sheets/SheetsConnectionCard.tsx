'use client';

import React, { useState, useEffect } from 'react';

interface SheetConnectionData {
  id: string;
  user_id: string;
  spreadsheet_id: string;
  spreadsheet_url: string;
  sheet_name: string;
  sync_status: 'idle' | 'syncing' | 'connected' | 'error';
  last_synced_at?: string | null;
  last_error?: string | null;
}

export function SheetsConnectionCard() {
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const [connected, setConnected] = useState(false);
  const [connection, setConnection] = useState<SheetConnectionData | null>(null);
  const [serviceAccountEmail, setServiceAccountEmail] = useState<string | null>(null);
  const [isConfigured, setIsConfigured] = useState(true);

  const [sheetUrlInput, setSheetUrlInput] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [copiedEmail, setCopiedEmail] = useState(false);

  const fetchConnection = async () => {
    try {
      const res = await fetch('/api/backend/sheets/connection', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setConnected(data.connected);
        setConnection(data.connection);
        setServiceAccountEmail(data.serviceAccountEmail);
        setIsConfigured(data.isConfigured);
      }
    } catch {
      // Ignore network errors
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    fetch('/api/backend/sheets/connection', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted || !data) return;
        setConnected(data.connected);
        setConnection(data.connection);
        setServiceAccountEmail(data.serviceAccountEmail);
        setIsConfigured(data.isConfigured);
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleCopyEmail = () => {
    if (!serviceAccountEmail) return;
    navigator.clipboard.writeText(serviceAccountEmail);
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2000);
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!sheetUrlInput.trim()) {
      setErrorMessage('Please enter a Google Sheet URL or Spreadsheet ID.');
      return;
    }

    try {
      setConnecting(true);
      const res = await fetch('/api/backend/sheets/connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spreadsheetUrl: sheetUrlInput.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || 'Failed to connect Google Sheet.');
      } else {
        setConnected(true);
        setConnection(data.connection);
        setSuccessMessage('Google Sheet connected and initialized successfully!');
        setSheetUrlInput('');
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Network error');
    } finally {
      setConnecting(false);
    }
  };

  const handleSyncNow = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      setSyncing(true);
      const res = await fetch('/api/backend/sheets/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || 'Sync failed');
      } else {
        setSuccessMessage(data.message || 'Sync completed successfully!');
        await fetchConnection();
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Sync network error');
    } finally {
      setSyncing(false);
    }
  };

  const handleRetryFailed = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      setRetrying(true);
      const res = await fetch('/api/backend/sheets/retry', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || 'Retry failed');
      } else {
        setSuccessMessage(data.message || 'Failed syncs retried successfully!');
        await fetchConnection();
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Retry network error');
    } finally {
      setRetrying(false);
    }
  };

  const handleReconcile = async () => {
    if (!confirm('Reconcile your entire ledger with the Google Sheet? This will check all transactions and correct any missing records.')) {
      return;
    }
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      setReconciling(true);
      const res = await fetch('/api/backend/sheets/reconcile', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || 'Reconciliation failed');
      } else {
        setSuccessMessage(data.message || 'Reconciliation completed!');
        await fetchConnection();
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Network error');
    } finally {
      setReconciling(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect this Google Sheet? Your existing data in the sheet will remain untouched.')) {
      return;
    }
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      setDisconnecting(true);
      const res = await fetch('/api/backend/sheets/connection', { method: 'DELETE' });
      if (res.ok) {
        setConnected(false);
        setConnection(null);
        setSuccessMessage('Google Sheet disconnected.');
      } else {
        const data = await res.json();
        setErrorMessage(data.error || 'Failed to disconnect');
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Network error');
    } finally {
      setDisconnecting(false);
    }
  };

  const formatTimestamp = (ts?: string | null) => {
    if (!ts) return 'Never';
    try {
      return new Date(ts).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return ts;
    }
  };

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-xl">📊</span>
          <div>
            <h3 className="text-xs font-semibold text-[var(--text-primary)]">
              Google Sheets Synchronization
            </h3>
            <p className="text-[11px] text-[var(--text-muted)]">
              Asynchronously replicate your financial transactions to your personal Google Sheet in near-real-time.
            </p>
          </div>
        </div>
        {connected ? (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Connected
          </span>
        ) : (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--bg-surface-subtle)] text-[var(--text-muted)] border border-[var(--border-hairline)] shrink-0">
            Not Connected
          </span>
        )}
      </div>

      {/* Notifications */}
      {errorMessage && (
        <div className="text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 p-2.5 rounded-lg">
          {errorMessage}
        </div>
      )}
      {successMessage && (
        <div className="text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 p-2.5 rounded-lg">
          {successMessage}
        </div>
      )}

      {loading ? (
        <div className="py-4 text-center text-xs text-[var(--text-muted)]">
          Checking Google Sheets connection...
        </div>
      ) : !isConfigured ? (
        <div className="p-3.5 bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] rounded-lg text-xs space-y-1.5">
          <div className="font-semibold text-[var(--text-primary)]">
            Service Account Configuration Required
          </div>
          <p className="text-[11px] text-[var(--text-muted)]">
            Google Sheets synchronization requires <code className="font-mono bg-[var(--bg-surface)] px-1 rounded">GOOGLE_SERVICE_ACCOUNT_EMAIL</code> and <code className="font-mono bg-[var(--bg-surface)] px-1 rounded">GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY</code> in server environment variables.
          </p>
        </div>
      ) : connected && connection ? (
        /* Connected View */
        <div className="space-y-4 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-[var(--bg-surface-subtle)] p-3 rounded-lg border border-[var(--border-hairline)]">
            <div>
              <span className="text-[11px] text-[var(--text-muted)] block">Spreadsheet</span>
              <a
                href={connection.spreadsheet_url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[var(--text-primary)] hover:underline flex items-center gap-1 mt-0.5"
              >
                <span>Open in Google Sheets</span>
                <span className="text-[10px]">&rarr;</span>
              </a>
            </div>
            <div>
              <span className="text-[11px] text-[var(--text-muted)] block">Sheet Tab</span>
              <span className="font-mono text-[var(--text-primary)]">{connection.sheet_name}</span>
            </div>
            <div>
              <span className="text-[11px] text-[var(--text-muted)] block">Last Synchronized</span>
              <span className="font-mono text-[var(--text-primary)]">
                {formatTimestamp(connection.last_synced_at)}
              </span>
            </div>
            <div>
              <span className="text-[11px] text-[var(--text-muted)] block">Sync Status</span>
              <span className="font-mono capitalize text-[var(--text-primary)]">
                {connection.sync_status}
              </span>
            </div>
          </div>

          {connection.last_error && (
            <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 p-2.5 rounded-lg">
              <span className="font-semibold">Last Sync Issue:</span> {connection.last_error}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleSyncNow}
              disabled={syncing || reconciling || retrying}
              className="px-3 py-1.5 text-xs font-medium bg-[var(--text-primary)] text-[var(--bg-app)] hover:opacity-90 rounded-md transition-opacity cursor-pointer disabled:opacity-50"
            >
              {syncing ? 'Syncing...' : 'Sync Now'}
            </button>
            <button
              type="button"
              onClick={handleRetryFailed}
              disabled={syncing || reconciling || retrying}
              className="px-3 py-1.5 text-xs font-medium border border-amber-300 dark:border-amber-800/60 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30 rounded-md transition-colors cursor-pointer disabled:opacity-50"
            >
              {retrying ? 'Retrying...' : 'Retry Failed Syncs'}
            </button>
            <button
              type="button"
              onClick={handleReconcile}
              disabled={syncing || reconciling || retrying}
              className="px-3 py-1.5 text-xs font-medium border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] rounded-md transition-colors cursor-pointer disabled:opacity-50"
            >
              {reconciling ? 'Reconciling...' : 'Full Reconcile'}
            </button>
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="px-3 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-md transition-colors cursor-pointer ml-auto disabled:opacity-50"
            >
              {disconnecting ? 'Disconnecting...' : 'Disconnect'}
            </button>
          </div>
        </div>
      ) : (
        /* Not Connected: Setup Form */
        <form onSubmit={handleConnect} className="space-y-4 pt-1">
          {serviceAccountEmail && (
            <div className="p-3 bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] rounded-lg text-xs space-y-1.5">
              <div className="font-semibold text-[var(--text-primary)]">
                Step 1: Share your Google Sheet
              </div>
              <p className="text-[11px] text-[var(--text-muted)]">
                Create a spreadsheet in your Google Drive and share it with edit access to our secure service account:
              </p>
              <div className="flex items-center gap-2 mt-1">
                <code className="px-2 py-1 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded font-mono text-[11px] text-[var(--text-primary)] select-all break-all">
                  {serviceAccountEmail}
                </code>
                <button
                  type="button"
                  onClick={handleCopyEmail}
                  className="px-2.5 py-1 text-xs font-medium border border-[var(--border-subtle)] rounded hover:bg-[var(--bg-surface)] transition-colors shrink-0 cursor-pointer"
                >
                  {copiedEmail ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[var(--text-primary)]">
              Step 2: Paste Google Sheet URL or Spreadsheet ID
            </label>
            <input
              type="text"
              value={sheetUrlInput}
              onChange={(e) => setSheetUrlInput(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs.../edit"
              className="w-full px-3 py-2 text-xs bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-lg focus:outline-none focus:border-[var(--text-primary)] text-[var(--text-primary)] font-mono"
            />
          </div>

          <button
            type="submit"
            disabled={connecting || !sheetUrlInput.trim()}
            className="w-full sm:w-auto px-4 py-2 text-xs font-medium bg-[var(--text-primary)] text-[var(--bg-app)] hover:opacity-90 rounded-lg transition-opacity cursor-pointer disabled:opacity-50"
          >
            {connecting ? 'Validating & Connecting...' : 'Connect Spreadsheet'}
          </button>
        </form>
      )}
    </div>
  );
}
