'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  type TransactionDTO,
  type CategoryDTO,
  type TransactionType,
} from '@arth/contracts';
import { fetchTransactions, fetchCategories } from '@/lib/api-client';
import { formatDateHuman } from '@/lib/format';

interface TransactionLedgerProps {
  onOpenQuickAdd: () => void;
  refreshTrigger: number;
}

export function TransactionLedger({ onOpenQuickAdd, refreshTrigger }: TransactionLedgerProps) {
  const [transactions, setTransactions] = useState<TransactionDTO[]>([]);
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedType, setSelectedType] = useState<TransactionType | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  useEffect(() => {
    let isMounted = true;

    Promise.all([
      fetchTransactions({
        type: selectedType === 'all' ? undefined : selectedType,
        category_id: selectedCategory === 'all' ? undefined : selectedCategory,
        page_size: 50,
      }),
      fetchCategories(),
    ])
      .then(([txnRes, catRes]) => {
        if (!isMounted) return;
        setTransactions(txnRes.items || []);
        setCategories(catRes.categories || []);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : 'Failed to load ledger data';
        setError(msg);
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedType, selectedCategory, refreshTrigger]);

  // Compute Net Cash Flow strictly from visible transactions
  const { totalIncomePaise, totalExpensePaise, netCashFlowPaise } = useMemo(() => {
    let income = BigInt(0);
    let expense = BigInt(0);

    for (const t of transactions) {
      const p = BigInt(t.amount_paise);
      if (t.type === 'income') {
        income += p;
      } else {
        expense += p;
      }
    }

    return {
      totalIncomePaise: income,
      totalExpensePaise: expense,
      netCashFlowPaise: income - expense,
    };
  }, [transactions]);

  const netFormatted = useMemo(() => {
    const isNeg = netCashFlowPaise < BigInt(0);
    const abs = isNeg ? -netCashFlowPaise : netCashFlowPaise;
    const whole = abs / BigInt(100);
    const frac = abs % BigInt(100);
    const formatted = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(whole);

    return `${isNeg ? '-' : '+'}${formatted}.${frac.toString().padStart(2, '0')}`;
  }, [netCashFlowPaise]);

  return (
    <div className="space-y-6">
      {/* 1. Net Cash Flow & Summary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl shadow-xs">
        <div>
          <span className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-medium">
            Net Cash Flow
          </span>
          <div
            className={`text-2xl font-mono tracking-tight font-semibold mt-0.5 ${
              netCashFlowPaise > BigInt(0)
                ? 'text-emerald-600 dark:text-emerald-400'
                : netCashFlowPaise < BigInt(0)
                ? 'text-red-600 dark:text-red-400'
                : 'text-[var(--text-primary)]'
            }`}
          >
            {netFormatted}
          </div>
          <span className="text-[10px] text-[var(--text-muted)]">
            Computed from current view
          </span>
        </div>

        <div className="border-t md:border-t-0 md:border-l border-[var(--border-hairline)] pt-2 md:pt-0 md:pl-4">
          <span className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-medium">
            Total Income
          </span>
          <div className="text-lg font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
            +₹{(Number(totalIncomePaise) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="border-t md:border-t-0 md:border-l border-[var(--border-hairline)] pt-2 md:pt-0 md:pl-4">
          <span className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-medium">
            Total Expense
          </span>
          <div className="text-lg font-mono text-red-600 dark:text-red-400 mt-0.5">
            -₹{(Number(totalExpensePaise) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* 2. Filter Bar & Quick Add Trigger */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-2 border-b border-[var(--border-hairline)]">
        <div className="flex items-center gap-2">
          {/* Type Segmented Filter */}
          <div className="flex p-0.5 bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] rounded-lg text-xs font-medium">
            {(['all', 'expense', 'income'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setSelectedType(t)}
                className={`px-3 py-1 rounded-md capitalize transition-colors cursor-pointer ${
                  selectedType === t
                    ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs font-semibold'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Category Dropdown */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="text-xs bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-lg px-2.5 py-1.5 text-[var(--text-secondary)] focus:outline-hidden"
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.type})
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={onOpenQuickAdd}
          className="inline-flex items-center justify-center gap-1 px-4 py-1.5 text-xs font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-lg hover:bg-[var(--action-primary-hover)] transition-colors shadow-xs cursor-pointer"
        >
          <span>+ Record Entry</span>
        </button>
      </div>

      {/* 3. Transaction Items / Table View */}
      {error && (
        <div className="p-3 text-xs bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 rounded-md">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2 py-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-12 bg-[var(--bg-surface-subtle)] animate-pulse rounded-lg border border-[var(--border-hairline)]"
            />
          ))}
        </div>
      ) : transactions.length === 0 ? (
        <div className="text-center py-12 px-4 border border-dashed border-[var(--border-subtle)] rounded-xl bg-[var(--bg-surface)]">
          <div className="text-2xl mb-2">📋</div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
            No transactions recorded yet
          </h3>
          <p className="text-xs text-[var(--text-muted)] max-w-sm mx-auto mb-4">
            Start logging your daily income and expense transactions with instant categorization.
          </p>
          <button
            type="button"
            onClick={onOpenQuickAdd}
            className="px-4 py-2 text-xs font-medium bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-lg hover:bg-[var(--action-primary-hover)] transition-colors cursor-pointer"
          >
            + Record First Transaction
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {transactions.map((txn) => {
            const isIncome = txn.type === 'income';
            return (
              <div
                key={txn.id}
                className="flex items-center justify-between p-3.5 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl hover:border-[var(--border-subtle)] transition-colors"
              >
                {/* Left: Category, Date, Badges */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[var(--text-primary)]">
                      {txn.description || txn.category_name || 'Uncategorized'}
                    </span>
                    {txn.description && txn.category_name && (
                      <span className="text-xs text-[var(--text-secondary)] truncate max-w-[160px] md:max-w-xs">
                        • {txn.category_name}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
                    <span>{formatDateHuman(txn.transaction_date)}</span>
                    <span>•</span>
                    <span className="capitalize">{txn.payment_method}</span>
                    {txn.necessity && (
                      <>
                        <span>•</span>
                        <span
                          className={`capitalize px-1.5 py-0.5 rounded text-[9px] font-medium ${
                            txn.necessity === 'essential'
                              ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                              : txn.necessity === 'optional'
                              ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                              : 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300'
                          }`}
                        >
                          {txn.necessity}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Right: Amount */}
                <div className="text-right">
                  <div
                    className={`font-mono text-sm md:text-base font-semibold tracking-tight ${
                      isIncome
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-[var(--text-primary)]'
                    }`}
                  >
                    {isIncome ? `+${txn.formatted_inr}` : `-${txn.formatted_inr}`}
                  </div>
                  {txn.notes && (
                    <span className="text-[10px] text-[var(--text-muted)]" title={txn.notes}>
                      note 📝
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
