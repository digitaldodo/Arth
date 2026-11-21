export type ReconciliationTransaction = {
  id: string; transaction_date: string; amount_paise: number; type: 'income' | 'expense';
  description: string | null; account_id: string | null; statement_reference?: string | null;
};
export type ReconciliationAccount = { id: string; name: string; account_type: string };
export type ReconciliationCandidate = {
  source: ReconciliationTransaction; target: ReconciliationTransaction;
  relationship: 'transfer_pair' | 'card_settlement'; reason: string;
};

const TRANSFER_HINT = /\b(?:transfer|neft|imps|rtgs|self transfer|own account|card payment|credit card payment|cc payment|bill payment|autopay|cash withdrawal|cash deposit|cash added|atm withdrawal|atm cash)\b/i;

/** Creates review suggestions only. It never merges or suppresses transactions before user confirmation. */
export function findReconciliationCandidates(
  transactions: ReconciliationTransaction[],
  accounts: ReconciliationAccount[],
  linkedTransactionIds: Set<string>,
): ReconciliationCandidate[] {
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const rows = transactions.filter((row) => row.account_id && !linkedTransactionIds.has(row.id)
    && (TRANSFER_HINT.test(row.description || '') || Boolean(typeof row.statement_reference === 'string' && row.statement_reference.trim())));
  const candidates: ReconciliationCandidate[] = [];
  const seen = new Set<string>();
  // Index by amount, direction and day so a large account history does not require
  // comparing every transfer-like row with every other row (10k rows meant ~50M pairs).
  const dayNumber = (date: string) => {
    const parsed = Date.parse(`${date}T00:00:00Z`);
    return Number.isFinite(parsed) ? Math.floor(parsed / 86_400_000) : null;
  };
  const credits = new Map<number, Map<number, ReconciliationTransaction[]>>();
  const debits: Array<{ row: ReconciliationTransaction; day: number }> = [];
  for (const row of rows) {
    const day = dayNumber(row.transaction_date);
    if (day === null) continue;
    if (row.type === 'expense') { debits.push({ row, day }); continue; }
    const byDay = credits.get(row.amount_paise) || new Map<number, ReconciliationTransaction[]>();
    const sameDay = byDay.get(day) || [];
    sameDay.push(row);
    byDay.set(day, sameDay);
    credits.set(row.amount_paise, byDay);
  }
  for (const { row: first, day } of debits) {
    const byDay = credits.get(first.amount_paise);
    if (!byDay) continue;
    for (let offset = -2; offset <= 2; offset++) for (const second of byDay.get(day + offset) || []) {
    if (first.account_id === second.account_id) continue;
    const firstRef = typeof first.statement_reference === 'string' ? first.statement_reference.trim().toLowerCase() : undefined;
    const secondRef = typeof second.statement_reference === 'string' ? second.statement_reference.trim().toLowerCase() : undefined;
    const sameReference = Boolean(firstRef && secondRef && firstRef === secondRef);
    if (firstRef && secondRef && !sameReference) continue;
    const bothNarrationsTransferLike = TRANSFER_HINT.test(first.description || '') && TRANSFER_HINT.test(second.description || '');
    if (!sameReference && !bothNarrationsTransferLike) continue;
    const firstAccount = accountById.get(first.account_id!);
    const secondAccount = accountById.get(second.account_id!);
    if (!firstAccount || !secondAccount || firstAccount.account_type === 'credit_card' && secondAccount.account_type === 'credit_card') continue;
    const relationship = firstAccount.account_type === 'credit_card' || secondAccount.account_type === 'credit_card' ? 'card_settlement' : 'transfer_pair';
    const key = [first.id, second.id].sort().join(':');
    if (seen.has(key)) continue;
    seen.add(key);
    const source = first;
    const target = second;
    candidates.push({ source, target, relationship, reason: sameReference ? 'Same bank reference, amount and opposite direction.' : 'Transfer-like narration, matching amount and opposite account direction.' });
    if (candidates.length >= 500) return candidates;
    }
  }
  return candidates.sort((a, b) => b.source.transaction_date.localeCompare(a.source.transaction_date));
}
