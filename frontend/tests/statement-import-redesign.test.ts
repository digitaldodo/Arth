import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ParsedStatementRow } from '../src/features/imports/statement-parser.js';

// Section partitioning helpers matching StatementImport.tsx
function isAttentionRow(r: ParsedStatementRow): boolean {
  if (r.state === 'imported') return false;
  if (r.userSkipped || r.state === 'skipped') return true;
  if (r.state === 'ambiguous') return true;
  if (r.classification === 'extraction_problem') return true;
  if (!r.date || isNaN(Date.parse(r.date))) return true;
  if (!r.amountPaise || r.amountPaise <= 0) return true;
  return false;
}

function isAlreadyInLedgerRow(r: ParsedStatementRow): boolean {
  if (r.state === 'imported') return false;
  if (r.includedAnyway) return false;
  if (isAttentionRow(r)) return false;
  return (
    r.matchedLedger != null ||
    r.classification === 'already_recorded' ||
    r.classification === 'possible_duplicate'
  );
}

function partitionRows(rows: ParsedStatementRow[]) {
  const importedRows = rows.filter((r) => r.state === 'imported');
  const attentionRows = rows.filter((r) => isAttentionRow(r));
  const alreadyInLedgerRows = rows.filter((r) => isAlreadyInLedgerRow(r));
  const toReviewRows = rows.filter(
    (r) => r.state !== 'imported' && !isAttentionRow(r) && !isAlreadyInLedgerRow(r)
  );

  return { toReviewRows, importedRows, alreadyInLedgerRows, attentionRows };
}

describe('SpendSense Import UI Redesign: 4 Independent Vertical Sections & Transitions', () => {
  it('Total Row Conservation: Every extracted row belongs to exactly one of the 4 vertical sections', () => {
    const rows: ParsedStatementRow[] = [
      // Section A candidate: Valid new transaction
      {
        key: 'row-1',
        date: '2026-11-10',
        amount: '450.00',
        amountPaise: 45000,
        type: 'expense',
        description: 'Swiggy Food',
        cleanMerchant: 'Swiggy',
        paymentMethod: 'upi',
        reference: 'UPI12345',
        balance: null,
        state: 'new',
        classification: 'new',
        confidence: 'high',
        selected: true,
        categoryId: 'cat-food',
        necessity: 'optional',
      },
      // Section A candidate: Valid Uncategorized transaction (Uncategorized MUST be in To Review!)
      {
        key: 'row-2',
        date: '2026-11-11',
        amount: '120.00',
        amountPaise: 12000,
        type: 'expense',
        description: 'Local Corner Store',
        paymentMethod: 'cash',
        reference: null,
        balance: null,
        state: 'new',
        classification: 'new',
        confidence: 'medium',
        selected: true,
        categoryId: '', // Uncategorized
        necessity: null,
      },
      // Section B candidate: Already imported in this session
      {
        key: 'row-3',
        date: '2026-11-05',
        amount: '1500.00',
        amountPaise: 150000,
        type: 'expense',
        description: 'Petrol Fill',
        cleanMerchant: 'Shell Petrol',
        paymentMethod: 'online',
        reference: 'TXN-9988',
        balance: null,
        state: 'imported',
        classification: 'new',
        confidence: 'high',
        selected: false,
        categoryId: 'cat-fuel',
        necessity: 'essential',
      },
      // Section C candidate: Already recorded in active ledger
      {
        key: 'row-4',
        date: '2026-10-15',
        amount: '899.00',
        amountPaise: 89900,
        type: 'expense',
        description: 'Netflix Monthly',
        cleanMerchant: 'Netflix',
        paymentMethod: 'online',
        reference: 'ACH-NETFLIX',
        balance: null,
        state: 'possible_duplicate',
        classification: 'already_recorded',
        confidence: 'high',
        selected: false,
        categoryId: 'cat-entertainment',
        necessity: 'optional',
        matchedLedger: {
          matchTier: 'priority1_reference',
          matchConfidence: 'confirmed',
          confidenceScore: 100,
          matchMethod: 'Bank reference match',
          matchedLedger: {
            id: 'ledger-netflix',
            transaction_date: '2026-10-15',
            amount_paise: 89900,
            type: 'expense',
            description: 'Netflix Subscription (User Named)',
            category_name: 'Entertainment',
            necessity: 'optional',
          },
        },
      },
      // Section D candidate: Invalid/missing date
      {
        key: 'row-5',
        date: '',
        amount: '500.00',
        amountPaise: 50000,
        type: 'expense',
        description: 'Corrupted Date Entry',
        paymentMethod: 'upi',
        reference: null,
        balance: null,
        state: 'needs_review',
        classification: 'extraction_problem',
        confidence: 'low',
        selected: false,
        categoryId: '',
        necessity: null,
      },
      // Section D candidate: Ambiguous direction
      {
        key: 'row-6',
        date: '2026-11-12',
        amount: '300.00',
        amountPaise: 30000,
        type: 'expense',
        description: 'Ambiguous Row',
        paymentMethod: 'online',
        reference: null,
        balance: null,
        state: 'ambiguous',
        classification: 'ambiguous',
        confidence: 'low',
        selected: false,
        categoryId: '',
        necessity: null,
      },
    ];

    const { toReviewRows, importedRows, alreadyInLedgerRows, attentionRows } = partitionRows(rows);

    assert.equal(toReviewRows.length, 2, 'Section A must contain 2 valid review rows');
    assert.equal(importedRows.length, 1, 'Section B must contain 1 imported row');
    assert.equal(alreadyInLedgerRows.length, 1, 'Section C must contain 1 already in ledger row');
    assert.equal(attentionRows.length, 2, 'Section D must contain 2 attention rows');

    // Conservation check: Sum of all sections equals total rows
    const sum = toReviewRows.length + importedRows.length + alreadyInLedgerRows.length + attentionRows.length;
    assert.equal(sum, rows.length, 'Every row must belong to exactly one section');
  });

  it('Action: "Include Anyway" moves a transaction from Section C (Already in Ledger) to Section A (To Review)', () => {
    let row: ParsedStatementRow = {
      key: 'row-netflix',
      date: '2026-10-15',
      amount: '899.00',
      amountPaise: 89900,
      type: 'expense',
      description: 'Netflix Monthly',
      cleanMerchant: 'Netflix',
      paymentMethod: 'online',
      reference: 'ACH-NETFLIX',
      balance: null,
      state: 'possible_duplicate',
      classification: 'already_recorded',
      confidence: 'high',
      selected: false,
      categoryId: 'cat-ent',
      necessity: 'optional',
      matchedLedger: {
        matchTier: 'priority1_reference',
        matchConfidence: 'confirmed',
        confidenceScore: 100,
        matchMethod: 'Bank ref match',
        matchedLedger: {
          id: 'ledger-netflix',
          transaction_date: '2026-10-15',
          amount_paise: 89900,
          type: 'expense',
          description: 'Netflix',
        },
      },
    };

    // Before action: In Section C
    let partitioned = partitionRows([row]);
    assert.equal(partitioned.alreadyInLedgerRows.length, 1);
    assert.equal(partitioned.toReviewRows.length, 0);

    // User clicks "Include Anyway"
    row = {
      ...row,
      state: 'new',
      classification: 'new',
      selected: true,
      includedAnyway: true,
    };

    // After action: Moved to Section A
    partitioned = partitionRows([row]);
    assert.equal(partitioned.alreadyInLedgerRows.length, 0);
    assert.equal(partitioned.toReviewRows.length, 1);
    assert.equal(partitioned.toReviewRows[0].selected, true);
  });

  it('Action: "Skip" moves a transaction from Section A (To Review) to Section D (Skipped)', () => {
    let row: ParsedStatementRow = {
      key: 'row-chai',
      date: '2026-11-12',
      amount: '50.00',
      amountPaise: 5000,
      type: 'expense',
      description: 'Tea Stall',
      cleanMerchant: 'Tea Stall',
      paymentMethod: 'upi',
      reference: 'UPI-TEA-001',
      balance: null,
      state: 'new',
      classification: 'new',
      confidence: 'high',
      selected: true,
      categoryId: '',
      necessity: null,
    };

    // Before action: In Section A
    let partitioned = partitionRows([row]);
    assert.equal(partitioned.toReviewRows.length, 1);
    assert.equal(partitioned.attentionRows.length, 0);

    // User clicks "Skip"
    row = {
      ...row,
      selected: false,
      userSkipped: true,
      state: 'skipped',
      exclusionReason: 'Permanently skipped by user',
    };

    // After action: Moved to Section D
    partitioned = partitionRows([row]);
    assert.equal(partitioned.toReviewRows.length, 0);
    assert.equal(partitioned.attentionRows.length, 1);
    assert.equal(partitioned.attentionRows[0].exclusionReason, 'Permanently skipped by user');
  });

  it('Action: "Import Selected" moves transactions from Section A (To Review) to Section B (Imported)', () => {
    let row: ParsedStatementRow = {
      key: 'row-to-commit',
      date: '2026-11-14',
      amount: '2500.00',
      amountPaise: 250000,
      type: 'expense',
      description: 'Groceries at Nature Basket',
      cleanMerchant: 'Nature Basket',
      paymentMethod: 'upi',
      reference: 'UPI-NB-44',
      balance: null,
      state: 'new',
      classification: 'new',
      confidence: 'high',
      selected: true,
      categoryId: 'cat-groceries',
      necessity: 'essential',
    };

    // Before import: In Section A
    let partitioned = partitionRows([row]);
    assert.equal(partitioned.toReviewRows.length, 1);
    assert.equal(partitioned.importedRows.length, 0);

    // After import batch commit: Marked imported
    row = {
      ...row,
      state: 'imported',
      selected: false,
    };

    partitioned = partitionRows([row]);
    assert.equal(partitioned.toReviewRows.length, 0);
    assert.equal(partitioned.importedRows.length, 1);
  });
});
