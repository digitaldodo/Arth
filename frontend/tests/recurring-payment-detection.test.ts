import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectRecurringPatterns,
  assessTransactionRecurrence,
  type RecurringTransactionItem,
} from '../src/features/categorization/recurring-detector.js';

describe('FinRegLab 2025 Compliant Recurring Payment Detection Engine', () => {
  it('Detects monthly fixed contract recurrence (e.g. Apartment Rent, Netflix, Insurance)', () => {
    const transactions: RecurringTransactionItem[] = [
      {
        transaction_date: '2026-01-05',
        amount_paise: 2500000,
        type: 'expense',
        description: 'UPI-SOBHA APARTMENT-RENT JAN',
        cleanMerchant: 'Sobha Rent',
      },
      {
        transaction_date: '2026-02-05',
        amount_paise: 2500000,
        type: 'expense',
        description: 'UPI-SOBHA APARTMENT-RENT FEB',
        cleanMerchant: 'Sobha Rent',
      },
      {
        transaction_date: '2026-03-05',
        amount_paise: 2500000,
        type: 'expense',
        description: 'UPI-SOBHA APARTMENT-RENT MAR',
        cleanMerchant: 'Sobha Rent',
      },
      {
        transaction_date: '2026-04-05',
        amount_paise: 2500000,
        type: 'expense',
        description: 'UPI-SOBHA APARTMENT-RENT APR',
        cleanMerchant: 'Sobha Rent',
      },
    ];

    const patterns = detectRecurringPatterns(transactions);
    const rentPattern = assessTransactionRecurrence(transactions[3], transactions.slice(0, 3));

    assert.ok(rentPattern, 'Must detect recurring pattern for Sobha Rent');
    assert.equal(rentPattern.recurrence_interval, 'monthly');
    assert.equal(rentPattern.recurrence_type, 'rent');
    assert.equal(rentPattern.necessity_prediction, 'essential');
    assert.ok(rentPattern.recurrence_confidence >= 0.70, 'Periodicity confidence must be >= 0.70');
    assert.ok(rentPattern.interval_days !== undefined && rentPattern.interval_days >= 28 && rentPattern.interval_days <= 32, 'Interval days should be ~30');

    // Also check patterns map directly
    const fromMap = patterns.get('sobha rent');
    assert.ok(fromMap, 'Must find sobha rent in detected patterns map');
    assert.equal(fromMap.recurrence_type, 'rent');
  });

  it('Detects variable utility recurring bills (e.g. BESCOM electricity, water, broadband)', () => {
    // Utility amounts naturally vary each billing cycle, but intervals remain ~30 days
    const utilityTransactions: RecurringTransactionItem[] = [
      {
        transaction_date: '2026-01-10',
        amount_paise: 245000, // ₹2,450
        type: 'expense',
        description: 'BBPS BESCOM ELECTRICITY JAN',
        cleanMerchant: 'Bescom Electricity',
      },
      {
        transaction_date: '2026-02-12', // 33 days interval
        amount_paise: 310000, // ₹3,100
        type: 'expense',
        description: 'BBPS BESCOM ELECTRICITY FEB',
        cleanMerchant: 'Bescom Electricity',
      },
      {
        transaction_date: '2026-03-11', // 27 days interval
        amount_paise: 285000, // ₹2,850
        type: 'expense',
        description: 'BBPS BESCOM ELECTRICITY MAR',
        cleanMerchant: 'Bescom Electricity',
      },
      {
        transaction_date: '2026-04-10', // 30 days interval
        amount_paise: 360000, // ₹3,600
        type: 'expense',
        description: 'BBPS BESCOM ELECTRICITY APR',
        cleanMerchant: 'Bescom Electricity',
      },
    ];

    const patterns = detectRecurringPatterns(utilityTransactions);
    const electricityPattern = assessTransactionRecurrence(utilityTransactions[3], utilityTransactions.slice(0, 3));

    assert.ok(electricityPattern, 'Must detect recurring pattern for variable electricity utility');
    assert.equal(electricityPattern.recurrence_interval, 'monthly');
    assert.equal(electricityPattern.recurrence_type, 'utility');
    assert.equal(electricityPattern.necessity_prediction, 'essential');
    assert.ok(electricityPattern.recurrence_confidence >= 0.70, 'Periodicity confidence must be >= 0.70');
  });

  it('Rejects habitual discretionary spending (e.g. coffee, random food delivery)', () => {
    // User visits coffee shop 5 times in 2 weeks at irregular intervals
    const coffeeTransactions: RecurringTransactionItem[] = [
      {
        transaction_date: '2026-01-02',
        amount_paise: 25000,
        type: 'expense',
        description: 'Third Wave Coffee Roasters Indiranagar',
        cleanMerchant: 'Third Wave Coffee',
      },
      {
        transaction_date: '2026-01-03', // 1 day
        amount_paise: 32000,
        type: 'expense',
        description: 'Third Wave Coffee Koramangala',
        cleanMerchant: 'Third Wave Coffee',
      },
      {
        transaction_date: '2026-01-08', // 5 days
        amount_paise: 28000,
        type: 'expense',
        description: 'Third Wave Coffee Roasters HSR',
        cleanMerchant: 'Third Wave Coffee',
      },
      {
        transaction_date: '2026-01-09', // 1 day
        amount_paise: 45000,
        type: 'expense',
        description: 'Third Wave Coffee MG Road',
        cleanMerchant: 'Third Wave Coffee',
      },
      {
        transaction_date: '2026-01-18', // 9 days
        amount_paise: 31000,
        type: 'expense',
        description: 'Third Wave Coffee Indiranagar',
        cleanMerchant: 'Third Wave Coffee',
      },
    ];

    const patterns = detectRecurringPatterns(coffeeTransactions);
    const pattern = assessTransactionRecurrence(coffeeTransactions[4], coffeeTransactions.slice(0, 4));

    assert.equal(pattern, null, 'Frequent habitual coffee spending must NOT be flagged as recurring contract or utility');
  });

  it('Excludes internal transfers and credit card bill payments from recurring detection', () => {
    const cardPayments: RecurringTransactionItem[] = [
      {
        transaction_date: '2026-01-15',
        amount_paise: 4500000,
        type: 'expense',
        description: 'CREDIT CARD PAYMENT HDFC BANK VISA',
        cleanMerchant: 'HDFC Credit Card',
      },
      {
        transaction_date: '2026-02-15',
        amount_paise: 6200000,
        type: 'expense',
        description: 'CREDIT CARD PAYMENT HDFC BANK VISA',
        cleanMerchant: 'HDFC Credit Card',
      },
      {
        transaction_date: '2026-03-15',
        amount_paise: 3800000,
        type: 'expense',
        description: 'CREDIT CARD PAYMENT HDFC BANK VISA',
        cleanMerchant: 'HDFC Credit Card',
      },
    ];

    const patterns = detectRecurringPatterns(cardPayments);
    const pattern = assessTransactionRecurrence(cardPayments[2], cardPayments.slice(0, 2));

    assert.equal(pattern, null, 'Credit card payments must be excluded from recurring subscription/utility patterns');
  });

  it('Enforces FinRegLab minimum data threshold: Requires >= 3 transactions and >= 2 intervals', () => {
    // Only 2 transactions = 1 interval -> Insufficient data to establish recurrence
    const twoTxs: RecurringTransactionItem[] = [
      {
        transaction_date: '2026-01-01',
        amount_paise: 49900,
        type: 'expense',
        description: 'Gym Membership',
        cleanMerchant: 'Cult Fit',
      },
      {
        transaction_date: '2026-02-01',
        amount_paise: 49900,
        type: 'expense',
        description: 'Gym Membership',
        cleanMerchant: 'Cult Fit',
      },
    ];

    const patterns = detectRecurringPatterns(twoTxs);
    assert.equal(patterns.size, 0, 'Cannot establish recurrence with fewer than 3 occurrences');
  });
});
