/**
 * SpendSense Dedicated Three-Level Necessity Classifier
 *
 * Implements strict 3-tier classification:
 * - 'essential': Unavoidable living expenses (rent, utilities, basic groceries, healthcare, EMIs/loans, insurance, tuition).
 * - 'optional': Quality-of-life discretionary spending (dining out, streaming, shopping, hobbies, travel, fitness memberships).
 * - 'luxury': Premium, indulgent, high-end discretionary spending (fine dining, luxury apparel, luxury travel/hotels, expensive gadgets).
 * - null: Unclassified / missing value (NOT a fourth tier!). Income transactions strictly receive null.
 *
 * Follows the 6-step decision hierarchy:
 * 1. Explicit user rule (highest priority) -> confidence 1.0
 * 2. User-confirmed previous classification for this merchant -> confidence 0.95
 * 3. Highly reliable merchant category mapping -> confidence 0.85
 * 4. Recurrence-aware prediction -> confidence 0.80
 * 5. Generic category-based heuristic -> confidence 0.65
 * 6. Unclassified (null) -> when confidence < 0.60
 */

import type { NecessityClass, TransactionType } from '@arth/contracts';
export type { NecessityClass };
import { matchUserMerchantRule } from './user-merchant-rules';
import { normalizeMerchantKey } from './upi-parser';
import type { RecurringPatternResult } from './recurring-detector';

export interface NecessityClassificationResult {
  necessity: NecessityClass | null;
  confidence: number;
  source: 'user_rule' | 'user_confirmed_history' | 'verified_merchant' | 'recurrence_prediction' | 'category_heuristic' | 'unclassified';
  reason: string;
}

export interface HistoricalTransactionRecord {
  transaction_date: string;
  amount_paise: number;
  type: string;
  description: string | null;
  cleanMerchant?: string;
  necessity?: NecessityClass | null;
  category_name?: string | null;
}

interface CuratedMerchantNecessity {
  pattern: RegExp;
  necessity: NecessityClass;
  reason: string;
}

const VERIFIED_NECESSITY_RULES: CuratedMerchantNecessity[] = [
  // Essential: Groceries, Milk, Daily staples
  {
    pattern: /\b(?:r\s*s\s*dairy|dairy|milk|amul|mother\s*dairy|country\s*delight|bigbasket|blinkit|zepto|instamart|dmart|jiomart|spencers|more\s*supermarket|supermarket|kirana|vegetables?|fruits?)\b/i,
    necessity: 'essential',
    reason: 'Basic groceries and daily nutritional staples',
  },
  // Essential: Healthcare, Pharmacy, Medical
  {
    pattern: /\b(?:apollo\s*pharmacy|apollo|1mg|tata\s*1mg|pharmeasy|netmeds|medplus|dr\s*lal|lal\s*pathlabs?|metropolis|diagnostic|hospital|clinic|pharmacy|dental|dentist)\b/i,
    necessity: 'essential',
    reason: 'Healthcare, medications, and clinical diagnostics',
  },
  // Essential: Utilities, Electricity, Water, Gas, Telecom
  {
    pattern: /\b(?:bescom|tneb|msedcl|tata\s*power|adani\s*electricity|electricity\s*bill|water\s*board|gas\s*bill|indraprastha\s*gas|igl|mahanagar\s*gas|mgl|airtel|jio|vodafone|vi\s*bill|bsnl|act\s*fibernet|broadband|recharge)\b/i,
    necessity: 'essential',
    reason: 'Essential household utilities and telecommunications',
  },
  // Essential: Transport, Daily Commute, Fuel
  {
    pattern: /\b(?:uber|ola|rapido|irctc|metro|fastag|toll|petrol|fuel|hpcl|bpcl|iocl|indian\s*oil|shell\s*petrol)\b/i,
    necessity: 'essential',
    reason: 'Transportation and daily commute obligations',
  },
  // Essential: Rent, Housing Maintenance
  {
    pattern: /\b(?:house\s*rent|rent\s*payment|flat\s*maintenance|society\s*maintenance|landlord)\b/i,
    necessity: 'essential',
    reason: 'Housing shelter and society maintenance',
  },
  // Essential: EMIs, Loans, Insurance
  {
    pattern: /\b(?:emi|home\s*loan|car\s*loan|personal\s*loan|bajaj\s*finance|hdfc\s*bank\s*loan|icici\s*loan|sbi\s*loan|insurance|lic|hdfc\s*life|icici\s*pru|star\s*health)\b/i,
    necessity: 'essential',
    reason: 'Financial debt service and insurance protection',
  },
  // Essential: Education & Schooling
  {
    pattern: /\b(?:school\s*fee|college\s*fee|tuition|exam\s*fee|university|udemy|coursera)\b/i,
    necessity: 'essential',
    reason: 'Formal education and vital career skilling',
  },

  // Luxury: Fine Dining, Luxury Apparel, High-end Hotels, Luxury Jewelry, Clubs
  {
    pattern: /\b(?:tanishq|malabar\s*gold|kalyan\s*jewellers|joyalukkas|gucci|louis\s*vuitton|prada|rolex|taj\s*hotel|oberoi|marriott|leela|fine\s*dining|golf\s*club|concierge|yacht)\b/i,
    necessity: 'luxury',
    reason: 'High-end indulgence and premium discretionary luxury',
  },

  // Optional: Everyday Dining, Cafes, Quick Service Restaurants (NOT luxury!)
  {
    pattern: /\b(?:zomato|swiggy|starbucks|mcdonalds?|dominos?|pizza\s*hut|kfc|burger\s*king|subway|haldirams?|barbeque\s*nation|cafe|coffee|restaurant|bikanervala|chaayos|chai\s*point)\b/i,
    necessity: 'optional',
    reason: 'Everyday dining and discretionary food delivery',
  },
  // Optional: Entertainment, Streaming & Digital Services (NOT luxury!)
  {
    pattern: /\b(?:netflix|spotify|hotstar|disney|amazon\s*prime|prime\s*video|sony\s*liv|zee5|bookmyshow|pvr|inox|cinema|theatre|gaming|steam|playstation|youtube\s*premium|apple\.com\/bill)\b/i,
    necessity: 'optional',
    reason: 'Discretionary entertainment and media subscriptions',
  },
  // Optional: E-Commerce, Apparel & Discretionary Retail
  {
    pattern: /\b(?:amazon|flipkart|myntra|meesho|nykaa|ajio|tata\s*cliq|croma|reliance\s*digital|vijay\s*sales|decathlon|ikea|zara|h&m)\b/i,
    necessity: 'optional',
    reason: 'Discretionary retail shopping and lifestyle goods',
  },
];

/**
 * Classifies the necessity of a transaction according to the authoritative 6-step hierarchy.
 */
export function classifyNecessity(params: {
  narration?: string;
  cleanMerchant?: string;
  categoryName?: string | null;
  type?: TransactionType;
  userId?: string;
  recurringPattern?: RecurringPatternResult | null;
  historicalTransactions?: readonly HistoricalTransactionRecord[];
}): NecessityClassificationResult {
  const { narration, cleanMerchant, categoryName, type = 'expense', userId, recurringPattern, historicalTransactions } = params;

  // RULE 0: Income transactions strictly have NO necessity (null)
  if (type === 'income') {
    return {
      necessity: null,
      confidence: 1.0,
      source: 'unclassified',
      reason: 'Income transactions do not have necessity classification',
    };
  }

  const textToAnalyze = `${cleanMerchant || ''} ${narration || ''}`.trim();
  const merchantKey = normalizeMerchantKey(cleanMerchant || narration || '');

  // -------------------------------------------------------------
  // TIER 1: Explicit User Rule (Highest Priority -> 1.0)
  // -------------------------------------------------------------
  if (userId) {
    const userRule = matchUserMerchantRule(userId, {
      rawNarration: narration,
      cleanMerchant,
      merchantKey,
    });
    if (userRule && userRule.necessity) {
      return {
        necessity: userRule.necessity,
        confidence: 1.0,
        source: 'user_rule',
        reason: `Matched user custom merchant rule: "${userRule.pattern}" -> ${userRule.necessity}`,
      };
    }
  }

  // -------------------------------------------------------------
  // TIER 2: User-Confirmed Previous Classification (Confidence 0.95)
  // -------------------------------------------------------------
  if (historicalTransactions && historicalTransactions.length && merchantKey) {
    for (const past of historicalTransactions) {
      if (past.type === 'expense' && past.necessity) {
        const pastKey = normalizeMerchantKey(past.cleanMerchant || past.description || '');
        if (pastKey === merchantKey) {
          return {
            necessity: past.necessity,
            confidence: 0.95,
            source: 'user_confirmed_history',
            reason: `Matches your previous confirmed classification for ${cleanMerchant || merchantKey}`,
          };
        }
      }
    }
  }

  // -------------------------------------------------------------
  // TIER 3: Highly Reliable Merchant Category Mapping (Confidence 0.85)
  // -------------------------------------------------------------
  for (const rule of VERIFIED_NECESSITY_RULES) {
    if (rule.pattern.test(textToAnalyze)) {
      return {
        necessity: rule.necessity,
        confidence: 0.85,
        source: 'verified_merchant',
        reason: rule.reason,
      };
    }
  }

  // -------------------------------------------------------------
  // TIER 4: Recurrence-Aware Prediction (Confidence 0.80)
  // -------------------------------------------------------------
  if (recurringPattern && recurringPattern.is_recurring && recurringPattern.necessity_prediction) {
    return {
      necessity: recurringPattern.necessity_prediction,
      confidence: 0.80,
      source: 'recurrence_prediction',
      reason: `Recurring ${recurringPattern.recurrence_type} payment pattern (${recurringPattern.recurrence_interval})`,
    };
  }

  // -------------------------------------------------------------
  // TIER 5: Generic Category-Based Heuristic (Confidence 0.65)
  // -------------------------------------------------------------
  if (categoryName) {
    const catLower = categoryName.toLowerCase();
    if (
      catLower.includes('grocer') ||
      catLower.includes('utilit') ||
      catLower.includes('health') ||
      catLower.includes('rent') ||
      catLower.includes('emi') ||
      catLower.includes('loan') ||
      catLower.includes('insurance') ||
      catLower.includes('transport') ||
      catLower.includes('commute') ||
      catLower.includes('education') ||
      catLower.includes('bill')
    ) {
      return {
        necessity: 'essential',
        confidence: 0.65,
        source: 'category_heuristic',
        reason: `Standard essential category heuristic (${categoryName})`,
      };
    }

    if (
      catLower.includes('dining') ||
      catLower.includes('food') ||
      catLower.includes('entertainment') ||
      catLower.includes('shopping') ||
      catLower.includes('personal') ||
      catLower.includes('fitness') ||
      catLower.includes('hobby') ||
      catLower.includes('travel')
    ) {
      return {
        necessity: 'optional',
        confidence: 0.65,
        source: 'category_heuristic',
        reason: `Standard optional category heuristic (${categoryName})`,
      };
    }

    if (catLower.includes('luxury') || catLower.includes('indulgence') || catLower.includes('jewel')) {
      return {
        necessity: 'luxury',
        confidence: 0.65,
        source: 'category_heuristic',
        reason: `Standard luxury category heuristic (${categoryName})`,
      };
    }
  }

  // -------------------------------------------------------------
  // TIER 6: Unclassified (null)
  // -------------------------------------------------------------
  return {
    necessity: null,
    confidence: 0.0,
    source: 'unclassified',
    reason: 'Uncertain necessity classification; awaiting user assignment',
  };
}
