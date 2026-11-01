import type { TransactionDTO, NecessityClass } from './transactions.js';

export type DashboardDateRangePreset =
  | 'lifetime'
  | 'today'
  | 'this_week'
  | 'this_month'
  | 'last_month'
  | 'this_year'
  | 'custom';

export interface CategorySpendingDTO {
  category_id: string;
  category_name: string;
  category_color: string | null;
  category_icon: string | null;
  amount_paise: number;
  formatted_inr: string;
  share_percentage: number; // e.g. 42.5 for 42.5%, or 0 if zero total expenses
}

export interface NecessitySpendingDTO {
  necessity: NecessityClass;
  label: string;
  amount_paise: number;
  formatted_inr: string;
  share_percentage: number;
}

export interface DashboardSummaryResponse {
  start_date: string | null; // YYYY-MM-DD or null for lifetime
  end_date: string | null; // YYYY-MM-DD or null for lifetime
  income_paise: number;
  expenses_paise: number;
  net_cash_flow_paise: number;
  formatted_income: string;
  formatted_expenses: string;
  formatted_net_cash_flow: string;
  spending_composition: CategorySpendingDTO[];
  spending_by_necessity?: NecessitySpendingDTO[];
  recent_transactions: TransactionDTO[];
  has_activity_in_range: boolean;
  total_active_transaction_count: number;
}

export interface DashboardSummaryQuery {
  start_date?: string; // YYYY-MM-DD (omitted for lifetime)
  end_date?: string; // YYYY-MM-DD (omitted for lifetime)
}

/**
 * Resolves a date range preset into inclusive start_date and end_date (YYYY-MM-DD)
 * strictly evaluated in Asia/Kolkata (IST) timezone.
 * Returns undefined start_date and end_date for 'lifetime'.
 */
export function resolveDateRangePreset(
  preset: DashboardDateRangePreset,
  referenceDate?: Date
): { start_date?: string; end_date?: string } {
  if (preset === 'lifetime') {
    return { start_date: undefined, end_date: undefined };
  }

  const ref = referenceDate || new Date();

  // Format parts in Asia/Kolkata
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });

  const parts = formatter.formatToParts(ref);
  const partMap: Record<string, string> = {};
  for (const part of parts) {
    partMap[part.type] = part.value;
  }

  const year = parseInt(partMap.year, 10);
  const month = parseInt(partMap.month, 10); // 1-12
  const day = parseInt(partMap.day, 10);

  const pad2 = (n: number) => n.toString().padStart(2, '0');
  const formatDate = (y: number, m: number, d: number) =>
    `${y}-${pad2(m)}-${pad2(d)}`;

  const todayStr = formatDate(year, month, day);

  switch (preset) {
    case 'today':
      return { start_date: todayStr, end_date: todayStr };

    case 'this_week': {
      // Week starts on Monday in India / ISO-8601
      // Weekday abbreviation: Sun, Mon, Tue, Wed, Thu, Fri, Sat
      const weekdayStr = partMap.weekday; // e.g. "Sun", "Mon"
      const dayIndexMap: Record<string, number> = {
        Mon: 0,
        Tue: 1,
        Wed: 2,
        Thu: 3,
        Fri: 4,
        Sat: 5,
        Sun: 6,
      };
      const daysSinceMonday = dayIndexMap[weekdayStr] ?? 0;

      // Compute Monday date using UTC math on calendar date
      const mondayDate = new Date(Date.UTC(year, month - 1, day - daysSinceMonday));
      const sundayDate = new Date(Date.UTC(year, month - 1, day - daysSinceMonday + 6));

      return {
        start_date: formatDate(
          mondayDate.getUTCFullYear(),
          mondayDate.getUTCMonth() + 1,
          mondayDate.getUTCDate()
        ),
        end_date: formatDate(
          sundayDate.getUTCFullYear(),
          sundayDate.getUTCMonth() + 1,
          sundayDate.getUTCDate()
        ),
      };
    }

    case 'this_month': {
      const firstDay = formatDate(year, month, 1);
      // Last day of month: day 0 of month + 1
      const lastDayDate = new Date(Date.UTC(year, month, 0));
      const lastDay = formatDate(year, month, lastDayDate.getUTCDate());
      return { start_date: firstDay, end_date: lastDay };
    }

    case 'last_month': {
      const prevYear = month === 1 ? year - 1 : year;
      const prevMonth = month === 1 ? 12 : month - 1;
      const firstDay = formatDate(prevYear, prevMonth, 1);
      const lastDayDate = new Date(Date.UTC(prevYear, prevMonth, 0));
      const lastDay = formatDate(prevYear, prevMonth, lastDayDate.getUTCDate());
      return { start_date: firstDay, end_date: lastDay };
    }

    case 'this_year': {
      return {
        start_date: formatDate(year, 1, 1),
        end_date: formatDate(year, 12, 31),
      };
    }

    case 'custom':
    default:
      return { start_date: todayStr, end_date: todayStr };
  }
}
