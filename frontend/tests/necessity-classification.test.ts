import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyNecessity,
  type NecessityClass,
} from '../src/features/categorization/necessity-classifier.js';
import { saveUserMerchantRule } from '../src/features/categorization/user-merchant-rules.js';

describe('Strict 3-Level Financial Necessity Classification Engine', () => {
  const userId = 'user-nec-test-456';

  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as unknown as { window: { localStorage: Storage } }).window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, String(v)); },
        removeItem: (k: string) => { store.delete(k); },
        clear: () => { store.clear(); },
        key: (i: number) => Array.from(store.keys())[i] ?? null,
        length: 0,
      },
    };
  });

  it('Enforces strictly 3 tiers: essential, optional, luxury; null represents unclassified, NOT a fourth tier', () => {
    const validTiers: Array<NecessityClass | null> = ['essential', 'optional', 'luxury', null];

    const resultEssential = classifyNecessity({
      cleanMerchant: 'Apollo Pharmacy',
      categoryName: 'Medical & Healthcare',
      type: 'expense',
      userId,
    });
    assert.equal(resultEssential.necessity, 'essential');
    assert.ok(validTiers.includes(resultEssential.necessity));

    const resultOptional = classifyNecessity({
      cleanMerchant: 'Netflix',
      categoryName: 'Entertainment',
      type: 'expense',
      userId,
    });
    assert.equal(resultOptional.necessity, 'optional');
    assert.ok(validTiers.includes(resultOptional.necessity));

    const resultLuxury = classifyNecessity({
      cleanMerchant: 'Louis Vuitton',
      categoryName: 'Luxury & Indulgence',
      type: 'expense',
      userId,
    });
    assert.equal(resultLuxury.necessity, 'luxury');
    assert.ok(validTiers.includes(resultLuxury.necessity));

    const resultUnclassified = classifyNecessity({
      narration: 'MISC UNKNOWN TRANSACTION 99999',
      type: 'expense',
      userId,
    });
    assert.equal(resultUnclassified.necessity, null, 'Unclassified must return null, not an invented fourth tier string');
    assert.equal(resultUnclassified.source, 'unclassified');
  });

  it('Income transactions always return null (necessity applies exclusively to expenses)', () => {
    const income1 = classifyNecessity({
      narration: 'SALARY CREDIT ACME CORP',
      cleanMerchant: 'Acme Corp',
      categoryName: 'Salary',
      type: 'income',
      userId,
    });
    assert.equal(income1.necessity, null);
    assert.equal(income1.confidence, 1.0);

    const income2 = classifyNecessity({
      narration: 'INTEREST CREDIT SAVINGS A/C',
      cleanMerchant: 'HDFC Bank',
      categoryName: 'Investment & Dividends',
      type: 'income',
      userId,
    });
    assert.equal(income2.necessity, null);
  });

  it('Everyday discretionary spending is categorized as Optional, NOT Luxury', () => {
    const streamingServices = ['Netflix', 'Spotify', 'Disney+ Hotstar', 'YouTube Premium'];
    for (const service of streamingServices) {
      const res = classifyNecessity({
        cleanMerchant: service,
        categoryName: 'Entertainment',
        type: 'expense',
        userId,
      });
      assert.equal(res.necessity, 'optional', `${service} must be Optional, never Luxury`);
    }

    const diningOut = ['Swiggy', 'Zomato', 'PVR Cinemas', 'Starbucks'];
    for (const merchant of diningOut) {
      const res = classifyNecessity({
        cleanMerchant: merchant,
        categoryName: 'Food & Dining',
        type: 'expense',
        userId,
      });
      assert.equal(res.necessity, 'optional', `${merchant} must be Optional, never Luxury`);
    }
  });

  it('Genuine luxury indulgences are correctly classified as Luxury', () => {
    const luxuryMerchants = ['Gucci', 'Rolex', 'Taj Exotica Resort', 'Sabyasachi Mukherjee'];
    for (const merchant of luxuryMerchants) {
      const res = classifyNecessity({
        cleanMerchant: merchant,
        categoryName: 'Luxury & Indulgence',
        type: 'expense',
        userId,
      });
      assert.equal(res.necessity, 'luxury', `${merchant} must be classified as Luxury`);
    }
  });

  it('Step 1: Explicit user-defined rules take absolute precedence over built-in heuristics', () => {
    // User explicitly sets a rule: Starbucks is "essential" for them (e.g. daily coffee addict)
    saveUserMerchantRule(userId, {
      pattern: 'Starbucks',
      cleanName: 'Starbucks Coffee',
      categoryId: 'cat-groceries',
      categoryName: 'Groceries',
      necessity: 'essential',
    });

    const res = classifyNecessity({
      cleanMerchant: 'Starbucks',
      categoryName: 'Food & Dining',
      type: 'expense',
      userId,
    });

    assert.equal(res.necessity, 'essential', 'User rule must override built-in optional classification');
    assert.equal(res.source, 'user_rule');
    assert.equal(res.confidence, 1.0);
  });

  it('Step 2: User-confirmed previous classifications in historical ledger take precedence over heuristics', () => {
    // In historical ledger, user repeatedly categorized "Cult Fit" gym as essential
    const historicalTxs = [
      {
        transaction_date: '2026-01-01',
        amount_paise: 150000,
        type: 'expense',
        description: 'Cult Fit Gym Indiranagar',
        cleanMerchant: 'Cult Fit',
        necessity: 'essential' as const,
      },
      {
        transaction_date: '2026-02-01',
        amount_paise: 150000,
        type: 'expense',
        description: 'Cult Fit Gym Indiranagar',
        cleanMerchant: 'Cult Fit',
        necessity: 'essential' as const,
      },
    ];

    const res = classifyNecessity({
      cleanMerchant: 'Cult Fit',
      type: 'expense',
      userId: 'fresh-user-without-rules',
      historicalTransactions: historicalTxs,
    });

    assert.equal(res.necessity, 'essential', 'Historical ledger classifications must be learned');
    assert.equal(res.source, 'user_confirmed_history');
    assert.equal(res.confidence, 0.95);
  });

  it('Step 4: Recurrence-aware predictions: Rent/EMI/Insurance are Essential, Subscriptions are Optional', () => {
    const rentRes = classifyNecessity({
      cleanMerchant: 'Ramesh Sharma Property',
      type: 'expense',
      userId,
      recurringPattern: {
        is_recurring: true,
        recurrence_type: 'rent',
        recurrence_interval: 'monthly',
        recurrence_confidence: 0.95,
        next_expected_date: '2026-05-05',
        necessity_prediction: 'essential',
        necessity_confidence: 0.95,
        average_amount_paise: 2500000,
        interval_days: 30,
        series_length: 4,
        pattern_description: 'Monthly Rent',
      },
    });
    assert.equal(rentRes.necessity, 'essential');
    assert.equal(rentRes.source, 'recurrence_prediction');

    const subRes = classifyNecessity({
      cleanMerchant: 'Audible Subscription',
      type: 'expense',
      userId,
      recurringPattern: {
        is_recurring: true,
        recurrence_type: 'subscription',
        recurrence_interval: 'monthly',
        recurrence_confidence: 0.90,
        next_expected_date: '2026-05-10',
        necessity_prediction: 'optional',
        necessity_confidence: 0.85,
        average_amount_paise: 19900,
        interval_days: 30,
        series_length: 5,
        pattern_description: 'Monthly Subscription',
      },
    });
    assert.equal(subRes.necessity, 'optional');
    assert.equal(subRes.source, 'recurrence_prediction');
  });
});
