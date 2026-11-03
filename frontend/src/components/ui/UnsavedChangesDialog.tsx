'use client';

import React from 'react';
import { useBackHandler } from '@/features/navigation';

export interface UnsavedChangesDialogProps {
  isOpen: boolean;
  title?: string;
  message?: string;
  onCancel: () => void;
  onDiscard: () => void;
  onSave?: () => void;
  isSaving?: boolean;
}

export function UnsavedChangesDialog({
  isOpen,
  title = 'Discard unsaved changes?',
  message = 'You have unsaved changes. If you leave now, your modifications will be lost.',
  onCancel,
  onDiscard,
  onSave,
  isSaving = false,
}: UnsavedChangesDialogProps) {
  // If the user presses Android Back while the confirmation dialog is open,
  // close the dialog first (Priority 1: dialog) and keep editing.
  useBackHandler({
    id: 'unsaved-changes-dialog',
    priority: 'dialog',
    enabled: isOpen,
    onBack: () => {
      onCancel();
      return true;
    },
  });

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="unsaved-changes-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        className="w-full max-w-sm bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl shadow-2xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-full bg-amber-500/10 text-amber-500 shrink-0 text-base font-semibold">
            ⚠
          </div>
          <div className="space-y-1">
            <h3
              id="unsaved-changes-title"
              className="text-sm font-semibold text-[var(--text-primary)]"
            >
              {title}
            </h3>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {message}
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row-reverse items-stretch sm:items-center justify-end gap-2 pt-2 border-t border-[var(--border-hairline)]">
          {onSave && (
            <button
              type="button"
              disabled={isSaving}
              onClick={onSave}
              className="px-3.5 py-2 text-xs font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-lg hover:bg-[var(--action-primary-hover)] transition-colors cursor-pointer disabled:opacity-50"
            >
              {isSaving ? 'Saving…' : 'Save Changes'}
            </button>
          )}

          <button
            type="button"
            onClick={onDiscard}
            className="px-3.5 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 rounded-lg transition-colors cursor-pointer"
          >
            Discard
          </button>

          <button
            type="button"
            onClick={onCancel}
            className="px-3.5 py-2 text-xs font-medium border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
