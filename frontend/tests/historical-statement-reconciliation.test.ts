import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSourceFingerprint,
  reconcileStatementWithLedger,
  type ExistingLedgerTransaction,
  type StatementCandidateRow,
} from '../src/features/imports/historical-reconciliation.js';

describe('Historical Statement Reconciliation & 4-Tier Identity Hierarchy', () => {
  const userId = 'user-fin-reconcile-001';

  it('Tier 1: Stable source reference (UTR / Cheque / Bank Ref) guarantees Confirmed Match (100%)', () => {
    const existing: ExistingLedgerTransaction[] = [
      {
        id: 'tx-001',
        transaction_date: '2026-01-15',
        amount_paise: 125000,
        type: 'expense',
        description: 'Swiggy Food Order',
        cleanMerchant: 'Swiggy',
        statement_reference: 'UPI/123456789012/SWIGGY',
        category_name: 'Food & Dining',
        necessity: 'optional',
      },
    ];

    const statementRows: StatementCandidateRow[] = [
      {
        key: 'stmt-1',
        date: '2026-01-16', // Even with 1-day date difference due to settlement delay
        amountPaise: 125000,
        type: 'expense',
        description: 'UPI-SWIGGY-123456789012-BANGALORE',
        reference: 'UPI/123456789012/SWIGGY',
      },
    ];

    const outcomes = reconcileStatementWithLedger(statementRows, existing, { userId });
    assert.equal(outcomes.length, 1);
    assert.equal(outcomes[0].status, 'confirmed_match');
    assert.equal(outcomes[0].match?.matchTier, 'priority1_reference');
    assert.equal(outcomes[0].match?.confidenceScore, 100);
    assert.match(outcomes[0].match?.matchMethod || '', /reference/i);
    assert.equal(outcomes[0].match?.matchedLedger.id, 'tx-001');
    assert.equal(outcomes[0].match?.matchedLedger.category_name, 'Food & Dining');
    assert.equal(outcomes[0].match?.matchedLedger.necessity, 'optional');
  });

  it('Tier 2: Direct SpendSense Transaction ID guarantees Confirmed Match (100%)', () => {
    const existing: ExistingLedgerTransaction[] = [
      {
        id: 'tx-ss-7788',
        transaction_date: '2026-03-10',
        amount_paise: 500000,
        type: 'expense',
        description: 'Bespoke Tailoring',
        cleanMerchant: 'Raymond Tailors',
        category_name: 'Shopping',
        necessity: 'optional',
      },
    ];

    const statementRows: StatementCandidateRow[] = [
      {
        key: 'stmt-2',
        id: 'tx-ss-7788',
        date: '2026-03-10',
        amountPaise: 500000,
        type: 'expense',
        description: 'POS RAYMOND BANGALORE',
      },
    ];

    const outcomes = reconcileStatementWithLedger(statementRows, existing, { userId });
    assert.equal(outcomes.length, 1);
    assert.equal(outcomes[0].status, 'confirmed_match');
    assert.equal(outcomes[0].match?.matchTier, 'priority2_id');
    assert.equal(outcomes[0].match?.confidenceScore, 100);
    assert.match(outcomes[0].match?.matchMethod || '', /SpendSense/i);
  });

  it('Tier 3: Normalized source fingerprint match guarantees Confirmed Match (100%) across user edits', () => {
    const fp = computeSourceFingerprint({
      userId,
      transactionDate: '2026-01-05',
      amountPaise: 89900,
      type: 'expense',
      normalizedMerchant: 'netflix',
      institution: 'hdfc',
    });

    const existing: ExistingLedgerTransaction[] = [
      {
        id: 'tx-netflix-01',
        transaction_date: '2026-01-05',
        amount_paise: 89900,
        type: 'expense',
        description: 'Netflix Premium 4K (Renamed by User)',
        cleanMerchant: 'Netflix Entertainment',
        source_fingerprint: fp,
        category_name: 'Entertainment',
        necessity: 'optional',
      },
    ];

    const statementRows: StatementCandidateRow[] = [
      {
        key: 'stmt-netflix',
        date: '2026-01-05',
        amountPaise: 89900,
        type: 'expense',
        description: 'ACH DR-NETFLIX ENTERTAINMENT SERVICES-MUMBAI',
        cleanMerchant: 'Netflix',
        sourceFingerprint: fp,
      },
    ];

    const outcomes = reconcileStatementWithLedger(statementRows, existing, { userId });
    assert.equal(outcomes.length, 1);
    assert.equal(outcomes[0].status, 'confirmed_match');
    assert.equal(outcomes[0].match?.matchTier, 'priority3_fingerprint');
    assert.equal(outcomes[0].match?.confidenceScore, 100);
    assert.match(outcomes[0].match?.matchMethod || '', /fingerprint/i);
    assert.equal(outcomes[0].match?.matchedLedger.description, 'Netflix Premium 4K (Renamed by User)');
    assert.equal(outcomes[0].match?.matchedLedger.necessity, 'optional');
  });

  it('Tier 4: Indian fintech corporate aliases resolve correctly via fuzzy match (Bundl Tech <-> Swiggy)', () => {
    const existing: ExistingLedgerTransaction[] = [
      {
        id: 'tx-swiggy-edited',
        transaction_date: '2026-04-20',
        amount_paise: 38500,
        type: 'expense',
        description: 'Swiggy Dinner with Family',
        cleanMerchant: 'Swiggy',
        category_name: 'Food & Dining',
        necessity: 'optional',
      },
    ];

    const statementRows: StatementCandidateRow[] = [
      {
        key: 'stmt-bundl',
        date: '2026-04-20',
        amountPaise: 38500,
        type: 'expense',
        description: 'POS 458789 BUNDL TECHNOLOGIES PVT BANGALORE',
        cleanMerchant: 'Bundl Technologies',
      },
    ];

    const outcomes = reconcileStatementWithLedger(statementRows, existing, { userId });
    assert.equal(outcomes.length, 1);
    assert.equal(outcomes[0].status, 'likely_match');
    assert.equal(outcomes[0].match?.matchTier, 'priority4_fuzzy');
    assert.ok((outcomes[0].match?.confidenceScore || 0) >= 85, 'Confidence score should be >= 85% for known alias');
    assert.equal(outcomes[0].match?.matchedLedger.id, 'tx-swiggy-edited');
  });

  it('Tier 4 Hard Gates: Amount and Direction must strictly match; differing amounts NEVER match', () => {
    const existing: ExistingLedgerTransaction[] = [
      {
        id: 'tx-uber',
        transaction_date: '2026-05-10',
        amount_paise: 45000,
        type: 'expense',
        description: 'Uber Ride to Airport',
        cleanMerchant: 'Uber',
      },
    ];

    // Same merchant and date, but different amount
    const stmtDiffAmount: StatementCandidateRow[] = [
      {
        key: 'stmt-uber-diff',
        date: '2026-05-10',
        amountPaise: 55000, // Different amount
        type: 'expense',
        description: 'UPI-UBER INDIA-BANGALORE',
        cleanMerchant: 'Uber',
      },
    ];

    const outcomesAmount = reconcileStatementWithLedger(stmtDiffAmount, existing, { userId });
    assert.equal(outcomesAmount[0].status, 'new', 'Mismatched amount must never fuzzy-match');

    // Same merchant, date, amount, but opposite direction
    const stmtDiffType: StatementCandidateRow[] = [
      {
        key: 'stmt-uber-income',
        date: '2026-05-10',
        amountPaise: 45000,
        type: 'income', // Income vs Expense
        description: 'UPI-UBER INDIA-REFUND',
        cleanMerchant: 'Uber',
      },
    ];

    const outcomesType = reconcileStatementWithLedger(stmtDiffType, existing, { userId });
    assert.equal(outcomesType[0].status, 'new', 'Mismatched direction must never fuzzy-match');
  });

  it('1-to-1 Matching Invariant: A single ledger entry cannot be claimed by two statement rows', () => {
    const existing: ExistingLedgerTransaction[] = [
      {
        id: 'tx-single',
        transaction_date: '2026-06-01',
        amount_paise: 10000,
        type: 'expense',
        description: 'Chai Point',
        cleanMerchant: 'Chai Point',
      },
    ];

    // Two identical chai purchases in statement
    const statementRows: StatementCandidateRow[] = [
      {
        key: 'stmt-chai-1',
        date: '2026-06-01',
        amountPaise: 10000,
        type: 'expense',
        description: 'UPI-CHAI POINT-1',
        cleanMerchant: 'Chai Point',
      },
      {
        key: 'stmt-chai-2',
        date: '2026-06-01',
        amountPaise: 10000,
        type: 'expense',
        description: 'UPI-CHAI POINT-2',
        cleanMerchant: 'Chai Point',
      },
    ];

    const outcomes = reconcileStatementWithLedger(statementRows, existing, { userId });
    const matchedCount = outcomes.filter((o) => o.status !== 'new').length;
    const newCount = outcomes.filter((o) => o.status === 'new').length;

    assert.equal(matchedCount, 1, 'Only one statement row can match the single ledger record');
    assert.equal(newCount, 1, 'The second identical statement row must remain new');
  });

  it('Full Year Reconciliation: User has Jan in ledger with edits; uploads Jan-Nov statement', () => {
    // User ledger has January transactions with user-assigned custom categories and notes
    const existingLedger: ExistingLedgerTransaction[] = [
      {
        id: 'ledger-jan-01',
        transaction_date: '2026-01-02',
        amount_paise: 4500000,
        type: 'income',
        description: 'Monthly Salary - Acme Tech Inc (Bonus included)',
        cleanMerchant: 'Acme Tech',
        statement_reference: 'NEFT-SAL-JAN-001',
        category_name: 'Salary',
        necessity: null,
      },
      {
        id: 'ledger-jan-02',
        transaction_date: '2026-01-05',
        amount_paise: 2500000,
        type: 'expense',
        description: 'Apartment Rent - Sobha Forestview',
        cleanMerchant: 'House Rent',
        statement_reference: 'UPI-RENT-JAN-999',
        category_name: 'Housing',
        necessity: 'essential',
      },
      {
        id: 'ledger-jan-03',
        transaction_date: '2026-01-18',
        amount_paise: 65000,
        type: 'expense',
        description: 'Team Lunch at Toit Brewery',
        cleanMerchant: 'Toit Brewpub',
        statement_reference: 'POS-TOIT-1234',
        category_name: 'Food & Dining',
        necessity: 'optional',
      },
    ];

    // Full year statement covering January through November
    const fullYearStatement: StatementCandidateRow[] = [
      // January rows matching existing ledger
      {
        key: 'row-jan-1',
        date: '2026-01-02',
        amountPaise: 4500000,
        type: 'income',
        description: 'NEFT CR-ACME TECH INC-SAL JAN',
        reference: 'NEFT-SAL-JAN-001',
      },
      {
        key: 'row-jan-2',
        date: '2026-01-05',
        amountPaise: 2500000,
        type: 'expense',
        description: 'UPI-SOBHA FOREST-RENT',
        reference: 'UPI-RENT-JAN-999',
      },
      {
        key: 'row-jan-3',
        date: '2026-01-18',
        amountPaise: 65000,
        type: 'expense',
        description: 'POS 9988 TOIT BREWPUB BANGALORE',
        reference: 'POS-TOIT-1234',
      },
      // Subsequent months (Feb - Nov) which are NOT yet in ledger
      {
        key: 'row-feb-1',
        date: '2026-02-05',
        amountPaise: 2500000,
        type: 'expense',
        description: 'UPI-SOBHA FOREST-RENT',
        reference: 'UPI-RENT-FEB-999',
      },
      {
        key: 'row-mar-1',
        date: '2026-03-05',
        amountPaise: 2500000,
        type: 'expense',
        description: 'UPI-SOBHA FOREST-RENT',
        reference: 'UPI-RENT-MAR-999',
      },
      {
        key: 'row-nov-1',
        date: '2026-11-15',
        amountPaise: 185000,
        type: 'expense',
        description: 'AMAZON PAY INDIA MUMBAI',
        reference: 'UPI-AMZN-NOV-444',
      },
    ];

    const outcomes = reconcileStatementWithLedger(fullYearStatement, existingLedger, { userId });

    // Verify January rows are Confirmed Matches (Section C: Already in Ledger)
    const jan1 = outcomes.find((o) => o.rowKey === 'row-jan-1');
    const jan2 = outcomes.find((o) => o.rowKey === 'row-jan-2');
    const jan3 = outcomes.find((o) => o.rowKey === 'row-jan-3');

    assert.equal(jan1?.status, 'confirmed_match');
    assert.equal(jan1?.match?.matchedLedger.description, 'Monthly Salary - Acme Tech Inc (Bonus included)');

    assert.equal(jan2?.status, 'confirmed_match');
    assert.equal(jan2?.match?.matchedLedger.necessity, 'essential');
    assert.equal(jan2?.match?.matchedLedger.category_name, 'Housing');

    assert.equal(jan3?.status, 'confirmed_match');
    assert.equal(jan3?.match?.matchedLedger.necessity, 'optional');
    assert.equal(jan3?.match?.matchedLedger.description, 'Team Lunch at Toit Brewery');

    // Verify February-November rows are New (Section A: To Review)
    const feb1 = outcomes.find((o) => o.rowKey === 'row-feb-1');
    const mar1 = outcomes.find((o) => o.rowKey === 'row-mar-1');
    const nov1 = outcomes.find((o) => o.rowKey === 'row-nov-1');

    assert.equal(feb1?.status, 'new');
    assert.equal(mar1?.status, 'new');
    assert.equal(nov1?.status, 'new');
  });
});
