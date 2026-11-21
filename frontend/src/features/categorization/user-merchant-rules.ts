/**
 * User Merchant Rules Engine (Layer 1 of SpendSense Layered Categorization)
 * Allows users to define, manage, and automatically learn rules mapping merchant patterns
 * to specific categories and necessity tiers. Stored locally per user with immediate effect.
 */

import type { CategoryDTO, NecessityClass, TransactionType } from '@arth/contracts';
import { normalizeMerchantKey } from './upi-parser';

export interface UserMerchantRule {
  id: string;
  userId: string;
  pattern: string; // The merchant pattern (e.g. "R S DAIRY", "HARSHIT YADAV")
  patternKey: string; // Normalized key for fast matching
  cleanName: string; // Human display name
  categoryId: string; // Assigned category ID
  categoryName: string; // Category display name
  necessity?: NecessityClass | null; // Optional necessity tier
  confidence: number; // Rule confidence (1.0 for user rules)
  createdAt: string; // ISO 8601
  updatedAt: string;
  useCount: number;
}

const STORAGE_PREFIX = 'spendsense_merchant_rules_v1:';

function getStorageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId || 'anonymous'}`;
}

/**
 * Retrieves all saved merchant rules for a user.
 */
export function getUserMerchantRules(userId: string): UserMerchantRule[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(getStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Saves or updates a user merchant rule. Immediate in-memory and local persistence.
 */
export function saveUserMerchantRule(
  userId: string,
  ruleInput: {
    pattern: string;
    cleanName?: string;
    categoryId: string;
    categoryName: string;
    necessity?: NecessityClass | null;
  }
): UserMerchantRule {
  const pattern = (ruleInput.pattern || '').trim();
  const patternKey = normalizeMerchantKey(pattern);
  const cleanName = (ruleInput.cleanName || pattern).trim();

  const rules = getUserMerchantRules(userId);
  const now = new Date().toISOString();

  // Check if a rule for this patternKey already exists
  const existingIndex = rules.findIndex((r) => r.patternKey === patternKey);

  let savedRule: UserMerchantRule;

  if (existingIndex >= 0) {
    savedRule = {
      ...rules[existingIndex],
      pattern,
      cleanName,
      categoryId: ruleInput.categoryId,
      categoryName: ruleInput.categoryName,
      necessity: ruleInput.necessity ?? null,
      updatedAt: now,
      useCount: (rules[existingIndex].useCount || 0) + 1,
    };
    rules[existingIndex] = savedRule;
  } else {
    savedRule = {
      id: `rule_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      userId,
      pattern,
      patternKey,
      cleanName,
      categoryId: ruleInput.categoryId,
      categoryName: ruleInput.categoryName,
      necessity: ruleInput.necessity ?? null,
      confidence: 1.0,
      createdAt: now,
      updatedAt: now,
      useCount: 1,
    };
    rules.unshift(savedRule);
  }

  // Persist up to 1000 rules
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(getStorageKey(userId), JSON.stringify(rules.slice(0, 1000)));
    } catch {
      // Storage quota or private mode handled gracefully
    }
  }

  return savedRule;
}

/**
 * Deletes a user merchant rule by ID.
 */
export function deleteUserMerchantRule(userId: string, ruleId: string): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    const rules = getUserMerchantRules(userId);
    const filtered = rules.filter((r) => r.id !== ruleId);
    if (filtered.length !== rules.length) {
      window.localStorage.setItem(getStorageKey(userId), JSON.stringify(filtered));
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Finds a matching rule for a given narration, clean merchant, or merchant key.
 */
export function matchUserMerchantRule(
  userId: string,
  input: {
    rawNarration?: string;
    cleanMerchant?: string;
    merchantKey?: string;
  }
): UserMerchantRule | null {
  const rules = getUserMerchantRules(userId);
  if (!rules || rules.length === 0) return null;

  const keyToMatch = input.merchantKey || normalizeMerchantKey(input.cleanMerchant || input.rawNarration || '');
  if (!keyToMatch) return null;

  // 1. Exact match on normalized patternKey
  const exact = rules.find((r) => r.patternKey === keyToMatch);
  if (exact) return exact;

  // 2. Substring match (e.g. pattern "r s dairy" matches "upi r s dairy payment")
  const substring = rules.find((r) => {
    if (!r.patternKey || r.patternKey.length < 3) return false;
    return keyToMatch.includes(r.patternKey) || (input.rawNarration && normalizeMerchantKey(input.rawNarration).includes(r.patternKey));
  });

  return substring || null;
}
