'use client';

import React, { useEffect, useRef } from 'react';
import { StatementImport } from './StatementImport';
import { useBackHandler } from '@/features/navigation';

interface StatementImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  onImported: (count: number) => void;
  onManualEntry: () => void;
}

export function StatementImportModal({
  isOpen,
  onClose,
  userId,
  onImported,
  onManualEntry,
}: StatementImportModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Hardware / gesture back button dismisses modal on mobile
  useBackHandler({
    id: 'modal-statement-import',
    priority: 'modal',
    enabled: isOpen,
    onBack: () => {
      onClose();
      return true;
    },
  });

  // Handle Escape key to close
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-xs transition-opacity p-0 md:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="statement-import-modal-title"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal / Bottom Sheet Card */}
      <div
        ref={modalRef}
        className="relative z-10 w-full max-h-[92vh] md:max-w-5xl lg:max-w-6xl overflow-y-auto overflow-x-hidden bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-t-2xl md:rounded-xl shadow-2xl p-4 sm:p-6 transition-all"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        {/* Header with Title and Close Button */}
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-[var(--border-hairline)]">
          <div>
            <h2 id="statement-import-modal-title" className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
              Import Bank Statement
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Securely parse PDF, CSV, XLSX, or XLS statements directly on this device.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] transition-colors cursor-pointer"
            aria-label="Close statement import"
          >
            <span className="text-lg leading-none" aria-hidden="true">✕</span>
          </button>
        </div>

        {/* Embedded Shared Statement Import Engine */}
        <StatementImport
          userId={userId}
          onImported={(count) => {
            onImported(count);
          }}
          onManualEntry={() => {
            onClose();
            onManualEntry();
          }}
        />
      </div>
    </div>
  );
}
