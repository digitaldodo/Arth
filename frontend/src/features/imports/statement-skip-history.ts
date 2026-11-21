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

    let amountPaise = '0';
    try {
      if (typeof row.amountPaise === 'number' && Number.isFinite(row.amountPaise)) {
        amountPaise = BigInt(Math.max(0, Math.round(row.amountPaise))).toString();
      } else {
        const cleaned = String(row.amount ?? '').replace(/^-/, '').trim();
        const parsed = parseINRToPaise(cleaned);
        amountPaise = parsed >= 0n ? parsed.toString() : '0';
      }
    } catch {
      amountPaise = '0';
    }

    if (BigInt(amountPaise) <= 0n) continue;

    const state: ParsedStatementRow['state'] = (row.state === 'possible_duplicate' || row.state === 'ambiguous' || row.state === 'needs_review' || row.state === 'new')
      ? row.state
      : 'needs_review';

    skipped.push({ transaction_date: row.date, amount_paise: amountPaise, state, reason });
  }
  return skipped;
}
