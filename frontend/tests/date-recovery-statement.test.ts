import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseIndianDate,
  normalizeStatementTable,
} from '../src/features/imports/statement-parser.js';

describe('Bank Statement Date Extraction and Row Recovery', () => {
  it('parses ordinal dates correctly (1st, 2nd, 3rd, 21st, 22nd)', () => {
    assert.equal(parseIndianDate('21st Nov 2026'), '2026-11-21');
    assert.equal(parseIndianDate('1st Dec 2026'), '2026-12-01');
    assert.equal(parseIndianDate('2nd Jan 2026'), '2026-01-02');
    assert.equal(parseIndianDate('3rd Mar 2026'), '2026-03-03');
    assert.equal(parseIndianDate('22nd August 2026'), '2026-08-22');
  });

  it('parses embedded dates with prefixes like Dt: or Date:', () => {
    assert.equal(parseIndianDate('Dt: 21/11/2026'), '2026-11-21');
    assert.equal(parseIndianDate('Date: 21-11-2026'), '2026-11-21');
    assert.equal(parseIndianDate('Txn Dt: 21.11.2026'), '2026-11-21');
    assert.equal(parseIndianDate('21/11/2026 14:30:22'), '2026-11-21');
  });

  it('parses OCR character substitutions (O -> 0, l -> 1)', () => {
    assert.equal(parseIndianDate('2l/11/2O26'), '2026-11-21');
    assert.equal(parseIndianDate('21/11/2O26'), '2026-11-21');
  });

  it('parses compact 8-digit dates (DDMMYYYY and YYYYMMDD)', () => {
    assert.equal(parseIndianDate('21112026'), '2026-11-21');
    assert.equal(parseIndianDate('20261121'), '2026-11-21');
  });

  it('never discards rows with unparseable dates; preserves them in needs_review', () => {
    const table = [
      ['Date', 'Narration', 'Chq/Ref No', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance'],
      ['21/11/2026', 'UPI-SWIGGY-12345', 'REF001', '350.00', '', '10000.00'],
      ['UNKNOWN_DATE_STRING', 'UPI-ZOMATO-67890', 'REF002', '450.00', '', '9550.00'],
      ['22/11/2026', 'UPI-AMAZON-99999', 'REF003', '500.00', '', '9050.00'],
    ];

    const result = normalizeStatementTable(table);

    // Total detected rows MUST be 3 (all rows preserved, NONE discarded!)
    assert.equal(result.rows.length, 3);

    // Row 0: valid date, selected
    assert.equal(result.rows[0].date, '2026-11-21');
    assert.equal(result.rows[0].selected, true);
    assert.equal(result.rows[0].paymentMethod, 'upi');

    // Row 1: unparsed date, preserved with needs_review and date correction prompt
    assert.equal(result.rows[1].date, '');
    assert.equal(result.rows[1].rawDate, 'UNKNOWN_DATE_STRING');
    assert.equal(result.rows[1].state, 'needs_review');
    assert.equal(result.rows[1].classification, 'extraction_problem');
    assert.equal(result.rows[1].selected, false);
    assert.ok(result.rows[1].warning?.includes('Date could not be recognized'));

    // Row 2: valid date, selected
    assert.equal(result.rows[2].date, '2026-11-22');
    assert.equal(result.rows[2].selected, true);
  });
});
