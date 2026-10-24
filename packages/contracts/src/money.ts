/**
 * Money utilities for exact integer-paise financial calculations.
 * 1 INR = 100 paise.
 * Never uses floating-point arithmetic.
 */

// Max signed 64-bit integer supported by PostgreSQL BIGINT
export const MAX_POSTGRES_BIGINT = BigInt('9223372036854775807');
// Max integer that can safely be represented in a standard JavaScript Number without precision loss
export const MAX_SAFE_PAISE = BigInt(Number.MAX_SAFE_INTEGER); // 9,007,199,254,740,991 (~90 trillion INR)

/**
 * Parses an INR decimal string (e.g. "250", "250.5", "250.50", "0.01")
 * into exact integer paise (bigint).
 *
 * Rules:
 * - Rejects non-strings or empty strings.
 * - Rejects negative values (e.g. "-10").
 * - Rejects zero (e.g. "0", "0.00") because transaction amounts must be strictly positive.
 * - Rejects amounts with more than 2 decimal places (e.g. "250.555").
 * - Rejects malformed strings (e.g. "12.3.4", "abc", "10,000").
 * - Rejects amounts exceeding PostgreSQL BIGINT and Number.MAX_SAFE_INTEGER.
 */
export function parseINRToPaise(amountStr: string): bigint {
  if (typeof amountStr !== 'string') {
    throw new Error('Amount must be a string');
  }

  const trimmed = amountStr.trim();
  if (!trimmed) {
    throw new Error('Amount string cannot be empty');
  }

  // Regex matches strictly positive decimal numbers with up to 2 decimal places
  // Allows "0.01", "1", "10.5", "250.50", etc. Disallows leading "+", "-", commas, extra dots
  const regex = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;
  if (!regex.test(trimmed)) {
    throw new Error(`Invalid amount format: "${amountStr}". Must be a positive decimal with at most 2 decimal places.`);
  }

  const [wholePart, fracPart = ''] = trimmed.split('.');
  const paddedFrac = fracPart.padEnd(2, '0');

  const whole = BigInt(wholePart);
  const frac = BigInt(paddedFrac);
  const paise = whole * BigInt(100) + frac;

  if (paise <= BigInt(0)) {
    throw new Error('Amount in paise must be strictly greater than zero');
  }

  if (paise > MAX_SAFE_PAISE) {
    throw new Error('Amount exceeds maximum allowable financial limit');
  }

  return paise;
}

/**
 * Converts integer paise into an exact 2-decimal string (e.g. 25050 -> "250.50").
 */
export function paiseToDecimal(paise: number | bigint): string {
  const p = typeof paise === 'number' ? BigInt(paise) : paise;
  const isNegative = p < BigInt(0);
  const abs = isNegative ? -p : p;
  const whole = abs / BigInt(100);
  const frac = abs % BigInt(100);
  const sign = isNegative ? '-' : '';
  return `${sign}${whole}.${frac.toString().padStart(2, '0')}`;
}

/**
 * Formats integer paise into Indian Rupee notation (e.g. 123456789 -> "₹12,34,567.89").
 * Uses exact BigInt integer division and Intl.NumberFormat('en-IN') for the whole rupees portion.
 */
export function formatPaiseToINR(paise: number | bigint): string {
  const p = typeof paise === 'number' ? BigInt(paise) : paise;
  const isNegative = p < BigInt(0);
  const abs = isNegative ? -p : p;
  const whole = abs / BigInt(100);
  const frac = abs % BigInt(100);

  const wholeFormatted = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(whole);

  const sign = isNegative ? '-' : '';
  return `${sign}${wholeFormatted}.${frac.toString().padStart(2, '0')}`;
}
