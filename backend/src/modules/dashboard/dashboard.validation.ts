export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export interface ValidatedDashboardSummaryQuery {
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
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
    throw new ValidationError('Query parameters must be provided');
  }

  const query = rawQuery as Record<string, unknown>;

  if (!query.start_date || typeof query.start_date !== 'string') {
    throw new ValidationError('start_date is required and must be a YYYY-MM-DD string');
  }

  if (!query.end_date || typeof query.end_date !== 'string') {
    throw new ValidationError('end_date is required and must be a YYYY-MM-DD string');
  }

  const startDate = query.start_date.trim();
  const endDate = query.end_date.trim();

  if (!isValidDateString(startDate)) {
    throw new ValidationError(`Invalid start_date format: "${startDate}". Must be a valid YYYY-MM-DD calendar date.`);
  }

  if (!isValidDateString(endDate)) {
    throw new ValidationError(`Invalid end_date format: "${endDate}". Must be a valid YYYY-MM-DD calendar date.`);
  }

  if (startDate > endDate) {
    throw new ValidationError(`start_date (${startDate}) cannot be after end_date (${endDate})`);
  }

  return {
    start_date: startDate,
    end_date: endDate,
  };
}
