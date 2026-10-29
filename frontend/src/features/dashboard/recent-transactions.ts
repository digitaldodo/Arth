import type { TransactionDTO } from '@arth/contracts';

/** Returns a deterministic, newest-first dashboard preview without mutating its source. */
export function getLatestRecentTransactions(
  transactions: TransactionDTO[],
  limit = 3
): TransactionDTO[] {
  return [...transactions]
    .sort((a, b) => {
      if (a.transaction_date !== b.transaction_date) {
        return b.transaction_date.localeCompare(a.transaction_date);
      }
      if (a.created_at !== b.created_at) {
        return b.created_at.localeCompare(a.created_at);
      }
      return b.id.localeCompare(a.id);
    })
    .slice(0, Math.max(0, limit));
}
