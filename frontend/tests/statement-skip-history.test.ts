import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { skippedRowsForImport } from '../src/features/imports/statement-skip-history';
import type { ParsedStatementRow } from '../src/features/imports/statement-parser';

function row(key: string, state: ParsedStatementRow['state'], selected: boolean, amount = '1234.56'): ParsedStatementRow {
  return { key, date: '2026-04-03', description: 'private merchant narration', amount, amountPaise: 123456, type: 'expense', paymentMethod: 'online', reference: 'private-utr', balance: null, state, confidence: 'high', selected, categoryId: 'category' };
}

describe('statement skipped-row history', () => {
  it('stores exact paise and generic reasons without descriptions or references', () => {
    const records = skippedRowsForImport([
      row('a', 'possible_duplicate', false), row('b', 'ambiguous', false), row('c', 'needs_review', false), row('d', 'new', false), row('e', 'new', true),
    ]);
    assert.deepEqual(records.map((record) => record.reason), ['possible_duplicate', 'ambiguous', 'balance_mismatch', 'deselected', 'import_error']);
    assert.equal(records[0].amount_paise, '123456');
    assert.equal(JSON.stringify(records).includes('private'), false);
  });

  it('does not store imported rows', () => {
    assert.equal(skippedRowsForImport([row('a', 'imported', false), row('b', 'new', false)]).length, 1);
  });
});
