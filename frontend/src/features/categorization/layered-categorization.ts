/**
 * SpendSense Layered Categorization Engine
 *
 * Implements 4-tier categorization pipeline:
 * - Layer 1: User-Specific Merchant Rules (highest priority, immediate effect)
 * - Layer 2: Verified Merchant Identity / Curated Indian Fintech Heuristics
 * - Layer 3: Existing Weak Supervision / FastText ML models
 * - Layer 4: Uncertainty Handling / Safe Fallback to Uncategorized (category_id: null)
 *
 * Priority 2 Guarantees:
 * Uncategorized is a valid, first-class state. Missing category never blocks import.
 */

import type { CategoryDTO, NecessityClass, TransactionType } from '@arth/contracts';
import { matchUserMerchantRule, type UserMerchantRule } from './user-merchant-rules';
import { suggestCategory } from './pipeline';
import { normalizeMerchantKey } from './upi-parser';

export interface LayeredCategorizationResult {
  categoryId: string | null;
  categoryName: string;
  necessity?: NecessityClass | null;
  confidence: number;
  layer: 1 | 2 | 3 | 4;
  method: 'user_rule' | 'verified_merchant' | 'weak_supervision' | 'uncategorized';
  evidence: Array<{ source: string; detail: string }>;
}

// Layer 2: Verified Curated Indian Merchant Directory
interface VerifiedMerchantInfo {
  categoryName: string;
  defaultNecessity: NecessityClass;
  aliases: RegExp[];
}

const VERIFIED_MERCHANTS: VerifiedMerchantInfo[] = [
  // Groceries / Daily Essentials
  {
    categoryName: 'Groceries',
    defaultNecessity: 'essential',
    aliases: [
      /\b(?:r\s*s\s*dairy|dairy|milk|amul|mother\s*dairy|country\s*delight)\b/i,
      /\b(?:bigbasket|blinkit|zepto|instamart|dmart|jiomart|nature'?s\s*basket|spencers|more\s*supermarket|supermarket|kirana|vegetables?|fruits?)\b/i,
    ],
  },
  // Food & Dining
  {
    categoryName: 'Food & Dining',
    defaultNecessity: 'optional',
    aliases: [
      /\b(?:zomato|swiggy|starbucks|mcdonalds?|dominos?|pizza\s*hut|kfc|burger\s*king|subway|haldirams?|barbeque\s*nation|cafe|coffee|restaurant|bikanervala|chaayos|chai\s*point)\b/i,
    ],
  },
  // Transport & Commute
  {
    categoryName: 'Transport',
    defaultNecessity: 'essential',
    aliases: [
      /\b(?:uber|ola|rapido|irctc|metro|fastag|toll|petrol|fuel|hpcl|bpcl|iocl|indian\s*oil|shell\s*petrol|makemytrip|yatra|indigo|air\s*india|cleartrip)\b/i,
    ],
  },
  // Utilities & Bills
  {
    categoryName: 'Utilities',
    defaultNecessity: 'essential',
    aliases: [
      /\b(?:bescom|tneb|msedcl|tata\s*power|adani\s*electricity|electricity\s*bill|water\s*board|gas\s*bill|indraprastha\s*gas|igl|mahanagar\s*gas|mgl)\b/i,
      /\b(?:airtel|jio|vodafone|vi\s*bill|bsnl|act\s*fibernet|broadband|recharge|tata\s*play|dish\s*tv|dth)\b/i,
    ],
  },
  // Shopping & E-Commerce
  {
    categoryName: 'Shopping',
    defaultNecessity: 'optional',
    aliases: [
      /\b(?:amazon|flipkart|myntra|meesho|nykaa|ajio|tata\s*cliq|croma|reliance\s*digital|vijay\s*sales|decathlon|ikea|zara|h&m)\b/i,
    ],
  },
  // Entertainment & Subscriptions
  {
    categoryName: 'Entertainment',
    defaultNecessity: 'optional',
    aliases: [
      /\b(?:netflix|spotify|hotstar|disney|amazon\s*prime|prime\s*video|sony\s*liv|zee5|bookmyshow|pvr|inox|cinema|theatre|gaming|steam|playstation|youtube\s*premium|apple\.com\/bill)\b/i,
    ],
  },
  // Luxury & High-End Indulgence
  {
    categoryName: 'Luxury & Indulgence',
    defaultNecessity: 'luxury',
    aliases: [
      /\b(?:tanishq|malabar\s*gold|kalyan\s*jewellers|joyalukkas|gucci|louis\s*vuitton|prada|rolex|taj\s*hotel|oberoi|marriott|leela|fine\s*dining|golf\s*club|concierge)\b/i,
    ],
  },
  // Healthcare & Pharmacy
  {
    categoryName: 'Healthcare',
    defaultNecessity: 'essential',
    aliases: [
      /\b(?:apollo\s*pharmacy|apollo|1mg|tata\s*1mg|pharmeasy|netmeds|medplus|dr\s*lal|lal\s*pathlabs?|metropolis|diagnostic|hospital|clinic|pharmacy|dental|dentist)\b/i,
    ],
  },
  // Education
  {
    categoryName: 'Education',
    defaultNecessity: 'essential',
    aliases: [
      /\b(?:udemy|coursera|unacademy|byjus|school\s*fee|college\s*fee|tuition|exam\s*fee|university)\b/i,
    ],
  },
  // Housing / Rent
  {
    categoryName: 'Rent',
    defaultNecessity: 'essential',
    aliases: [
      /\b(?:house\s*rent|rent\s*payment|flat\s*maintenance|society\s*maintenance|landlord)\b/i,
    ],
  },
  // EMIs & Loans
  {
    categoryName: 'EMIs & Loans',
    defaultNecessity: 'essential',
    aliases: [
      /\b(?:emi|home\s*loan|car\s*loan|personal\s*loan|bajaj\s*finance|hdfc\s*bank\s*loan|icici\s*loan|sbi\s*loan)\b/i,
    ],
  },
];

/**
 * Categorizes a transaction using the 4-layer intelligence architecture.
 *
 * @param narration Raw narration or clean merchant name
 * @param categories User's available categories
 * @param type Transaction type ('income' | 'expense')
 * @param userId Current user ID (for Layer 1 user rules)
 * @param cleanMerchant Pre-extracted clean merchant name if available
 */
export function categorizeTransactionWithLayers(
  narration: string,
  categories: readonly CategoryDTO[],
  type: TransactionType = 'expense',
  userId?: string,
  cleanMerchant?: string
): LayeredCategorizationResult {
  const textToAnalyze = (cleanMerchant || narration || '').trim();
  const rawNormalized = normalizeMerchantKey(narration || '');
  const merchantKey = normalizeMerchantKey(textToAnalyze);

  // -------------------------------------------------------------
  // LAYER 1: User-Specific Merchant Rules (Highest Priority)
  // -------------------------------------------------------------
  if (userId) {
    const userRule = matchUserMerchantRule(userId, {
      rawNarration: narration,
      cleanMerchant,
      merchantKey,
    });

    if (userRule) {
      // Find matching category from user's active categories
      const matchedCategory = categories.find(
        (c) => c.id === userRule.categoryId || c.name.toLowerCase() === userRule.categoryName.toLowerCase()
      );

      return {
        categoryId: matchedCategory ? matchedCategory.id : userRule.categoryId,
        categoryName: matchedCategory ? matchedCategory.name : userRule.categoryName,
        necessity: userRule.necessity ?? null,
        confidence: 1.0,
        layer: 1,
        method: 'user_rule',
        evidence: [
          {
            source: 'User Merchant Rule',
            detail: `Matched saved merchant rule: "${userRule.pattern}" → ${userRule.categoryName}`,
          },
        ],
      };
    }
  }

  // If income transaction, let Layer 3 or fallback handle it (salary, dividend, refund)
  if (type === 'income') {
    const mlSuggestion = suggestCategory(narration, categories, 'income');
    if (mlSuggestion && mlSuggestion.confidence >= 0.6) {
      return {
        categoryId: mlSuggestion.category.id,
        categoryName: mlSuggestion.category.name,
        necessity: null,
        confidence: mlSuggestion.confidence,
        layer: 3,
        method: 'weak_supervision',
        evidence: mlSuggestion.evidence.map((e) => ({ source: e.source, detail: e.detail })),
      };
    }

    return {
      categoryId: null,
      categoryName: 'Uncategorized',
      necessity: null,
      confidence: 0,
      layer: 4,
      method: 'uncategorized',
      evidence: [],
    };
  }

  // -------------------------------------------------------------
  // LAYER 2: Verified Merchant Identity / Curated Heuristics
  // -------------------------------------------------------------
  const combinedText = `${textToAnalyze} ${narration}`.toLowerCase();
  for (const verified of VERIFIED_MERCHANTS) {
    for (const pattern of verified.aliases) {
      if (pattern.test(combinedText)) {
        // Find corresponding category in user's categories
        const matchedCategory = categories.find(
          (c) => c.type === 'expense' && (
            c.name.toLowerCase() === verified.categoryName.toLowerCase() ||
            c.name.toLowerCase().includes(verified.categoryName.toLowerCase()) ||
            verified.categoryName.toLowerCase().includes(c.name.toLowerCase())
          )
        );

        if (matchedCategory) {
          return {
            categoryId: matchedCategory.id,
            categoryName: matchedCategory.name,
            necessity: verified.defaultNecessity,
            confidence: 0.95,
            layer: 2,
            method: 'verified_merchant',
            evidence: [
              {
                source: 'Verified Merchant Directory',
                detail: `Recognized entity matching ${matchedCategory.name} (${verified.defaultNecessity})`,
              },
            ],
          };
        }
      }
    }
  }

  // -------------------------------------------------------------
  // LAYER 3: Weak Supervision / ML Suggestion
  // -------------------------------------------------------------
  const mlSuggestion = suggestCategory(narration, categories, 'expense');
  if (mlSuggestion && mlSuggestion.confidence >= 0.65) {
    return {
      categoryId: mlSuggestion.category.id,
      categoryName: mlSuggestion.category.name,
      necessity: null,
      confidence: mlSuggestion.confidence,
      layer: 3,
      method: 'weak_supervision',
      evidence: mlSuggestion.evidence.map((e) => ({ source: e.source, detail: e.detail })),
    };
  }

  // -------------------------------------------------------------
  // LAYER 4: Uncertainty Handling / Safe Fallback to Uncategorized
  // -------------------------------------------------------------
  return {
    categoryId: null,
    categoryName: 'Uncategorized',
    necessity: null,
    confidence: 0,
    layer: 4,
    method: 'uncategorized',
    evidence: [],
  };
}
