import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isValidSkippedRows } from '../src/modules/tax/statement-batch.validation.js';

const validRow = { transaction_date: '2026-04-03', amount_paise: '123456', state: 'possible_duplicate', reason: 'possible_duplicate' };

describe('statement import skip metadata validation', () => {
  it('accepts bounded exact paise records with generic reasons', () => {
    assert.equal(isValidSkippedRows([validRow]), true);
    assert.equal(isValidSkippedRows([]), true);
  });

  it('rejects malformed dates, zero/negative/out-of-range paise and unsupported states', () => {
    for (const row of [
      { ...validRow, transaction_date: '2026-02-30' },
      { ...validRow, amount_paise: '0' },
      { ...validRow, amount_paise: '-1' },
      { ...validRow, amount_paise: '9223372036854775808' },
      { ...validRow, state: 'imported' },
      { ...validRow, reason: 'salary' },
    ]) assert.equal(isValidSkippedRows([row]), false);
  });

  it('rejects narration, references, arbitrary fields and oversized batches', () => {
    assert.equal(isValidSkippedRows([{ ...validRow, description: 'private narration' }]), false);
    assert.equal(isValidSkippedRows([{ ...validRow, reference: 'private reference' }]), false);
    assert.equal(isValidSkippedRows(Array.from({ length: 5001 }, () => validRow)), false);
    assert.equal(isValidSkippedRows({}), false);
  });
});
