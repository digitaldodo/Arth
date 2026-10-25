/**
 * Core currency and date formatting utilities for Arth.
 * Adheres strictly to ANTIGRAVITY.md (Rule 5: amounts in paise)
 * and ARTH_DESIGN_SYSTEM.md Section 3.2 (Indian lakh/crore notation).
 */

export {
  parseINRToPaise,
  paiseToDecimal,
  formatPaiseToINR,
} from '@arth/contracts';

/**
 * Returns today's date string formatted as YYYY-MM-DD in Asia/Kolkata timezone.
 */
export function getTodayIST(): string {
  // Format current date in Asia/Kolkata timezone
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date()); // Returns "YYYY-MM-DD"
}

/**
 * Formats a YYYY-MM-DD date into human-readable Indian format: "24 Oct 2026"
 */
export function formatDateHuman(dateStr: string): string {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) return dateStr;
  const d = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

/**
 * Formats an ISO timestamp into human-readable IST: "24 Oct 2026, 04:30 PM"
 */
export function formatDateTimeIST(isoStr: string): string {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}
