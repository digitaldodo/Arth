import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyTaxDocument } from '../src/features/tax/document-classifier.js';

test('suggests Form 16 metadata from content while keeping year and issuer as review hints', () => {
  const suggestion = classifyTaxDocument('FORM 16 Certificate under section 203\nAssessment Year 2026-27\nHDFC Bank', 'salary.pdf');
  assert.equal(suggestion.documentType, 'form16');
  assert.equal(suggestion.typeConfidence, 0.88);
  assert.equal(suggestion.taxPeriod, 'AY2026-27');
  assert.equal(suggestion.issuer, 'HDFC Bank');
});

test('recognizes Form 16A before Form 16 and maps a financial year to its assessment year', () => {
  const suggestion = classifyTaxDocument('Form 16A tax deducted at source\nFinancial Year: 2025-26');
  assert.equal(suggestion.documentType, 'form16a');
  assert.equal(suggestion.taxPeriod, 'AY2026-27');
});

test('keeps conflicting period candidates unresolved rather than selecting one', () => {
  const suggestion = classifyTaxDocument('Form 26AS AY 2025-26 and Assessment Year 2026-27');
  assert.equal(suggestion.documentType, 'form26as');
  assert.deepEqual(suggestion.periodCandidates, ['AY2025-26', 'AY2026-27']);
  assert.equal(suggestion.taxPeriod, null);
});

test('does not claim a classification or tax year when the text has no reliable marker', () => {
  const suggestion = classifyTaxDocument('Financial records, amounts and account entries');
  assert.equal(suggestion.documentType, null);
  assert.equal(suggestion.taxPeriod, null);
  assert.equal(suggestion.issuer, null);
});
