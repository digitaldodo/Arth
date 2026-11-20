import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCreateTransactionRequest, ValidationError } from '../src/modules/transactions/transaction.validation.js';

const validRequest = {
  id: '01933f4f-9f5c-7abc-8def-0123456789ab',
  amount: '250.00',
  type: 'expense',
  category_id: '11111111-1111-4111-8111-111111111111',
  transaction_date: '2026-11-20',
  payment_method: 'online',
  necessity: 'essential',
  ingestion_source: 'message',
  parser_version: 'selected-message-parser-v1',
  categorization_model_version: 'weak-label-rules-v1',
  categorization_method: 'weak_supervision',
  category_suggestion_confidence: 0.8,
  category_evidence: [{ source: 'merchant alias', detail: 'Known merchant matched: Food & Dining' }],
  category_verified: true,
  category_was_corrected: false,
};

test('transaction validation preserves bounded source and categorization provenance', () => {
  const validated = validateCreateTransactionRequest(validRequest);
  assert.equal(validated.ingestion_source, 'message');
  assert.equal(validated.category_suggestion_confidence, 0.8);
  assert.deepEqual(validated.category_evidence, validRequest.category_evidence);
  assert.equal(validated.category_verified, true);
});

test('transaction validation rejects invalid source, confidence and oversized evidence', () => {
  assert.throws(() => validateCreateTransactionRequest({ ...validRequest, ingestion_source: 'sms_inbox' }), ValidationError);
  assert.throws(() => validateCreateTransactionRequest({ ...validRequest, category_suggestion_confidence: 1.1 }), ValidationError);
  assert.throws(() => validateCreateTransactionRequest({ ...validRequest, category_evidence: Array(13).fill(validRequest.category_evidence[0]) }), ValidationError);
});
