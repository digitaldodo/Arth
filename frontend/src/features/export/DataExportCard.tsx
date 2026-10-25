'use client';

import React, { useState } from 'react';
import type { TransactionDTO, CategoryDTO } from '@arth/contracts';
import { generateTransactionsCSV, downloadCSV } from '@/lib/export/csv-export';
import { generateBackupJSON, downloadJSON, type ExportUserMetadata } from '@/lib/export/json-export';

interface DataExportCardProps {
  user: ExportUserMetadata;
}

export function DataExportCard({ user }: DataExportCardProps) {
  const [isExportingCSV, setIsExportingCSV] = useState(false);
  const [isExportingJSON, setIsExportingJSON] = useState(false);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  /**
   * Fetches every transaction across all paginated pages from the backend proxy.
   */
  const fetchAllTransactions = async (): Promise<{
    transactions: TransactionDTO[];
    categories: CategoryDTO[];
  }> => {
    // 1. Fetch categories
    const catRes = await fetch('/api/backend/categories');
    if (!catRes.ok) {
      throw new Error(`Failed to load category taxonomy (${catRes.status})`);
    }
    const catData = await catRes.json();
    const categories: CategoryDTO[] = catData.categories || [];

    // 2. Paginate transactions
    const allTransactions: TransactionDTO[] = [];
    let page = 1;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
      setProgressText(`Fetching records (page ${page})...`);
      const txRes = await fetch(
        `/api/backend/transactions?page=${page}&limit=${limit}`
      );
      if (!txRes.ok) {
        throw new Error(
          `Failed to load transactions on page ${page} (${txRes.status}). Export halted to prevent partial output.`
        );
      }
      const txData = await txRes.json();
      const records: TransactionDTO[] = txData.transactions || [];
      allTransactions.push(...records);

      if (records.length < limit || !txData.pagination?.hasMore) {
        hasMore = false;
      } else {
        page++;
      }
    }

    return { transactions: allTransactions, categories };
  };

  const getTodayDateString = () => {
    try {
      const now = new Date();
      // Format in Asia/Kolkata
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(now);
      return parts;
    } catch {
      return new Date().toISOString().split('T')[0];
    }
  };

  const handleExportCSV = async () => {
    if (isExportingCSV || isExportingJSON) return;
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsExportingCSV(true);
    setProgressText('Preparing CSV export...');

    try {
      const { transactions, categories } = await fetchAllTransactions();
      setProgressText(`Formatting ${transactions.length} transactions...`);
      const csv = generateTransactionsCSV(transactions, categories);
      const filename = `Arth-Transactions-${getTodayDateString()}.csv`;
      downloadCSV(csv, filename);
      setSuccessMessage(
        `Successfully exported ${transactions.length} transaction(s) to ${filename}`
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'CSV export failed';
      setErrorMessage(message);
    } finally {
      setIsExportingCSV(false);
      setProgressText(null);
    }
  };

  const handleExportJSON = async () => {
    if (isExportingCSV || isExportingJSON) return;
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsExportingJSON(true);
    setProgressText('Preparing JSON backup...');

    try {
      const { transactions, categories } = await fetchAllTransactions();
      setProgressText(`Formatting JSON data structure...`);
      const json = generateBackupJSON(transactions, categories, user);
      const filename = `Arth-Backup-${getTodayDateString()}.json`;
      downloadJSON(json, filename);
      setSuccessMessage(
        `Successfully generated complete data backup (${transactions.length} transactions, ${categories.length} categories) to ${filename}`
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'JSON backup generation failed';
      setErrorMessage(message);
    } finally {
      setIsExportingJSON(false);
      setProgressText(null);
    }
  };

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-xl">💾</span>
        <div>
          <h3 className="text-xs font-semibold text-[var(--text-primary)]">
            Data Export &amp; Backup
          </h3>
          <p className="text-[11px] text-[var(--text-muted)]">
            Export your entire transaction ledger and category taxonomy for offline analysis or data recovery.
          </p>
        </div>
      </div>

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

      {progressText && (
        <div className="text-xs text-[var(--text-secondary)] font-mono flex items-center gap-2">
          <span className="animate-spin">⏳</span>
          <span>{progressText}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        {/* CSV Export Option */}
        <div className="p-3.5 bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] rounded-lg space-y-2 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-[var(--text-primary)]">
                CSV Spreadsheet Export
              </h4>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-muted)]">
                .csv
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] mt-1">
              Human-readable tabular export suitable for Excel, Google Sheets, or Numbers. Includes sanitized formula protection.
            </p>
          </div>
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={isExportingCSV || isExportingJSON}
            className="w-full mt-2 py-2 px-3 text-xs font-medium border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-surface)] rounded-md transition-colors cursor-pointer disabled:opacity-50 text-center"
          >
            {isExportingCSV ? 'Exporting CSV...' : 'Download CSV'}
          </button>
        </div>

        {/* JSON Export Option */}
        <div className="p-3.5 bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] rounded-lg space-y-2 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-[var(--text-primary)]">
                Full JSON Backup
              </h4>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-muted)]">
                .json
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] mt-1">
              Structured, versioned backup preserving exact integer paise amounts, category relationships, and timestamps.
            </p>
          </div>
          <button
            type="button"
            onClick={handleExportJSON}
            disabled={isExportingCSV || isExportingJSON}
            className="w-full mt-2 py-2 px-3 text-xs font-medium border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-surface)] rounded-md transition-colors cursor-pointer disabled:opacity-50 text-center"
          >
            {isExportingJSON ? 'Generating Backup...' : 'Download JSON'}
          </button>
        </div>
      </div>
    </div>
  );
}
