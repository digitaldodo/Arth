import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { merchantFingerprint, normalizeNarration, suggestCategory } from '../src/features/categorization/pipeline';

const categories = [
  { id: 'food', name: 'Food & Dining', type: 'expense' },
  { id: 'transport', name: 'Transport', type: 'expense' },
] as never;

describe('Indian-context weak-label categorization', () => {
  test('removes amounts and references while retaining useful merchant context', () => {
    assert.match(normalizeNarration('UPI to Swiggy Ref 123456789 paid Rs. 450'), /swiggy/);
    assert.doesNotMatch(normalizeNarration('UPI to Swiggy Ref 123456789 paid Rs. 450'), /450/);
  });

  test('abstains when only one weak rule fires', () => {
    assert.equal(suggestCategory('payment at Zomato', categories, 'expense'), null);
  });

  test('suggests with explanation when two independent signals agree', () => {
    const result = suggestCategory('Swiggy food delivery UPI paid', categories, 'expense');
    assert.equal(result?.category.id, 'food');
    assert.equal(result?.needsConfirmation, true);
    assert.ok((result?.evidence.length ?? 0) >= 2);
  });

  test('does not suggest a category from the wrong transaction type', () => {
    assert.equal(suggestCategory('Swiggy food delivery UPI paid', categories, 'income'), null);
  });

  test('keeps correction fingerprint independent of amount and reference IDs', () => {
    assert.equal(merchantFingerprint('UPI Swiggy Ref 123456789 paid Rs 250'), merchantFingerprint('UPI Swiggy Ref 987654321 paid Rs 900'));
  });
});
