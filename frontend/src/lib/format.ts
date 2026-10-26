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
 * Formats a date string (YYYY-MM-DD or ISO) into standard Indian format: "DD-MM-YYYY" (e.g. "24-10-2026")
 */
export function formatDateHuman(dateStr: string): string {
  if (!dateStr) return '';
  const trimmed = dateStr.trim();
  if (/^\d{2}-\d{2}-\d{4}$/.test(trimmed)) {
    return trimmed;
  }
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${day.padStart(2, '0')}-${month.padStart(2, '0')}-${year}`;
  }
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    const parts = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).formatToParts(d);
    const day = parts.find((p) => p.type === 'day')?.value ?? '';
    const month = parts.find((p) => p.type === 'month')?.value ?? '';
    const year = parts.find((p) => p.type === 'year')?.value ?? '';
    return `${day}-${month}-${year}`;
  }
  return dateStr;
}

/**
 * Formats a date string (YYYY-MM-DD or ISO) into slash-separated Indian format: "DD/MM/YYYY" (e.g. "24/10/2026")
 */
export function formatDateSlash(dateStr: string): string {
  if (!dateStr) return '';
  const hyphenated = formatDateHuman(dateStr);
  return hyphenated.replace(/-/g, '/');
}

/**
 * Formats an ISO timestamp into human-readable IST: "DD-MM-YYYY, hh:mm AM/PM" (e.g. "24-10-2026, 04:30 PM")
 */
export function formatDateTimeIST(isoStr: string): string {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;

  const parts = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(d);

  const day = parts.find((p) => p.type === 'day')?.value ?? '';
  const month = parts.find((p) => p.type === 'month')?.value ?? '';
  const year = parts.find((p) => p.type === 'year')?.value ?? '';
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '';
  const dayPeriod = parts.find((p) => p.type === 'dayPeriod')?.value?.toUpperCase() ?? '';

  return `${day}-${month}-${year}, ${hour}:${minute} ${dayPeriod}`;
}
