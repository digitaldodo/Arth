import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStatementTable, tagDuplicates } from '../src/features/imports/statement-parser.js';
import { alignOcrRows, ocrLinesToTable, requireOcrReview } from '../src/features/imports/statement-ocr.js';

test('OCR table grouping preserves clearly separated statement cells', () => {
  const table = ocrLinesToTable([
    { text: 'Date   Narration   Debit   Credit   Balance', confidence: 95 },
    { text: '01/11/2026   Market   125.00   0.00   875.00', confidence: 88 },
  ]);
  assert.deepEqual(table[1], ['01/11/2026', 'Market', '125.00', '0.00', '875.00']);
});

test('OCR geometric alignment leaves a blank debit or credit column in place', () => {
  const aligned = alignOcrRows([
    [{ text: 'Date', center: 10 }, { text: 'Narration', center: 30 }, { text: 'Debit', center: 80 }, { text: 'Credit', center: 100 }, { text: 'Balance', center: 120 }],
    [{ text: '01/11/2026', center: 10 }, { text: 'Market purchase', center: 30 }, { text: '125.00', center: 80 }, { text: '875.00', center: 120 }],
  ]);
  assert.deepEqual(aligned[1], ['01/11/2026', 'Market purchase', '125.00', '', '875.00']);
});

test('OCR extracted rows stay unselected and require review even with high confidence', () => {
  const table = ocrLinesToTable([
    { text: 'Date   Description   Debit   Credit', confidence: 99 },
    { text: '01/11/2026   Market purchase   125.00', confidence: 96 },
  ]);
  const parsed = requireOcrReview(normalizeStatementTable(table), 96);
  assert.equal(parsed.ocrConfidence, 96);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].state, 'needs_review');
  assert.equal(parsed.rows[0].selected, false);
  assert.match(parsed.rows[0].warning || '', /Verify the date, narration, amount/);
});

test('OCR possible duplicates remain visible and unselected', () => {
  const base = requireOcrReview(normalizeStatementTable([
    ['Date', 'Description', 'Debit', 'Credit'],
    ['01/11/2026', 'Market purchase', '125.00', ''],
  ]), 81);
  const parsed = tagDuplicates(base.rows, [{
    transaction_date: '2026-11-01', amount_paise: 12500, type: 'expense', description: 'Market purchase',
  }]);
  assert.equal(parsed[0].state, 'needs_review', 'OCR uncertainty remains the primary state while duplicate information stays in the warning');
  assert.equal(parsed[0].selected, false);
  assert.match(parsed[0].warning || '', /matching ledger row exists/);
});
