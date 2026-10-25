'use client';

import React, { useState, useTransition } from 'react';
import { deleteAccountAction } from '@/app/login/actions';

interface DeleteAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string;
}

export function DeleteAccountModal({
  isOpen,
  onClose,
  userEmail,
}: DeleteAccountModalProps) {
  const [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!isOpen) return null;

  const isDeleteConfirmed = confirmation.trim() === 'DELETE';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isDeleteConfirmed) {
      setError('Please type DELETE in capital letters to confirm.');
      return;
    }

    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set('confirmation', confirmation.trim());
      formData.set('password', password);

      const res = await deleteAccountAction(formData);
      if (res.error) {
        setError(res.error);
        return;
      }

      if (res.redirectUrl) {
        window.location.href = res.redirectUrl;
      } else {
        window.location.href = '/login?message=account_deleted';
      }
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl shadow-xl overflow-hidden p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 font-bold text-sm">
              ⚠
            </span>
            <div>
              <h2
                id="delete-modal-title"
                className="text-sm sm:text-base font-bold text-[var(--text-primary)]"
              >
                Delete Account
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Permanent and irreversible action
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            aria-label="Close dialog"
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-1 rounded-md"
          >
            ✕
          </button>
        </div>

        {/* Warning Callout */}
        <div className="p-3 text-xs rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-300 space-y-1">
          <div className="font-semibold">This operation cannot be undone.</div>
          <p className="text-[11px] leading-relaxed text-rose-700 dark:text-rose-300/90">
            All data associated with {userEmail ? <strong className="font-mono">{userEmail}</strong> : 'your account'} —
            including transactions, custom categories, counterparty people records, and debt/loan history —
            will be permanently purged from the database immediately.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div
              role="alert"
              className="p-2.5 text-xs rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300"
            >
              {error}
            </div>
          )}

          {/* Password confirmation */}
          <div className="space-y-1.5">
            <label
              htmlFor="delete-password"
              className="block text-xs font-semibold text-[var(--text-primary)]"
            >
              Current Password
            </label>
            <input
              id="delete-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isPending}
              placeholder="Enter your current password"
              className="w-full px-3 py-2 text-xs rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-hidden focus:ring-1 focus:ring-[var(--action-primary-bg)]"
            />
            <p className="text-[10px] text-[var(--text-muted)]">
              Required for email/password accounts to verify ownership.
            </p>
          </div>

          {/* Confirmation text input */}
          <div className="space-y-1.5">
            <label
              htmlFor="delete-confirmation"
              className="block text-xs font-semibold text-[var(--text-primary)]"
            >
              Type <span className="font-mono text-rose-700 dark:text-rose-400">DELETE</span> to confirm
            </label>
            <input
              id="delete-confirmation"
              type="text"
              autoComplete="off"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              disabled={isPending}
              placeholder="DELETE"
              className="w-full px-3 py-2 text-xs font-mono rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-hidden focus:ring-1 focus:ring-rose-500"
            />
          </div>

          {/* Action buttons */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-3.5 py-2 text-xs font-medium border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-md transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isDeleteConfirmed || isPending}
              className="px-4 py-2 text-xs font-semibold rounded-md bg-rose-700 hover:bg-rose-800 disabled:opacity-40 disabled:hover:bg-rose-700 text-white transition-all shadow-xs cursor-pointer disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {isPending ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Deleting Account...</span>
                </>
              ) : (
                <span>Permanently Delete Account</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
