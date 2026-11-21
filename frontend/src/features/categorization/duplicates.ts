export interface TransactionDuplicateCandidate {
  date: string;
  amountPaise: number;
  type: 'income' | 'expense';
  description: string | null;
  accountId?: string | null;
  reference?: string | null;
}

export interface ExistingTransactionIdentity {
  transaction_date: string;
  amount_paise: number;
  type: string;
  description: string | null;
  account_id?: string | null;
  statement_reference?: string | null;
}

export interface DuplicateAssessment {
  possibleDuplicate: boolean;
  confidence: 'high' | 'medium' | 'none';
  evidence: string[];
}

const normalizedNarration = (value: unknown) => String(value ?? '')
  .normalize('NFKC').toLocaleLowerCase('en-IN')
  .replace(/\b(?:upi|neft|imps|rtgs|pos|card)\b/g, ' ')
  .replace(/\b(?:utr|rrn|ref(?:erence)?|txn(?:\s*id)?)\s*[:#-]?\s*[a-z0-9-]{6,30}\b/g, ' ')
  .replace(/\s+/g, ' ').trim();

/** Return a review signal only; identical legitimate purchases must not be auto-deleted. */
export function assessPossibleDuplicate(
  candidate: TransactionDuplicateCandidate,
  existing: readonly ExistingTransactionIdentity[],
): DuplicateAssessment {
  const candidateReference = typeof candidate.reference === 'string' ? candidate.reference.trim().toLowerCase() : undefined;
  for (const item of existing) {
    const existingRef = typeof item.statement_reference === 'string' ? item.statement_reference.trim().toLowerCase() : undefined;
    const sameReference = Boolean(candidateReference && existingRef && candidateReference === existingRef);
    const sameAccount = Boolean(candidate.accountId && item.account_id && candidate.accountId === item.account_id);
    const sameDate = item.transaction_date === candidate.date;
    const sameAmount = item.amount_paise === candidate.amountPaise;
    const sameType = item.type === candidate.type;
    const candidateNarration = normalizedNarration(candidate.description);
    const sameNarration = Boolean(candidateNarration && candidateNarration === normalizedNarration(item.description));
    const conflictingReferences = Boolean(candidateReference && existingRef && candidateReference !== existingRef);
    const accountMatches = candidate.accountId && item.account_id ? sameAccount : true;
    if (sameReference && sameAmount && sameType && accountMatches) {
      return { possibleDuplicate: true, confidence: 'high', evidence: ['same reference', 'same amount', 'same direction'] };
    }
    if (!conflictingReferences && sameDate && sameAmount && sameType && sameNarration && accountMatches) {
      return { possibleDuplicate: true, confidence: 'medium', evidence: ['same date', 'same amount', 'same direction', 'same narration'] };
    }
  }
  return { possibleDuplicate: false, confidence: 'none', evidence: [] };
}
