import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectTaxFieldCandidates } from '../src/features/tax/document-extractor.js';

test('extracts conservative Form 16 salary and TDS candidates with page provenance', () => {
  const text = '[PAGE 1] Employer details and employee identifiers\n[PAGE 2] Gross Salary ₹12,00,000\nTotal tax deducted at source 84,000';
  const fields = detectTaxFieldCandidates(text, 'text_pdf');
  assert.deepEqual(fields.map((field) => [field.key, field.value, field.page]), [
    ['salary.gross', '1200000', 2], ['tax.tds', '84000', 2],
  ]);
  assert.ok(fields.every((field) => field.confidence < 1), 'Text extraction candidates must not be treated as verified values');
  assert.ok(fields.every((field) => field.location.length > 0), 'Each candidate must retain its source text location');
});

test('limits spreadsheet extraction confidence and does not infer a missing amount', () => {
  const fields = detectTaxFieldCandidates('Gross salary pending\nTax deducted at source 0', 'spreadsheet');
  assert.equal(fields.length, 1);
  assert.equal(fields[0].key, 'tax.tds');
  assert.equal(fields[0].value, '0');
  assert.ok(fields[0].confidence <= 0.68);
});

test('keeps scanned-PDF candidates explicitly low confidence with their page provenance', () => {
  const fields = detectTaxFieldCandidates('[PAGE 3] Gross salary 12,00,000', 'ocr_local');
  assert.equal(fields.length, 1);
  assert.equal(fields[0].page, 3);
  assert.ok(fields[0].confidence <= 0.52);
});

test('extracts selected deduction evidence as separate candidates instead of summing across limits', () => {
  const fields = detectTaxFieldCandidates('[PAGE 4] Deduction under Section 80C 1,50,000\nDeduction under Section 80D 25,000\nEmployer contribution to NPS 60,000', 'text_pdf');
  assert.deepEqual(fields.map((field) => [field.key, field.value]), [
    ['deduction.section_80c', '150000'], ['deduction.section_80d', '25000'], ['deduction.employer_nps', '60000'],
  ]);
});

test('masks PAN and long identifiers from stored source-location snippets', () => {
  const fields = detectTaxFieldCandidates('[PAGE 2] Gross salary PAN ABCDE1234F account 123456789012 12,00,000', 'text_pdf');
  assert.equal(fields.length, 1);
  assert.equal(fields[0].value, '1200000');
  assert.ok(!fields[0].location.includes('ABCDE1234F'));
  assert.ok(!fields[0].location.includes('123456789012'));
  assert.ok(fields[0].location.includes('[MASKED_PAN]'));
});
