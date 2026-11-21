/**
 * UPI Intelligence and Counterparty Extraction Engine
 * Parses Indian banking narrations, extracts clean counterparty / merchant names,
 * detects payment method ('upi' | 'online' | 'cash'), strips banking disclaimers,
 * GST numbers, URLs, and masks sensitive identifiers.
 */

import type { PaymentMethod } from '@arth/contracts';

export interface CounterpartyExtractionResult {
  cleanName: string;
  paymentMethod: PaymentMethod;
  rawNarration: string;
  isUpi: boolean;
  merchantKey: string;
  vpa?: string;
  reference?: string;
}

// Common generic prefixes/words to ignore when seeking a merchant name
const GENERIC_SEGMENTS = new Set([
  'UPI', 'DR', 'CR', 'P2P', 'P2M', 'P2A', 'QR', 'COLLECT', 'INTENT', 'REV',
  'PAYMENT', 'TRANSFER', 'TRF', 'BILL', 'BILLDESK', 'PAYTM', 'GPAY', 'PHONEPE',
  'IMPS', 'NEFT', 'RTGS', 'POS', 'ECOM', 'NACH', 'ACH', 'CMS', 'INB', 'MB'
]);

const PRESERVED_ACRONYMS = new Set([
  'HDFC', 'ICICI', 'SBI', 'PNB', 'AXIS', 'KOTAK', 'ATM', 'POS', 'UPI', 'NEFT', 'IMPS', 'IIT', 'IIM', 'AI', 'RS', 'INR', 'USD'
]);

/**
 * Converts ALL CAPS or all lower strings into clean Title Case while preserving
 * standard acronyms (e.g. "R S Dairy", "HDFC Bank", "IIT", "AI").
 */
export function toCleanTitleCase(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';

  const words = trimmed.split(/\s+/);
  return words
    .map((word) => {
      const upper = word.toUpperCase();
      if (PRESERVED_ACRONYMS.has(upper)) {
        return upper;
      }
      // Single letter uppercase (e.g. "R", "S")
      if (/^[A-Za-z]$/.test(word)) {
        return word.toUpperCase();
      }
      // Mixed case with internal caps like "McDonalds" or "iPhone"
      if (/[a-z]/.test(word) && /[A-Z]/.test(word.slice(1))) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * Normalizes a merchant name into a stable key for lookup/rules (lowercase, no special chars, single space)
 */
export function normalizeMerchantKey(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts counterparty name, payment method, and cleaned description from raw banking narration.
 */
export function extractCounterpartyAndPaymentMethod(
  rawNarration: string,
  type: 'income' | 'expense' = 'expense'
): CounterpartyExtractionResult {
  const raw = (rawNarration || '').trim();
  if (!raw) {
    return {
      cleanName: 'Uncategorized',
      paymentMethod: 'online',
      rawNarration: '',
      isUpi: false,
      merchantKey: '',
    };
  }

  // 1. Remove trailing disclaimer/footer text, URLs, GST numbers, phone numbers, and masked account/card digits
  let cleaned = raw
    // Bank footer/disclaimer text that may have slipped into narration
    .replace(/\b(?:closing\s*bal(?:ance)?\s*includes|funds?\s*(?:on\s*hold|held)|unclear(?:ed)?\s*funds?|registered\s*office|corporate\s*office|branch\s*(?:address|phone|email)).*$/i, '')
    // URLs
    .replace(/https?:\/\/[^\s]+|www\.[^\s]+/gi, '')
    // GST Numbers (15 alphanumeric characters)
    .replace(/\b\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}\b/gi, '')
    // Masked identifiers like 4123********1234, ********, or XXXXXXXX1234 (no \b anchor so non-word boundary like -*** matches)
    .replace(/\d*[\*xX]{3,}\d*/g, '')
    // Bank standard disclaimers
    .replace(/\b(?:Txn Ref|Ref No|Reference No|UTR|URN|RRN|Chq No|Cheque No)[:\s]*[A-Za-z0-9]+/gi, '')
    // Trailing time stamps like 14:30 or 14:30:22
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, '')
    // Clean multiple slashes / dashes / spaces
    .replace(/[-_]{2,}/g, '-')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // 2. Identify Payment Method
  const upperRaw = raw.toUpperCase();
  const isUpi = /\bUPI\b|UPI[-/_]/.test(upperRaw);
  const isCash = /\b(?:ATM|CASH WDL|CWDR|CASH WITHDRAWAL|ATM WDL|SELF WDL)\b/.test(upperRaw);

  const paymentMethod: PaymentMethod = isUpi ? 'upi' : (isCash ? 'cash' : 'online');

  let extractedName = '';
  let vpaFound: string | undefined;
  let refFound: string | undefined;

  // 3. Extract VPA (e.g., username@bank, merchant.pay@okaxis) if present
  const vpaMatch = raw.match(/([a-zA-Z0-9.\-_]{2,}@[a-zA-Z0-9.\-_]{2,})/);
  if (vpaMatch) {
    vpaFound = vpaMatch[1];
  }

  // 4. Extract 12-digit RRN / UPI Reference if present
  const rrnMatch = raw.match(/\b(\d{12})\b/);
  if (rrnMatch) {
    refFound = rrnMatch[1];
  }

  if (isUpi) {
    // Parse UPI components typically separated by '-' or '/'
    // E.g.: UPI-R S DAIRY-9876543210@paytm-UPI-123456789012-PAYMENT
    // E.g.: UPI-AUNTY KE SPECIAL SAM-********-9876
    // E.g.: UPI/DR/432198765432/HARSHIT YADAV/PYTM/harshit@paytm/Payment
    // E.g.: UPI/P2M/329871029381/STARBUCKS COFFEE/HDFC/starbucks@hdfc
    const segments = cleaned
      .split(/[\/\-–—|]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    // Look for the best merchant candidate among segments
    const candidates = segments.filter((seg) => {
      const up = seg.toUpperCase();
      // Skip generic tokens
      if (GENERIC_SEGMENTS.has(up)) return false;
      // Skip pure digits (transaction references, phone numbers, RRNs)
      if (/^\d+$/.test(seg)) return false;
      // Skip dates like 21112026 or 21-11-2026
      if (/^\d{2}[-/.]?\d{2}[-/.]?\d{2,4}$/.test(seg)) return false;
      // Skip VPAs (we handle VPA fallback separately)
      if (seg.includes('@')) return false;
      // Must contain at least one letter
      if (!/[A-Za-z]/.test(seg)) return false;
      // Must not be masked identifiers or asterisks
      if (/[\*xX]{2,}/.test(seg)) return false;
      // Skip disclaimer text
      if (/(?:closing\s*bal|funds?\s*(?:on\s*hold|held)|unclear|gstin|regd|office|branch|disclaimer|http|www\.)/i.test(seg)) return false;
      // Must not be a short bank code (e.g. HDFC, ICIC, SBIN, UTIB)
      if (/^(?:HDFC|ICIC|SBIN|UTIB|KKBK|PUNB|CNRB|YESB|BARB|MAHB|IDIB|UBIN)$/i.test(seg)) return false;
      return true;
    });

    if (candidates.length > 0) {
      // The first informative segment after UPI/prefix is almost always the merchant / person
      extractedName = candidates[0];
    } else if (vpaFound) {
      // Derive name from VPA prefix (e.g. "rsdairy@paytm" -> "Rsdairy")
      const vpaPrefix = vpaFound.split('@')[0]
        .replace(/[._\-]+/g, ' ')
        .replace(/\d+$/, '') // strip trailing phone numbers if attached
        .trim();
      if (vpaPrefix.length >= 2) {
        extractedName = vpaPrefix;
      }
    }
  } else if (isCash) {
    extractedName = 'Cash Withdrawal / ATM';
  } else {
    // POS / Card / NEFT / IMPS / NetBanking / Utility Bills
    // Match POS: "POS 4123********1234 STARBUCKS CAFE MUMBAI IN"
    const posMatch = cleaned.match(/\bPOS\b\s+(?:[\*xX\d]+\s+)?([A-Za-z0-9\s]+?)(?:\s+(?:IN|MUMBAI|DELHI|BANGALORE|HYDERABAD|CHENNAI|PUNE|KOLKATA))?$/i);
    if (posMatch && posMatch[1].trim()) {
      extractedName = posMatch[1].trim();
    } else {
      // Match NEFT / IMPS / NetBanking
      const neftMatch = cleaned.match(/(?:NEFT|IMPS)[-/](?:CR|DR|P2A)?[-/]?([A-Za-z0-9]+)?[-/]([A-Za-z\s]+)/i);
      if (neftMatch && neftMatch[2]?.trim()) {
        extractedName = neftMatch[2].trim();
      } else {
        // Strip out banking transaction codes at start
        let fallback = cleaned
          .replace(/^(?:ACH|BIL|INF|INB|MB|OB|FT|TRF|TRANSFER|RTGS|NEFT|IMPS)[\/\-\s]+/i, '')
          .replace(/^(?:CR|DR|DEP|WDL|ONL|SALARY|INTEREST)[\/\-\s]+/i, '')
          .trim();

        // If fallback has segments separated by slashes or dashes, pick the most readable segment
        const parts = fallback.split(/[\/\-|]/).map((p) => p.trim()).filter((p) => p.length > 0);
        const namePart = parts.find((p) => /[A-Za-z]{3,}/.test(p) && !/^\d+$/.test(p) && !GENERIC_SEGMENTS.has(p.toUpperCase()));
        extractedName = namePart || parts[0] || raw;
      }
    }
  }

  // Fallback if still empty
  if (!extractedName || extractedName.trim().length === 0) {
    extractedName = raw.slice(0, 40).trim();
  }

  // Clean trailing bank location tags like " MUMBAI IN", " IN", etc.
  extractedName = extractedName
    .replace(/\s+(?:IN|IND)$/i, '')
    .replace(/^[-_\s.,/]+|[-_\s.,/]+$/g, '')
    .trim();

  const cleanName = toCleanTitleCase(extractedName) || 'Uncategorized Transaction';
  const merchantKey = normalizeMerchantKey(cleanName);

  return {
    cleanName,
    paymentMethod,
    rawNarration: raw,
    isUpi,
    merchantKey,
    vpa: vpaFound,
    reference: refFound,
  };
}
