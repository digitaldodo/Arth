const MAX_SIGNED_BIGINT = 9_223_372_036_854_775_807n;
const SKIP_STATES = new Set(['new', 'possible_duplicate', 'ambiguous', 'needs_review']);
const SKIP_REASONS = new Set(['possible_duplicate', 'ambiguous', 'balance_mismatch', 'deselected', 'import_error']);
const SKIP_FIELDS = new Set(['transaction_date', 'amount_paise', 'state', 'reason']);

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Validates bounded privacy-minimized skip metadata before it reaches storage. */
export function isValidSkippedRows(value: unknown): value is Array<{ transaction_date: string; amount_paise: string; state: string; reason: string }> {
  if (!Array.isArray(value) || value.length > 5000) return false;
  return value.every((candidate) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return false;
    const row = candidate as Record<string, unknown>;
    if (Object.keys(row).some((key) => !SKIP_FIELDS.has(key))) return false;
    if (!isCalendarDate(row.transaction_date) || typeof row.amount_paise !== 'string' || !/^\d{1,19}$/.test(row.amount_paise)) return false;
    try {
      const amountPaise = BigInt(row.amount_paise);
      return amountPaise > 0n && amountPaise <= MAX_SIGNED_BIGINT &&
        typeof row.state === 'string' && SKIP_STATES.has(row.state) &&
        typeof row.reason === 'string' && SKIP_REASONS.has(row.reason);
    } catch { return false; }
  });
}
