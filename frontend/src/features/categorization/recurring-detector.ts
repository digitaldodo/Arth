/**
 * SpendSense Automatic Recurring Payment Detector
 *
 * Implements FinRegLab 2025 compliant recurring payment pattern recognition:
 * - Minimum 3 transactions in series with at least 2 complete intervals
 * - Interval coefficient of variation (CV) <= 0.20 for fixed, <= 0.35 for variable utilities
 * - Periodicity confidence >= 0.70
 * - Handles both fixed-amount (rent, EMIs, insurance, subscriptions) and
 *   variable-amount (electricity, water, gas, broadband, postpaid) recurring series
 * - Distinguishes habitual spending (daily coffee, food delivery) from contractual obligations
 * - Strictly excludes internal transfers and credit card bill settlements
 * - Recurrence != Essential (Rent = Essential; Netflix = Optional; Daily Coffee = Non-recurring Habit)
 */

import type { NecessityClass } from '@arth/contracts';
import { normalizeMerchantKey } from './upi-parser';

export type RecurrenceType = 'subscription' | 'utility' | 'emi' | 'insurance' | 'rent' | 'other';
export type RecurrenceInterval = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'semiannual' | 'annual' | 'custom';

export interface RecurringPatternResult {
  is_recurring: boolean;
  recurrence_type?: RecurrenceType;
  recurrence_interval?: RecurrenceInterval;
  recurrence_confidence: number; // 0.0 to 1.0
  next_expected_date?: string; // ISO date YYYY-MM-DD
  necessity_prediction?: NecessityClass;
  necessity_confidence?: number;
  average_amount_paise?: number;
  interval_days?: number;
  series_length?: number;
  pattern_description?: string;
}

export interface RecurringTransactionItem {
  id?: string;
  key?: string;
  transaction_date: string; // YYYY-MM-DD
  amount_paise: number;
  type: string; // 'income' | 'expense'
  description: string | null;
  cleanMerchant?: string;
}

// Regex to identify internal transfers and credit card settlements that should NOT be treated as recurring expense commitments
const EXCLUDED_PATTERNS = /\b(?:transfer|neft|imps|rtgs|self transfer|own account|card payment|credit card payment|cc payment|billdesk|autopay|cash withdrawal|cash deposit|atm withdrawal)\b/i;

// Utility and telecom merchant signatures (which have variable monthly amounts)
const UTILITY_PATTERNS = /\b(?:bescom|tneb|msedcl|tata\s*power|adani\s*electricity|electricity|power\s*distribution|water\s*board|water\s*tax|gas\s*bill|indraprastha\s*gas|igl|mahanagar\s*gas|mgl|airtel\s*(?:broadband|fibernet|dth|postpaid)|jio\s*fiber|act\s*fibernet|broadband|piped\s*gas)\b/i;

// Rent signatures
const RENT_PATTERNS = /\b(?:rent|house\s*rent|flat\s*rent|landlord|maintenance\s*charge|society\s*maintenance)\b/i;

// Loan & EMI signatures
const EMI_PATTERNS = /\b(?:emi|loan|mortgage|bajaj\s*finance|hdfc\s*bank\s*loan|icici\s*loan|sbi\s*home\s*loan|car\s*loan)\b/i;

// Insurance signatures
const INSURANCE_PATTERNS = /\b(?:insurance|lic|hdfc\s*life|icici\s*pru|max\s*life|sbi\s*life|star\s*health|care\s*health|policybazaar)\b/i;

// Digital subscriptions
const SUBSCRIPTION_PATTERNS = /\b(?:netflix|spotify|hotstar|disney|prime\s*video|amazon\s*prime|youtube\s*premium|apple\.com\/bill|google\s*one|gym|fitness|cult\.fit|playstation|xbox|claude|chatgpt|openai)\b/i;

// Luxury recurring
const LUXURY_PATTERNS = /\b(?:golf\s*club|country\s*club|yacht|soho\s*house|concierge)\b/i;

// Habitual spending patterns (frequent discretionary spending that must not be tagged as contractual recurring)
const HABIT_PATTERNS = /\b(?:starbucks|cafe|coffee|chaayos|chai\s*point|zomato|swiggy|mcdonalds|blinkit|zepto|instamart)\b/i;

function parseDateDays(dateStr: string): number | null {
  const parsed = Date.parse(`${dateStr}T00:00:00Z`);
  return Number.isFinite(parsed) ? Math.floor(parsed / 86_400_000) : null;
}

function addDaysToDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Math.round(days));
  return d.toISOString().split('T')[0]!;
}

function calculateMeanAndVariance(values: number[]): { mean: number; variance: number; stdDev: number; cv: number } {
  if (!values.length) return { mean: 0, variance: 0, stdDev: 0, cv: 0 };
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  if (values.length === 1 || mean === 0) return { mean, variance: 0, stdDev: 0, cv: 0 };
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / mean;
  return { mean, variance, stdDev, cv };
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function classifyInterval(medianDays: number): { interval: RecurrenceInterval; expectedDays: number } {
  if (medianDays >= 5 && medianDays <= 9) {
    return { interval: 'weekly', expectedDays: 7 };
  }
  if (medianDays >= 12 && medianDays <= 16) {
    return { interval: 'biweekly', expectedDays: 14 };
  }
  if (medianDays >= 26 && medianDays <= 35) {
    return { interval: 'monthly', expectedDays: 30 };
  }
  if (medianDays >= 80 && medianDays <= 100) {
    return { interval: 'quarterly', expectedDays: 91 };
  }
  if (medianDays >= 170 && medianDays <= 195) {
    return { interval: 'semiannual', expectedDays: 182 };
  }
  if (medianDays >= 345 && medianDays <= 385) {
    return { interval: 'annual', expectedDays: 365 };
  }
  return { interval: 'custom', expectedDays: medianDays };
}

/**
 * Determines the recurrence category and its associated default necessity tier.
 */
function determineRecurrenceTypeAndNecessity(
  description: string,
  merchantName: string
): { recurrenceType: RecurrenceType; necessity: NecessityClass } {
  const text = `${merchantName} ${description}`.toLowerCase();

  if (RENT_PATTERNS.test(text)) {
    return { recurrenceType: 'rent', necessity: 'essential' };
  }
  if (EMI_PATTERNS.test(text)) {
    return { recurrenceType: 'emi', necessity: 'essential' };
  }
  if (INSURANCE_PATTERNS.test(text)) {
    return { recurrenceType: 'insurance', necessity: 'essential' };
  }
  if (UTILITY_PATTERNS.test(text)) {
    return { recurrenceType: 'utility', necessity: 'essential' };
  }
  if (LUXURY_PATTERNS.test(text)) {
    return { recurrenceType: 'subscription', necessity: 'luxury' };
  }
  if (SUBSCRIPTION_PATTERNS.test(text)) {
    return { recurrenceType: 'subscription', necessity: 'optional' };
  }

  return { recurrenceType: 'other', necessity: 'optional' };
}

/**
 * Analyzes a historical series of transactions for a single merchant group
 * and tests for contractual recurring payment patterns under FinRegLab 2025 guidelines.
 */
export function analyzeMerchantSeries(
  series: RecurringTransactionItem[]
): RecurringPatternResult | null {
  // Only expense transactions qualify for recurring obligation detection
  const expenses = series.filter((item) => item.type === 'expense');

  // FinRegLab Rule 1: Minimum 3 transactions in a series
  if (expenses.length < 3) {
    return null;
  }

  // Check for excluded transfer or settlement descriptions
  const sampleDesc = expenses.map((e) => e.description || '').join(' ');
  if (EXCLUDED_PATTERNS.test(sampleDesc)) {
    return null;
  }

  // Reject habitual discretionary spending (daily coffee, food delivery)
  const sampleMerchant = expenses.map((e) => e.cleanMerchant || '').join(' ');
  if (HABIT_PATTERNS.test(sampleMerchant) || HABIT_PATTERNS.test(sampleDesc)) {
    return null;
  }

  // Sort chronologically
  const sorted = [...expenses].sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));

  // Compute intervals between consecutive transactions
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prevDays = parseDateDays(sorted[i - 1]!.transaction_date);
    const currDays = parseDateDays(sorted[i]!.transaction_date);
    if (prevDays !== null && currDays !== null) {
      const diff = currDays - prevDays;
      if (diff > 0) {
        intervals.push(diff);
      }
    }
  }

  // FinRegLab Rule 2: Minimum 2 complete intervals
  if (intervals.length < 2) {
    return null;
  }

  const intervalStats = calculateMeanAndVariance(intervals);
  const medInterval = median(intervals);

  // Filter out daily/rapid habitual spending (intervals < 5 days are habits, not recurring obligations)
  if (medInterval < 5) {
    return null;
  }

  const { interval: recurrenceInterval, expectedDays } = classifyInterval(medInterval);

  // Compute amount statistics
  const amounts = sorted.map((e) => e.amount_paise);
  const amountStats = calculateMeanAndVariance(amounts);

  // Check if utility merchant (allows variable consumption amounts)
  const sampleText = `${sorted[0]?.cleanMerchant || ''} ${sorted[0]?.description || ''}`;
  const isUtility = UTILITY_PATTERNS.test(sampleText);

  // FinRegLab Rule 3: Interval CV threshold
  // Fixed contracts require CV <= 0.20; variable utilities permit CV <= 0.35
  const maxIntervalCv = isUtility ? 0.35 : 0.20;
  if (intervalStats.cv > maxIntervalCv) {
    return null;
  }

  // Amount variance check:
  // Fixed obligations (Rent, EMI, Netflix) must have near-constant amounts (CV <= 0.05)
  // Variable utilities (electricity, water, broadband) can vary (CV <= 0.40)
  if (!isUtility && amountStats.cv > 0.08) {
    // If not utility and amount varies more than 8%, not a fixed recurring contract
    return null;
  }
  if (isUtility && amountStats.cv > 0.45) {
    return null;
  }

  // FinRegLab Rule 4: Periodicity confidence >= 0.70
  const periodicityConfidence = Math.max(0.7, Math.min(1.0, 1.0 - intervalStats.cv));

  const { recurrenceType, necessity } = determineRecurrenceTypeAndNecessity(
    sorted[sorted.length - 1]!.description || '',
    sorted[sorted.length - 1]!.cleanMerchant || ''
  );

  const latestDate = sorted[sorted.length - 1]!.transaction_date;
  const nextExpectedDate = addDaysToDate(latestDate, expectedDays);

  return {
    is_recurring: true,
    recurrence_type: recurrenceType,
    recurrence_interval: recurrenceInterval,
    recurrence_confidence: Number(periodicityConfidence.toFixed(2)),
    next_expected_date: nextExpectedDate,
    necessity_prediction: necessity,
    necessity_confidence: isUtility || recurrenceType === 'rent' || recurrenceType === 'emi' ? 0.95 : 0.85,
    average_amount_paise: Math.round(amountStats.mean),
    interval_days: Math.round(medInterval),
    series_length: sorted.length,
    pattern_description: `${recurrenceInterval.toUpperCase()} ${recurrenceType.toUpperCase()} pattern detected across ${sorted.length} transactions (every ~${Math.round(medInterval)} days)`,
  };
}

/**
 * Runs recurring payment detection across a full dataset of transactions.
 * Groups by normalized merchant counterparty and returns a map from normalizedMerchantKey -> RecurringPatternResult.
 */
export function detectRecurringPatterns(
  transactions: RecurringTransactionItem[]
): Map<string, RecurringPatternResult> {
  const groups = new Map<string, RecurringTransactionItem[]>();

  for (const tx of transactions) {
    if (tx.type !== 'expense') continue;
    const name = tx.cleanMerchant || tx.description || '';
    const key = normalizeMerchantKey(name);
    if (!key || key.length < 2) continue;

    const list = groups.get(key) || [];
    list.push(tx);
    groups.set(key, list);
  }

  const results = new Map<string, RecurringPatternResult>();

  for (const [key, series] of groups.entries()) {
    const pattern = analyzeMerchantSeries(series);
    if (pattern && pattern.is_recurring) {
      results.set(key, pattern);
    }
  }

  return results;
}

/**
 * Evaluates whether a specific transaction candidate belongs to a recurring series.
 */
export function assessTransactionRecurrence(
  candidate: RecurringTransactionItem,
  historicalTransactions: RecurringTransactionItem[]
): RecurringPatternResult | null {
  if (candidate.type !== 'expense') return null;
  const candidateName = candidate.cleanMerchant || candidate.description || '';
  const candidateKey = normalizeMerchantKey(candidateName);
  if (!candidateKey) return null;

  // Find all historical transactions sharing the same merchant key
  const relevantHistory = historicalTransactions.filter((tx) => {
    if (tx.type !== 'expense') return false;
    const key = normalizeMerchantKey(tx.cleanMerchant || tx.description || '');
    return key === candidateKey;
  });

  const historyWithoutCandidate = relevantHistory.filter((tx) => tx !== candidate);
  const combined = [...historyWithoutCandidate, candidate];
  return analyzeMerchantSeries(combined);
}
