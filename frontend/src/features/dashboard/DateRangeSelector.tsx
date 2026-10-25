'use client';

import React, { useState } from 'react';
import {
  type DashboardDateRangePreset,
} from '@arth/contracts';
import { formatDateHuman } from '@/lib/format';

interface DateRangeSelectorProps {
  currentPreset: DashboardDateRangePreset;
  startDate: string;
  endDate: string;
  onSelectPreset: (preset: DashboardDateRangePreset) => void;
  onApplyCustomRange: (startDate: string, endDate: string) => void;
}

const PRESETS: Array<{ id: DashboardDateRangePreset; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'this_week', label: 'This Week' },
  { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'this_year', label: 'This Year' },
  { id: 'custom', label: 'Custom' },
];

export function DateRangeSelector({
  currentPreset,
  startDate,
  endDate,
  onSelectPreset,
  onApplyCustomRange,
}: DateRangeSelectorProps) {
  const [isCustomOpen, setIsCustomOpen] = useState(false);
  const [customStart, setCustomStart] = useState(startDate);
  const [customEnd, setCustomEnd] = useState(endDate);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handlePresetClick = (presetId: DashboardDateRangePreset) => {
    if (presetId === 'custom') {
      setIsCustomOpen(true);
      setCustomStart(startDate);
      setCustomEnd(endDate);
      setValidationError(null);
    } else {
      setIsCustomOpen(false);
      onSelectPreset(presetId);
    }
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customStart || !customEnd) {
      setValidationError('Both start and end dates are required.');
      return;
    }
    if (customStart > customEnd) {
      setValidationError('Start date cannot be after end date.');
      return;
    }
    setValidationError(null);
    setIsCustomOpen(false);
    onApplyCustomRange(customStart, customEnd);
  };

  return (
    <div className="space-y-2">
      {/* Preset Pill Buttons */}
      <div
        role="group"
        aria-label="Select date range"
        className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none"
      >
        {PRESETS.map((p) => {
          const isActive = currentPreset === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => handlePresetClick(p.id)}
              className={`shrink-0 px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                isActive
                  ? 'bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] shadow-xs'
                  : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:text-[var(--text-primary)] hover:border-[var(--border-hairline)]'
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Range Caption Banner */}
      <div className="flex flex-wrap items-center justify-between text-xs text-[var(--text-muted)] px-0.5">
        <div className="flex items-center gap-1.5 font-mono">
          <span>📅</span>
          <span>
            {formatDateHuman(startDate)} – {formatDateHuman(endDate)}
          </span>
        </div>
      </div>

      {/* Custom Date Range Popover/Drawer */}
      {isCustomOpen && (
        <form
          onSubmit={handleCustomSubmit}
          className="p-3.5 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl space-y-3 shadow-sm mt-2 transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-primary)]">
              Select Custom Period
            </span>
            <button
              type="button"
              onClick={() => setIsCustomOpen(false)}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              ✕ Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="custom-start-date"
                className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1"
              >
                Start Date
              </label>
              <input
                id="custom-start-date"
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="w-full text-xs font-mono px-2.5 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-primary)] focus:outline-hidden focus:border-[var(--action-primary-bg)]"
                required
              />
            </div>

            <div>
              <label
                htmlFor="custom-end-date"
                className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1"
              >
                End Date
              </label>
              <input
                id="custom-end-date"
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="w-full text-xs font-mono px-2.5 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-primary)] focus:outline-hidden focus:border-[var(--action-primary-bg)]"
                required
              />
            </div>
          </div>

          {validationError && (
            <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">
              {validationError}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsCustomOpen(false)}
              className="px-3 py-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3.5 py-1 text-xs font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-md hover:bg-[var(--action-primary-hover)] transition-colors"
            >
              Apply Range
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
