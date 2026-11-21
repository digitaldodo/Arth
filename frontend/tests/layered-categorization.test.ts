import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { categorizeTransactionWithLayers } from '../src/features/categorization/layered-categorization.js';
import { saveUserMerchantRule, deleteUserMerchantRule, getUserMerchantRules } from '../src/features/categorization/user-merchant-rules.js';
import type { CategoryDTO } from '@arth/contracts';

const mockCategories: CategoryDTO[] = [
  { id: 'cat-groceries', name: 'Groceries', type: 'expense', sort_order: 1, is_default: false, icon: null, color: null, archived_at: null },
  { id: 'cat-food', name: 'Food & Dining', type: 'expense', sort_order: 2, is_default: false, icon: null, color: null, archived_at: null },
  { id: 'cat-transport', name: 'Transport', type: 'expense', sort_order: 3, is_default: false, icon: null, color: null, archived_at: null },
  { id: 'cat-shopping', name: 'Shopping', type: 'expense', sort_order: 4, is_default: false, icon: null, color: null, archived_at: null },
  { id: 'cat-salary', name: 'Salary', type: 'income', sort_order: 1, is_default: false, icon: null, color: null, archived_at: null },
];

describe('SpendSense Layered Categorization Engine', () => {
  const userId = 'test-user-123';

  // Setup mock localStorage in node environment if needed
  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as unknown as { window: { localStorage: Storage } }).window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, String(v)); },
        removeItem: (k: string) => { store.delete(k); },
        clear: () => { store.clear(); },
        key: (i: number) => Array.from(store.keys())[i] ?? null,
        length: store.size,
      },
    };
  });

  it('Layer 1: User-Specific Merchant Rules take highest priority over default heuristics', () => {
    // Save rule: "Swiggy" -> Shopping (even though Swiggy is normally Food & Dining!)
    saveUserMerchantRule(userId, {
      pattern: 'Swiggy',
      categoryId: 'cat-shopping',
      categoryName: 'Shopping',
      necessity: 'luxury',
    });

    const result = categorizeTransactionWithLayers(
      'UPI-SWIGGY-12345',
      mockCategories,
      'expense',
      userId,
      'Swiggy'
    );

    assert.equal(result.layer, 1);
    assert.equal(result.method, 'user_rule');
    assert.equal(result.categoryId, 'cat-shopping');
    assert.equal(result.categoryName, 'Shopping');
    assert.equal(result.necessity, 'luxury');
    assert.equal(result.confidence, 1.0);
  });

  it('Layer 2: Verified Indian merchant heuristics match known entities', () => {
    const result = categorizeTransactionWithLayers(
      'UPI-R S DAIRY-9876543210@paytm',
      mockCategories,
      'expense',
      userId,
      'R S Dairy'
    );

    assert.equal(result.layer, 2);
    assert.equal(result.method, 'verified_merchant');
    assert.equal(result.categoryId, 'cat-groceries');
    assert.equal(result.categoryName, 'Groceries');
    assert.equal(result.necessity, 'essential');
  });

  it('Layer 4: Fallback to Uncategorized with confidence 0 and never throws', () => {
    const result = categorizeTransactionWithLayers(
      'MISCELLANEOUS UNKNOWN CORP 998811',
      mockCategories,
      'expense',
      userId,
      'Unknown Corp'
    );

    assert.equal(result.layer, 4);
    assert.equal(result.method, 'uncategorized');
    assert.equal(result.categoryId, null);
    assert.equal(result.categoryName, 'Uncategorized');
    assert.equal(result.necessity, null);
    assert.equal(result.confidence, 0);
  });
});
