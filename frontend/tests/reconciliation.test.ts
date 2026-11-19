import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findReconciliationCandidates, type ReconciliationTransaction } from '../src/features/imports/reconciliation';

const accounts = [
  { id: 'bank-a', name: 'Main bank', account_type: 'bank' },
  { id: 'bank-b', name: 'Savings', account_type: 'bank' },
  { id: 'card', name: 'Credit card', account_type: 'credit_card' },
];
const transaction = (overrides: Partial<ReconciliationTransaction>): ReconciliationTransaction => ({
  id: '1', transaction_date: '2026-01-01', amount_paise: 500_000, type: 'expense',
  description: 'NEFT SELF TRANSFER', account_id: 'bank-a', ...overrides,
});

test('suggests explicit cross-account transfers but leaves repeated ordinary purchases alone', () => {
  const rows = [transaction({}), transaction({ id: '2', type: 'income', account_id: 'bank-b', description: 'NEFT CREDIT' }),
    transaction({ id: '3', type: 'income', account_id: 'bank-b', description: 'SHOP refund?' })];
  const matches = findReconciliationCandidates(rows, accounts, new Set());
  assert.equal(matches.length, 1);
  assert.equal(matches[0].relationship, 'transfer_pair');
});

test('does not treat ordinary UPI narrations as evidence of an internal transfer', () => {
  const rows = [
    transaction({ id: 'upi-debit', description: 'UPI COFFEE SHOP', account_id: 'bank-a' }),
    transaction({ id: 'upi-credit', type: 'income', description: 'UPI REFUND FROM SHOP', account_id: 'bank-b' }),
  ];
  assert.deepEqual(findReconciliationCandidates(rows, accounts, new Set()), []);
});

test('suggests bank-to-cash movements only when narrations explicitly indicate cash transfer', () => {
  const cashAccount = { id: 'cash', name: 'Wallet cash', account_type: 'cash' };
  const rows = [
    transaction({ id: 'atm-out', description: 'ATM CASH WITHDRAWAL', account_id: 'bank-a' }),
    transaction({ id: 'cash-in', type: 'income', description: 'CASH ADDED FROM ATM', account_id: 'cash' }),
  ];
  const matches = findReconciliationCandidates(rows, [...accounts, cashAccount], new Set());
  assert.equal(matches.length, 1);
  assert.equal(matches[0].relationship, 'transfer_pair');
});

test('suggests card settlement and honors matching references, dates and existing confirmed links', () => {
  const rows = [transaction({ id: 'bank-debit', statement_reference: 'ABC123' }), transaction({ id: 'card-credit', type: 'income', account_id: 'card', statement_reference: 'abc123' })];
  const matches = findReconciliationCandidates(rows, accounts, new Set());
  assert.equal(matches.length, 1);
  assert.equal(matches[0].relationship, 'card_settlement');
  assert.equal(findReconciliationCandidates(rows, accounts, new Set(['bank-debit'])).length, 0);
  assert.equal(findReconciliationCandidates(rows.map((row, index) => ({ ...row, transaction_date: index ? '2026-01-10' : row.transaction_date })), accounts, new Set()).length, 0);
});

test('checks only the same amount and nearby dates across large histories', () => {
  const ordinary = Array.from({ length: 2_000 }, (_, index) => transaction({
    id: `other-${index}`, transaction_date: '2026-01-01', amount_paise: index + 1,
    description: 'TRANSFER TO OWN ACCOUNT', account_id: 'bank-a',
  }));
  const pair = [
    transaction({ id: 'nearby-debit', transaction_date: '2026-01-01', description: 'NEFT SELF TRANSFER' }),
    transaction({ id: 'nearby-credit', transaction_date: '2026-01-03', type: 'income', account_id: 'bank-b', description: 'NEFT CREDIT' }),
  ];
  const matches = findReconciliationCandidates([...ordinary, ...pair], accounts, new Set());
  assert.equal(matches.length, 1);
  assert.equal(matches[0].source.id, 'nearby-debit');
  assert.equal(matches[0].target.id, 'nearby-credit');
});

test('ignores invalid transaction dates instead of producing a false pair', () => {
  const rows = [
    transaction({ id: 'bad-date', transaction_date: 'not-a-date' }),
    transaction({ id: 'credit', type: 'income', account_id: 'bank-b', description: 'NEFT CREDIT' }),
  ];
  assert.deepEqual(findReconciliationCandidates(rows, accounts, new Set()), []);
});
