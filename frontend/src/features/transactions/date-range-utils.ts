import { getTodayIST, formatDateHuman } from '@/lib/format';

export type DateRangePreset =
  | 'all'
  | 'this_month'
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'last_month'
  | 'this_year'
  | 'custom';

export interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

function toISOString(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Computes deterministic start and end dates (YYYY-MM-DD) for presets in Asia/Kolkata.
 */
export function computePresetDateRange(
  preset: DateRangePreset,
  baseDateStr?: string
): DateRange {
  const todayStr = baseDateStr || getTodayIST();
  const [year, month, day] = todayStr.split('-').map(Number);

  switch (preset) {
    case 'all':
      return { startDate: '', endDate: '' };

    case 'today':
      return { startDate: todayStr, endDate: todayStr };

    case 'yesterday': {
      const yDate = new Date(Date.UTC(year, month - 1, day - 1));
      const s = toISOString(yDate);
      return { startDate: s, endDate: s };
    }

    case 'this_week': {
      const cur = new Date(Date.UTC(year, month - 1, day));
      const dayOfWeek = cur.getUTCDay(); // 0 = Sun, 1 = Mon ...
      const mondayOffset = (dayOfWeek + 6) % 7;
      const sundayOffset = (7 - dayOfWeek) % 7;
      const mon = new Date(Date.UTC(year, month - 1, day - mondayOffset));
      const sun = new Date(Date.UTC(year, month - 1, day + sundayOffset));
      return { startDate: toISOString(mon), endDate: toISOString(sun) };
    }

    case 'last_week': {
      const cur = new Date(Date.UTC(year, month - 1, day));
      const dayOfWeek = cur.getUTCDay();
      const mondayOffset = (dayOfWeek + 6) % 7;
      const lastMon = new Date(Date.UTC(year, month - 1, day - mondayOffset - 7));
      const lastSun = new Date(Date.UTC(year, month - 1, day - mondayOffset - 1));
      return { startDate: toISOString(lastMon), endDate: toISOString(lastSun) };
    }

    case 'this_month': {
      const start = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      return { startDate: start, endDate: end };
    }

    case 'last_month': {
      const prevYear = month === 1 ? year - 1 : year;
      const prevMonth = month === 1 ? 12 : month - 1;
      const start = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
      const lastDay = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate();
      const end = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      return { startDate: start, endDate: end };
    }

    case 'this_year': {
      return {
        startDate: `${year}-01-01`,
        endDate: `${year}-12-31`,
      };
    }

    case 'custom':
    default:
      return { startDate: '', endDate: '' };
  }
}

/**
 * Formats a date range into standard readable string: "1 Oct 2026 – 31 Oct 2026"
 */
export function formatDateRangeLabel(startDate: string, endDate: string): string {
  if (!startDate && !endDate) return 'All dates';
  if (startDate === endDate) return formatDateHuman(startDate);
  return `${formatDateHuman(startDate)} – ${formatDateHuman(endDate)}`;
}

/**
 * Validates that startDate is not after endDate.
 */
export function isValidDateRange(startDate: string, endDate: string): boolean {
  if (!startDate || !endDate) return false;
  return startDate <= endDate;
}
