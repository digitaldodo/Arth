export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export interface ValidatedDashboardSummaryQuery {
  start_date?: string; // YYYY-MM-DD (omitted for lifetime)
  end_date?: string; // YYYY-MM-DD (omitted for lifetime)
}

/**
 * Validates a calendar date string (YYYY-MM-DD) strictly checking month and day validity.
 */
function isValidDateString(dateStr: string): boolean {
  if (typeof dateStr !== 'string') return false;
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  // Strict calendar check (e.g. rejects 2026-02-31)
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

export function validateDashboardSummaryQuery(
  rawQuery: unknown
): ValidatedDashboardSummaryQuery {
  if (!rawQuery || typeof rawQuery !== 'object') {
    return {};
  }

  const query = rawQuery as Record<string, unknown>;

  let startDate: string | undefined;
  let endDate: string | undefined;

  if (query.start_date !== undefined && query.start_date !== null && query.start_date !== '') {
    if (typeof query.start_date !== 'string') {
      throw new ValidationError('start_date must be a YYYY-MM-DD string');
    }
    const trimmed = query.start_date.trim();
    if (!isValidDateString(trimmed)) {
      throw new ValidationError(`Invalid start_date format: "${trimmed}". Must be a valid YYYY-MM-DD calendar date.`);
    }
    startDate = trimmed;
  }

  if (query.end_date !== undefined && query.end_date !== null && query.end_date !== '') {
    if (typeof query.end_date !== 'string') {
      throw new ValidationError('end_date must be a YYYY-MM-DD string');
    }
    const trimmed = query.end_date.trim();
    if (!isValidDateString(trimmed)) {
      throw new ValidationError(`Invalid end_date format: "${trimmed}". Must be a valid YYYY-MM-DD calendar date.`);
    }
    endDate = trimmed;
  }

  if (startDate && endDate && startDate > endDate) {
    throw new ValidationError(`start_date (${startDate}) cannot be after end_date (${endDate})`);
  }

  return {
    start_date: startDate,
    end_date: endDate,
  };
}
