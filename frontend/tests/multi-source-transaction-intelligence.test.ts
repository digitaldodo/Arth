import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFinancialMessage } from '../src/features/categorization/message-parser';
import { suggestCategory } from '../src/features/categorization/pipeline';
import { assessPossibleDuplicate } from '../src/features/categorization/duplicates';
import type { CategoryDTO } from '@arth/contracts';

const categories: CategoryDTO[] = [
  { id: 'food-id', name: 'Food & Dining', type: 'expense', icon: null, color: null, sort_order: 0, is_default: true, archived_at: null },
];

test('manual, statement, and selected-message descriptions share the same category suggestion', () => {
  const manual = 'Swiggy food delivery';
  const statement = 'UPI-SWIGGY-FOOD DELIVERY';
  const message = parseFinancialMessage('Rs. 250 debited via UPI to Swiggy for food delivery. UTR 1234567890', '2026-11-20');
  assert.equal(message.status, 'ready');
  assert.equal(message.amountPaise, 25_000);
  assert.equal(message.type, 'expense');

  const suggestions = [manual, statement, message.normalizedNarration].map((narration) =>
    suggestCategory(narration, categories, 'expense')?.category.id ?? null,
  );
  assert.deepEqual(suggestions, ['food-id', 'food-id', 'food-id']);
});

test('the requested food-merchant example yields a low-strength reviewable suggestion through all three channels', () => {
  const message = parseFinancialMessage('₹250 debited at a food merchant', '2026-11-20');
  const narrations = ['₹250 payment at a food merchant', 'UPI debit: payment at a food merchant', message.normalizedNarration];
  const suggestions = narrations.map((narration) => suggestCategory(narration, categories, 'expense'));
  assert.equal(message.status, 'ready');
  assert.ok(suggestions.every((suggestion) => suggestion?.category.id === 'food-id'));
  assert.ok(suggestions.every((suggestion) => suggestion?.needsConfirmation));
  assert.ok(suggestions.every((suggestion) => suggestion!.confidence < 0.7));
});

test('message parser separates a marked transaction amount from a displayed balance', () => {
  const parsed = parseFinancialMessage('Available balance Rs. 4,000. UPI payment of ₹250 debited to Swiggy.', '2026-11-20');
  assert.equal(parsed.amount, '250');
  assert.equal(parsed.amountPaise, 25_000);
});

test('pending, failed, reversed, and non-financial messages do not become ready transactions', () => {
  assert.equal(parseFinancialMessage('UPI payment of ₹250 to Cafe is pending', '2026-11-20').status, 'pending');
  assert.equal(parseFinancialMessage('₹250 payment to Cafe failed', '2026-11-20').status, 'failed');
  assert.equal(parseFinancialMessage('₹250 transaction reversed to Cafe', '2026-11-20').status, 'reversal');
  assert.equal(parseFinancialMessage('Your OTP is 250000', '2026-11-20').status, 'not_transaction');
});

test('duplicate review uses corroborating evidence and does not collapse legitimate same-amount purchases', () => {
  const existing = [{ transaction_date: '2026-11-20', amount_paise: 25_000, type: 'expense', description: 'Swiggy food delivery', account_id: 'account-a', statement_reference: 'UTR12345678' }];
  const byReference = assessPossibleDuplicate({ date: '2026-11-20', amountPaise: 25_000, type: 'expense', description: 'Swiggy', accountId: 'account-a', reference: 'UTR12345678' }, existing);
  assert.equal(byReference.possibleDuplicate, true);
  assert.equal(byReference.confidence, 'high');
  const distinctMerchant = assessPossibleDuplicate({ date: '2026-11-20', amountPaise: 25_000, type: 'expense', description: 'Cafe Coffee Day', accountId: 'account-a' }, existing);
  assert.equal(distinctMerchant.possibleDuplicate, false);
});
