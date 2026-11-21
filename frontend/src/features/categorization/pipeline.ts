import type { CategoryDTO, TransactionType } from '@arth/contracts';

export interface CategorizationEvidence {
  readonly source: string;
  readonly detail: string;
}

export interface CategorySuggestion {
  readonly category: CategoryDTO;
  readonly confidence: number;
  readonly method: 'weak_supervision' | 'user_correction';
  readonly evidence: readonly CategorizationEvidence[];
  readonly needsConfirmation: true;
}

interface LabelVote {
  readonly label: string;
  readonly source: string;
  readonly detail: string;
}

const merchantAliases: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(?:zomato|swiggy)\b/i, 'Food & Dining'],
  [/\b(?:amazon|flipkart|myntra|meesho)\b/i, 'Shopping'],
  [/\b(?:bescom|tneb)\b/i, 'Utilities'],
  [/\b(?:uber|ola|irctc)\b/i, 'Transport'],
  [/\b(?:netflix|spotify)\b/i, 'Entertainment'],
];

const transactionContexts: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(?:restaurant|cafe|food delivery|food merchant|dining)\b/i, 'Food & Dining'],
  [/\b(?:retail|shopping|marketplace)\b/i, 'Shopping'],
  [/\b(?:electricity|water bill|gas bill|broadband|recharge)\b/i, 'Utilities'],
  [/\b(?:rent|landlord)\b/i, 'Rent'],
  [/\b(?:metro|petrol|fuel|toll|cab|transport)\b/i, 'Transport'],
  [/\b(?:school|college|tuition|university)\b/i, 'Education'],
  [/\b(?:emi|loan installment|loan repayment)\b/i, 'EMIs & Loans'],
  [/\b(?:hospital|pharmacy|clinic|diagnostic)\b/i, 'Healthcare'],
  [/\b(?:cinema|movie|theatre|gaming|subscription)\b/i, 'Entertainment'],
  [/\b(?:salary|payroll)\b/i, 'Salary'],
  [/\b(?:refund|reversal|reversed)\b/i, 'Refunds'],
  [/\b(?:self transfer|own account|account transfer)\b/i, 'Transfers'],
  [/\b(?:interest credited|dividend|cashback credited)\b/i, 'Other income'],
];

export function normalizeNarration(raw: unknown): string {
  return String(raw ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('en-IN')
    .replace(/\b(?:upi\s*)?(?:ref|reference|utr|rrn|txn(?:\s*id)?)\s*[:#-]?\s*[a-z0-9-]{6,30}\b/gi, ' ')
    .replace(/\b(?:inr|rs\.?|₹)\s*[\d,]+(?:\.\d{1,2})?/gi, ' amount ')
    .replace(/\b\d{8,}\b/g, ' reference ')
    .replace(/[^\p{L}\p{N}@._-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function votesFor(normalized: string): LabelVote[] {
  const votes: LabelVote[] = [];
  for (const [pattern, label] of merchantAliases) {
    if (pattern.test(normalized)) votes.push({ label, source: 'merchant alias', detail: `Known merchant matched: ${label}` });
  }
  for (const [pattern, label] of transactionContexts) {
    if (pattern.test(normalized)) votes.push({ label, source: 'transaction context', detail: `Narration context matched: ${label}` });
  }
  return votes;
}

/**
 * Conservative, transparent weak-label baseline. It only suggests a category
 * when independent signals agree; it never writes a transaction or tax fact.
 */
export function suggestCategory(
  narration: string,
  categories: readonly CategoryDTO[],
  type: TransactionType,
  userCorrectionCategoryId?: string | null,
): CategorySuggestion | null {
  const normalized = normalizeNarration(narration);
  if (!normalized) return null;
  if (userCorrectionCategoryId) {
    const correctedCategory = categories.find((item) => item.id === userCorrectionCategoryId && item.type === type);
    if (correctedCategory) {
      return {
        category: correctedCategory,
        confidence: 1,
        method: 'user_correction',
        evidence: [{ source: 'your saved correction', detail: `You previously assigned this merchant to ${correctedCategory.name}` }],
        needsConfirmation: true,
      };
    }
  }
  const votes = votesFor(normalized);
  if (votes.length < 1) return null;

  const counts = new Map<string, number>();
  for (const vote of votes) counts.set(vote.label, (counts.get(vote.label) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const [label, count] = ranked[0];
  // A single weak signal is surfaced only as a low-strength suggestion and
  // always remains subject to user confirmation.
  const sourceCount = new Set(votes.map((vote) => vote.source)).size;
  const confidence = sourceCount < 2 ? 0.5 : count / votes.length;
  if ((sourceCount >= 2 && confidence < 0.67) || (ranked[1]?.[1] === count)) return null;

  const category = categories.find((item) => item.type === type && (item.name ? item.name.trim().toLocaleLowerCase('en-IN') : '') === label.toLocaleLowerCase('en-IN'));
  if (!category) return null;
  return {
    category,
    confidence,
    method: 'weak_supervision',
    evidence: votes.filter((vote) => vote.label === label).map(({ source, detail }) => ({ source, detail })),
    needsConfirmation: true,
  };
}

/** Persist only explicit user corrections, scoped to a local account and without raw narration. */
export async function recordCategoryCorrection(
  userId: string,
  merchantKey: string,
  categoryId: string,
): Promise<boolean> {
  if (typeof window === 'undefined' || !userId || !merchantKey || !categoryId) return false;
  const key = `spendsense_category_feedback_v1:${userId}`;
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(merchantKey));
    const fingerprint = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    const previous = JSON.parse(window.localStorage.getItem(key) ?? '[]') as Array<{ merchantFingerprint: string; categoryId: string; correctedAt: string }>;
    const next = previous.filter((item) => item.merchantFingerprint !== fingerprint);
    next.push({ merchantFingerprint: fingerprint, categoryId, correctedAt: new Date().toISOString() });
    window.localStorage.setItem(key, JSON.stringify(next.slice(-500)));
    return true;
  } catch {
    // Feedback is optional; inability to persist it must not block transaction entry.
    return false;
  }
}

/** Look up a past explicit category correction without persisting merchant text. */
export async function findCategoryCorrection(userId: string, merchantKey: string): Promise<string | null> {
  if (typeof window === 'undefined' || !userId || !merchantKey) return null;
  const key = `spendsense_category_feedback_v1:${userId}`;
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(merchantKey));
    const fingerprint = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    const previous = JSON.parse(window.localStorage.getItem(key) ?? '[]') as Array<{ merchantFingerprint?: string; categoryId?: string }>;
    return previous.find((item) => item.merchantFingerprint === fingerprint && typeof item.categoryId === 'string')?.categoryId ?? null;
  } catch {
    return null;
  }
}

export function merchantFingerprint(narration: unknown): string {
  return normalizeNarration(narration).split(' ').filter((token) => !/^\d+$/.test(token)).slice(0, 5).join(' ');
}
