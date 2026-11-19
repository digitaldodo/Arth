import { parseINRToPaise } from '@arth/contracts';
import type { ParsedStatementRow } from './statement-parser';

export type StatementSkipReason = 'possible_duplicate' | 'ambiguous' | 'balance_mismatch' | 'deselected' | 'import_error';
export type StatementSkippedRow = { transaction_date: string; amount_paise: string; state: ParsedStatementRow['state']; reason: StatementSkipReason };

/** Persist only the date, exact amount, parser state and generic reason; never narration or references. */
export function skippedRowsForImport(rows: ParsedStatementRow[], importedKeys: Set<string> = new Set()): StatementSkippedRow[] {
  const skipped: StatementSkippedRow[] = [];
  for (const row of rows) {
    if (row.state === 'imported' || importedKeys.has(row.key)) continue;
    let reason: StatementSkipReason;
    if (row.state === 'possible_duplicate') reason = 'possible_duplicate';
    else if (row.state === 'ambiguous') reason = 'ambiguous';
    else if (row.state === 'needs_review') reason = 'balance_mismatch';
    else reason = row.selected ? 'import_error' : 'deselected';
    let amountPaise: string;
    try { amountPaise = parseINRToPaise(row.amount).toString(); } catch { amountPaise = '0'; }
    skipped.push({ transaction_date: row.date, amount_paise: amountPaise, state: row.state, reason });
  }
  return skipped;
}
