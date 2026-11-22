/**
 * SpendSense Historical Statement Reconciliation Engine
 *
 * Implements authoritative 4-tier transaction identity hierarchy:
 * - Priority 1: Stable Source Reference Match (bank reference, UTR, cheque number, IMPS/NEFT) -> Confirmed Match (100%)
 * - Priority 2: SpendSense Transaction ID Match (export-import roundtrips) -> Confirmed Match (100%)
 * - Priority 3: Normalized Source Fingerprint Match (deterministic hash invariant to user description edits) -> Confirmed Match (100%)
 * - Priority 4: Confidence-Scored Fuzzy Matching (exact amount/direction hard gate + date/merchant/narration composite score)
 *   * Score >= 0.85 -> Likely Match
 *   * 0.65 <= Score < 0.85 -> Possible Duplicate (review required)
 *   * Score < 0.65 -> New Transaction (To Review)
 *
 * Guarantees:
 * 1. Existing Ledger records and user edits (custom categories, necessities, clean names) are NEVER overwritten.
 * 2. Uploading a multi-month historical statement cleanly matches previous months into Section C while routing new months to Section A.
 * 3. 1-to-1 matching prevents over-matching identical amounts on the same day.
 */

import { normalizeMerchantKey } from '../categorization/upi-parser';

export type ReconciliationMatchTier =
  | 'priority1_reference'
  | 'priority2_id'
  | 'priority3_fingerprint'
  | 'priority4_fuzzy';

export type ReconciliationConfidence = 'confirmed' | 'likely' | 'possible';

export interface MatchedLedgerSummary {
  id?: string;
  transaction_date: string;
  amount_paise: number;
  type: string;
  description: string | null;
  statement_reference?: string | null;
  category_name?: string | null;
  necessity?: string | null;
  source_fingerprint?: string | null;
}

export interface StatementReconciliationMatch {
  matchTier: ReconciliationMatchTier;
  matchConfidence: ReconciliationConfidence;
  confidenceScore: number; // 0 - 100
  matchMethod: string;
  matchedLedger: MatchedLedgerSummary;
}

export interface ReconciledStatementOutcome {
  rowKey: string;
  status: 'confirmed_match' | 'likely_match' | 'possible_duplicate' | 'new';
  match?: StatementReconciliationMatch;
}

export interface StatementCandidateRow {
  key: string;
  id?: string;
  date: string; // YYYY-MM-DD
  amountPaise: number;
  type: 'income' | 'expense';
  description: string;
  cleanMerchant?: string;
  reference?: string | null;
  sourceFingerprint?: string | null;
  institution?: string | null;
}

export interface ExistingLedgerTransaction {
  id?: string;
  transaction_date: string;
  amount_paise: number;
  type: string;
  description: string | null;
  cleanMerchant?: string;
  statement_reference?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  necessity?: string | null;
  source_fingerprint?: string | null;
  account_id?: string | null;
}

// Curated Indian Fintech Merchant Aliases
// Maps common legal entities, gateway prefixes, and parent brands to consumer merchant identities
const KNOWN_MERCHANT_ALIASES: Array<{ canonical: string; aliases: string[] }> = [
  { canonical: 'swiggy', aliases: ['bundl technologies', 'swiggy', 'swiggy instamart'] },
  { canonical: 'zomato', aliases: ['zomato', 'zomato media', 'eternal limited', 'blinkit', 'grofers'] },
  { canonical: 'amazon', aliases: ['amazon', 'amzn', 'amazon pay', 'amazon seller', 'amazon internet services'] },
  { canonical: 'flipkart', aliases: ['flipkart', 'flipkart internet', 'myntra', 'cleartrip'] },
  { canonical: 'uber', aliases: ['uber', 'uber bv', 'uber india', 'uber payments'] },
  { canonical: 'ola', aliases: ['ola', 'ani technologies', 'ola cabs', 'ola electric'] },
  { canonical: 'bigbasket', aliases: ['bigbasket', 'supermarket grocery', 'innoventive retail'] },
  { canonical: 'zepto', aliases: ['zepto', 'kiranakart', 'kiranakart technologies'] },
  { canonical: 'airtel', aliases: ['airtel', 'bharti airtel', 'airtel payments', 'airtel broadband'] },
  { canonical: 'jio', aliases: ['jio', 'reliance jio', 'reliance digital', 'jiomart', 'reliance retail'] },
  { canonical: 'tata', aliases: ['tata power', 'tata 1mg', 'tata cliq', 'tata play', 'tata communications'] },
  { canonical: 'google', aliases: ['google', 'google india', 'google play', 'google payment', 'google cloud'] },
  { canonical: 'apple', aliases: ['apple', 'apple services', 'apple.com/bill', 'itunes'] },
  { canonical: 'netflix', aliases: ['netflix', 'netflix entertainment'] },
  { canonical: 'irctc', aliases: ['irctc', 'indian railways', 'cris irctc'] },
];

/**
 * Computes a deterministic source fingerprint invariant to subsequent user edits
 * of transaction description, category or necessity.
 */
export function computeSourceFingerprint(params: {
  userId?: string;
  transactionDate: string;
  amountPaise: number;
  type: string;
  normalizedMerchant: string;
  institution?: string | null;
}): string {
  const normMerchant = (params.normalizedMerchant || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  const payload = [
    params.transactionDate,
    params.amountPaise,
    params.type.toLowerCase(),
    normMerchant,
    (params.institution || '').toLowerCase().trim(),
  ].join('|');

  // Fast FNV-1a 32-bit hash
  let hash = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return `fp_${hash.toString(16).padStart(8, '0')}`;
}

function parseDays(dateStr: string): number | null {
  const parsed = Date.parse(`${dateStr}T00:00:00Z`);
  return Number.isFinite(parsed) ? Math.floor(parsed / 86_400_000) : null;
}

function getCanonicalMerchant(name: string): string {
  const lower = name.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  for (const entry of KNOWN_MERCHANT_ALIASES) {
    if (lower.includes(entry.canonical)) return entry.canonical;
    for (const alias of entry.aliases) {
      if (lower.includes(alias)) return entry.canonical;
    }
  }
  return normalizeMerchantKey(name);
}

function computeTokenOverlap(strA: string, strB: string): number {
  const tokensA = new Set(
    strA
      .toLowerCase()
      .replace(/[^a-z0-9]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2)
  );
  const tokensB = new Set(
    strB
      .toLowerCase()
      .replace(/[^a-z0-9]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2)
  );

  if (!tokensA.size || !tokensB.size) return 0;
  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection++;
  }
  const union = new Set([...tokensA, ...tokensB]).size;
  return union > 0 ? intersection / union : 0;
}

function computeStringSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const s1 = a.toLowerCase().trim();
  const s2 = b.toLowerCase().trim();
  if (s1 === s2) return 1.0;
  if (s1.includes(s2) || s2.includes(s1)) return 0.85;

  // Levenshtein distance similarity
  const len1 = s1.length;
  const len2 = s2.length;
  const maxLen = Math.max(len1, len2);
  if (maxLen === 0) return 1.0;

  const matrix: number[][] = [];
  for (let i = 0; i <= len1; i++) matrix[i] = [i];
  for (let j = 0; j <= len2; j++) matrix[0]![j] = j;

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,
        matrix[i]![j - 1]! + 1,
        matrix[i - 1]![j - 1]! + cost
      );
    }
  }

  const distance = matrix[len1]![len2]!;
  return Math.max(0, 1.0 - distance / maxLen);
}

/**
 * Reconciles an extracted statement against the user's authoritative Ledger history.
 *
 * Implements the 4-tier hierarchy:
 * Priority 1: Stable reference match (UTR, bank ref) -> Confirmed (100%)
 * Priority 2: SpendSense transaction ID -> Confirmed (100%)
 * Priority 3: Source fingerprint -> Confirmed (100%)
 * Priority 4: Fuzzy composite matching:
 *   - Amount and Direction are hard gates
 *   - Composite score = 0.35 * Date + 0.45 * Merchant + 0.20 * Narration
 *   - Score >= 0.85 -> Likely Match
 *   - 0.65 <= Score < 0.85 -> Possible Duplicate (review required)
 *   - Score < 0.65 -> New transaction
 */
export function reconcileStatementWithLedger(
  statementRows: StatementCandidateRow[],
  existingLedger: ExistingLedgerTransaction[],
  options?: { userId?: string }
): ReconciledStatementOutcome[] {
  const userId = options?.userId;

  // Track matched ledger IDs to guarantee 1-to-1 pairing and prevent over-matching
  const matchedLedgerIds = new Set<string>();

  // Pre-index existing ledger rows for high-performance lookup
  const ledgerByRef = new Map<string, ExistingLedgerTransaction[]>();
  const ledgerById = new Map<string, ExistingLedgerTransaction>();
  const ledgerByFingerprint = new Map<string, ExistingLedgerTransaction[]>();
  const ledgerByAmount = new Map<number, ExistingLedgerTransaction[]>();

  for (const tx of existingLedger) {
    if (tx.id) ledgerById.set(tx.id, tx);

    const ref = (tx.statement_reference || '').trim().toLowerCase();
    if (ref && ref.length >= 4) {
      const list = ledgerByRef.get(ref) || [];
      list.push(tx);
      ledgerByRef.set(ref, list);
    }

    // Pre-calculate or reuse source fingerprint
    const fp =
      tx.source_fingerprint ||
      computeSourceFingerprint({
        userId,
        transactionDate: tx.transaction_date,
        amountPaise: tx.amount_paise,
        type: tx.type,
        normalizedMerchant: normalizeMerchantKey(tx.cleanMerchant || tx.description || ''),
      });

    const fpList = ledgerByFingerprint.get(fp) || [];
    fpList.push(tx);
    ledgerByFingerprint.set(fp, fpList);

    const amountList = ledgerByAmount.get(tx.amount_paise) || [];
    amountList.push(tx);
    ledgerByAmount.set(tx.amount_paise, amountList);
  }

  const outcomes: ReconciledStatementOutcome[] = [];

  for (const row of statementRows) {
    // -------------------------------------------------------------
    // PRIORITY 1: Stable Source Reference Match (UTR, Bank Ref, Cheque)
    // -------------------------------------------------------------
    const rowRef = (row.reference || '').trim().toLowerCase();
    if (rowRef && rowRef.length >= 4) {
      const candidates = ledgerByRef.get(rowRef) || [];
      const match = candidates.find(
        (c) =>
          !matchedLedgerIds.has(c.id || '') &&
          c.amount_paise === row.amountPaise &&
          c.type === row.type
      );

      if (match) {
        if (match.id) matchedLedgerIds.add(match.id);
        outcomes.push({
          rowKey: row.key,
          status: 'confirmed_match',
          match: {
            matchTier: 'priority1_reference',
            matchConfidence: 'confirmed',
            confidenceScore: 100,
            matchMethod: `Stable bank reference match (${row.reference})`,
            matchedLedger: {
              id: match.id,
              transaction_date: match.transaction_date,
              amount_paise: match.amount_paise,
              type: match.type,
              description: match.description,
              statement_reference: match.statement_reference,
              category_name: match.category_name,
              necessity: match.necessity,
            },
          },
        });
        continue;
      }
    }

    // -------------------------------------------------------------
    // PRIORITY 2: SpendSense Transaction ID Match
    // -------------------------------------------------------------
    if (row.id && ledgerById.has(row.id)) {
      const match = ledgerById.get(row.id)!;
      if (!matchedLedgerIds.has(match.id || '')) {
        if (match.id) matchedLedgerIds.add(match.id);
        outcomes.push({
          rowKey: row.key,
          status: 'confirmed_match',
          match: {
            matchTier: 'priority2_id',
            matchConfidence: 'confirmed',
            confidenceScore: 100,
            matchMethod: 'SpendSense transaction ID match',
            matchedLedger: {
              id: match.id,
              transaction_date: match.transaction_date,
              amount_paise: match.amount_paise,
              type: match.type,
              description: match.description,
              statement_reference: match.statement_reference,
              category_name: match.category_name,
              necessity: match.necessity,
            },
          },
        });
        continue;
      }
    }

    // -------------------------------------------------------------
    // PRIORITY 3: Normalized Source Fingerprint Match
    // -------------------------------------------------------------
    const rowNormMerchant = normalizeMerchantKey(row.cleanMerchant || row.description || '');
    const rowFingerprint =
      row.sourceFingerprint ||
      computeSourceFingerprint({
        userId,
        transactionDate: row.date,
        amountPaise: row.amountPaise,
        type: row.type,
        normalizedMerchant: rowNormMerchant,
        institution: row.institution,
      });

    const fpCandidates = ledgerByFingerprint.get(rowFingerprint) || [];
    const fpMatch = fpCandidates.find((c) => !matchedLedgerIds.has(c.id || ''));
    if (fpMatch) {
      if (fpMatch.id) matchedLedgerIds.add(fpMatch.id);
      outcomes.push({
        rowKey: row.key,
        status: 'confirmed_match',
        match: {
          matchTier: 'priority3_fingerprint',
          matchConfidence: 'confirmed',
          confidenceScore: 100,
          matchMethod: 'Deterministic source fingerprint match',
          matchedLedger: {
            id: fpMatch.id,
            transaction_date: fpMatch.transaction_date,
            amount_paise: fpMatch.amount_paise,
            type: fpMatch.type,
            description: fpMatch.description,
            statement_reference: fpMatch.statement_reference,
            category_name: fpMatch.category_name,
            necessity: fpMatch.necessity,
          },
        },
      });
      continue;
    }

    // -------------------------------------------------------------
    // PRIORITY 4: Confidence-Scored Fuzzy Matching
    // -------------------------------------------------------------
    const sameAmountCandidates = ledgerByAmount.get(row.amountPaise) || [];
    const rowDays = parseDays(row.date);

    let bestScore = 0;
    let bestMatch: ExistingLedgerTransaction | null = null;
    let bestMethod = '';

    for (const cand of sameAmountCandidates) {
      if (matchedLedgerIds.has(cand.id || '')) continue;
      // Hard gate 1: Direction must match exactly
      if (cand.type !== row.type) continue;

      // Hard gate 2: Date difference score
      const candDays = parseDays(cand.transaction_date);
      if (rowDays === null || candDays === null) continue;
      const dayDiff = Math.abs(rowDays - candDays);

      let dateScore = 0.0;
      if (dayDiff === 0) dateScore = 1.0;
      else if (dayDiff === 1) dateScore = 0.85; // Settlement delay
      else if (dayDiff === 2) dateScore = 0.65;
      else continue; // > 2 days cannot match fuzzy

      // Merchant similarity score
      const candCanonical = getCanonicalMerchant(cand.cleanMerchant || cand.description || '');
      const rowCanonical = getCanonicalMerchant(row.cleanMerchant || row.description || '');

      let merchantScore = 0.0;
      if (candCanonical && rowCanonical && candCanonical === rowCanonical) {
        merchantScore = 1.0;
      } else {
        merchantScore = computeStringSimilarity(
          cand.cleanMerchant || cand.description || '',
          row.cleanMerchant || row.description || ''
        );
      }

      // Narration token overlap score
      const narrationScore = computeTokenOverlap(cand.description || '', row.description || '');

      // Composite score calculation: 35% Date, 45% Merchant, 20% Narration
      // When merchant is an exact canonical alias match (1.0) and date matches,
      // user edits to narration in the ledger should not drag down an otherwise verified match.
      const compositeScore = Math.min(
        1.0,
        merchantScore === 1.0 && dateScore >= 0.85
          ? 0.45 * dateScore + 0.50 * merchantScore + 0.05 * narrationScore
          : 0.35 * dateScore + 0.45 * merchantScore + 0.20 * narrationScore
      );

      if (compositeScore > bestScore) {
        bestScore = compositeScore;
        bestMatch = cand;
        bestMethod =
          dayDiff === 0 && merchantScore >= 0.9
            ? 'Exact date, amount and merchant match'
            : dayDiff <= 1 && merchantScore >= 0.8
            ? `Close date (±${dayDiff}d), amount and counterparty match`
            : `Fuzzy similarity match (${Math.round(compositeScore * 100)}%)`;
      }
    }

    if (bestMatch && bestScore >= 0.85) {
      if (bestMatch.id) matchedLedgerIds.add(bestMatch.id);
      outcomes.push({
        rowKey: row.key,
        status: 'likely_match',
        match: {
          matchTier: 'priority4_fuzzy',
          matchConfidence: 'likely',
          confidenceScore: Math.round(bestScore * 100),
          matchMethod: bestMethod,
          matchedLedger: {
            id: bestMatch.id,
            transaction_date: bestMatch.transaction_date,
            amount_paise: bestMatch.amount_paise,
            type: bestMatch.type,
            description: bestMatch.description,
            statement_reference: bestMatch.statement_reference,
            category_name: bestMatch.category_name,
            necessity: bestMatch.necessity,
          },
        },
      });
      continue;
    }

    if (bestMatch && bestScore >= 0.65) {
      if (bestMatch.id) matchedLedgerIds.add(bestMatch.id);
      outcomes.push({
        rowKey: row.key,
        status: 'possible_duplicate',
        match: {
          matchTier: 'priority4_fuzzy',
          matchConfidence: 'possible',
          confidenceScore: Math.round(bestScore * 100),
          matchMethod: `Possible duplicate: ${bestMethod}`,
          matchedLedger: {
            id: bestMatch.id,
            transaction_date: bestMatch.transaction_date,
            amount_paise: bestMatch.amount_paise,
            type: bestMatch.type,
            description: bestMatch.description,
            statement_reference: bestMatch.statement_reference,
            category_name: bestMatch.category_name,
            necessity: bestMatch.necessity,
          },
        },
      });
      continue;
    }

    // No match found -> Route to Section A (To Review) as a new valid transaction
    outcomes.push({
      rowKey: row.key,
      status: 'new',
    });
  }

  return outcomes;
}
