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
  const [hasConnectionError, setHasConnectionError] = useState(false);
  const [isChangingSheet, setIsChangingSheet] = useState(false);

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

  const handleCopyEmail = async () => {
    if (!serviceAccountEmail) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(serviceAccountEmail);
      } else {
        // Fallback for non-secure contexts
        const textarea = document.createElement('textarea');
        textarea.value = serviceAccountEmail;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2000);
    } catch {
      setErrorMessage('Could not copy automatically. Please select and copy the email address manually.');
      setTimeout(() => setErrorMessage(null), 4000);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSheetUrlInput(e.target.value);
    if (hasConnectionError) {
      setHasConnectionError(false);
      setErrorMessage(null);
    }
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setHasConnectionError(false);

    const trimmedInput = sheetUrlInput.trim();
    if (!trimmedInput) {
      setErrorMessage('Please enter your Google Sheet URL or spreadsheet ID.');
      setHasConnectionError(true);
      return;
    }

    // Client-side format validation: accept either full Google Sheets URL or raw Spreadsheet ID
    const isUrl = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/.test(trimmedInput);
    const isId = /^[a-zA-Z0-9-_]{20,80}$/.test(trimmedInput);

    if (!isUrl && !isId) {
      setErrorMessage(
        'Please enter a valid Google Sheets URL (e.g., https://docs.google.com/spreadsheets/d/...) or spreadsheet ID.'
      );
      setHasConnectionError(true);
      return;
    }

    try {
      setConnecting(true);
      const res = await fetch('/api/backend/sheets/connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spreadsheetUrl: trimmedInput }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || 'Failed to connect Google Sheet.');
        setHasConnectionError(true);
      } else {
        setConnected(true);
        setConnection(data.connection);
        setSuccessMessage('Google Sheet connected and initialized successfully!');
        setSheetUrlInput('');
        setHasConnectionError(false);
        setIsChangingSheet(false);
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Network error');
      setHasConnectionError(true);
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
        setIsChangingSheet(false);
        setHasConnectionError(false);
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
    <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl p-4 sm:p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-xl">📊</span>
          <div>
            <h3 className="text-xs font-semibold text-[var(--text-primary)]">
              Google Sheets Synchronization
            </h3>
            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
              Automatically sync your Arth transactions to your personal Google Sheet.
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
          <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
            Google Sheets synchronization requires Workload Identity Federation (WIF) or Service Account credentials in server environment variables.
          </p>
        </div>
      ) : connected && connection && !isChangingSheet ? (
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
              disabled={syncing || reconciling || retrying || disconnecting}
              aria-busy={syncing}
              className="min-w-[85px] px-3 py-1.5 text-xs font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] hover:bg-[var(--action-primary-hover)] rounded-md transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              {syncing ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>Syncing…</span>
                </>
              ) : (
                <span>Sync Now</span>
              )}
            </button>
            <button
              type="button"
              onClick={handleRetryFailed}
              disabled={syncing || reconciling || retrying || disconnecting}
              aria-busy={retrying}
              className="min-w-[125px] px-3 py-1.5 text-xs font-medium border border-amber-300 dark:border-amber-800/60 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30 rounded-md transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              {retrying ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>Retrying…</span>
                </>
              ) : (
                <span>Retry Failed Syncs</span>
              )}
            </button>
            <button
              type="button"
              onClick={handleReconcile}
              disabled={syncing || reconciling || retrying || disconnecting}
              aria-busy={reconciling}
              className="min-w-[100px] px-3 py-1.5 text-xs font-medium border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] rounded-md transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              {reconciling ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>Reconciling…</span>
                </>
              ) : (
                <span>Full Reconcile</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsChangingSheet(true);
                setSheetUrlInput(connection.spreadsheet_url || '');
                setErrorMessage(null);
                setSuccessMessage(null);
                setHasConnectionError(false);
              }}
              disabled={syncing || reconciling || retrying || disconnecting}
              className="px-3 py-1.5 text-xs font-medium border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] rounded-md transition-colors cursor-pointer disabled:opacity-50"
            >
              Change Sheet
            </button>
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={disconnecting}
              aria-busy={disconnecting}
              className="min-w-[95px] px-3 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-md transition-colors cursor-pointer ml-auto disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              {disconnecting ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>Disconnecting…</span>
                </>
              ) : (
                <span>Disconnect</span>
              )}
            </button>
          </div>
        </div>
      ) : (
        /* Not Connected or Changing Sheet: Setup Form */
        <form onSubmit={handleConnect} className="space-y-4 pt-1">
          {connected && connection && (
            <div className="p-3 bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] rounded-lg text-xs flex items-center justify-between">
              <div>
                <span className="font-semibold text-[var(--text-primary)]">Change or Reconnect Google Sheet</span>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Enter a new Google Sheet URL below to pair another spreadsheet.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsChangingSheet(false);
                  setSheetUrlInput('');
                  setErrorMessage(null);
                  setHasConnectionError(false);
                }}
                className="text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline cursor-pointer"
              >
                Back to current sheet
              </button>
            </div>
          )}

          {/* Step 1: Share your Google Sheet */}
          {serviceAccountEmail && (
            <div className="p-3.5 bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] rounded-lg text-xs space-y-2">
              <div className="font-semibold text-[var(--text-primary)]">
                Step 1: Share your Google Sheet
              </div>
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                Create a spreadsheet in Google Sheets and share it with the email address below. Set the permission to Editor so Arth can add your transactions.
              </p>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
                <div className="flex-1 min-w-0 bg-[var(--bg-canvas)] border border-[var(--border-hairline)] rounded-lg px-2.5 py-1.5 flex items-center overflow-hidden">
                  <code className="font-mono text-[11px] text-[var(--text-primary)] select-all overflow-x-auto whitespace-nowrap block w-full no-scrollbar">
                    {serviceAccountEmail}
                  </code>
                </div>
                <button
                  type="button"
                  onClick={handleCopyEmail}
                  aria-label="Copy service account email"
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-subtle)] text-[var(--text-primary)] rounded-lg transition-colors shrink-0 cursor-pointer w-full sm:w-auto"
                >
                  {copiedEmail ? (
                    <>
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span className="text-emerald-600 dark:text-emerald-400">Copied!</span>
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-3.5 h-3.5 text-[var(--text-muted)]"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      <span>Copy Email</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Connect your spreadsheet */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[var(--text-primary)]">
              {connected ? 'Connect your spreadsheet' : 'Step 2: Connect your spreadsheet'}
            </label>
            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
              Copy the link from your Google Sheet&apos;s address bar and paste it below. You can also enter the spreadsheet ID.
            </p>
            <input
              type="text"
              value={sheetUrlInput}
              onChange={handleInputChange}
              placeholder="Paste Google Sheets URL or spreadsheet ID"
              className="w-full px-3.5 py-2.5 text-xs bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg focus:outline-none focus:border-[var(--focus-ring)] focus:ring-1 focus:ring-[var(--focus-ring)] text-[var(--text-primary)] font-mono transition-colors"
            />
          </div>

          {/* Connection Actions */}
          <div className="flex items-center gap-2.5 pt-1">
            <button
              type="submit"
              disabled={connecting || !sheetUrlInput.trim()}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] hover:bg-[var(--action-primary-hover)] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
            >
              {connecting && (
                <svg
                  className="w-3.5 h-3.5 animate-spin text-[var(--action-primary-fg)]"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              )}
              <span>
                {connecting
                  ? 'Connecting…'
                  : hasConnectionError
                  ? 'Retry Connection'
                  : 'Connect Google Sheet'}
              </span>
            </button>

            {isChangingSheet && connected && (
              <button
                type="button"
                onClick={() => {
                  setIsChangingSheet(false);
                  setSheetUrlInput('');
                  setErrorMessage(null);
                  setHasConnectionError(false);
                }}
                className="px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              >
                Cancel
              </button>
            )}
          </div>

          {/* Privacy Note */}
          <p className="text-[11px] text-[var(--text-muted)] flex items-start gap-1.5 pt-0.5 leading-relaxed">
            <span className="text-xs shrink-0" aria-hidden="true">🔒</span>
            <span>Your spreadsheet remains private. Arth uses the sharing permission you grant to sync your transactions.</span>
          </p>
        </form>
      )}
    </div>
  );
}
