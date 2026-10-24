/**
 * Core currency and date formatting utilities for Arth.
 * Adheres strictly to ANTIGRAVITY.md (Rule 5: amounts in paise)
 * and ARTH_DESIGN_SYSTEM.md Section 3.2 (Indian lakh/crore notation).
 */

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Converts integer paise into formatted INR currency string.
 * Example: 145000 -> "₹1,450.00"
 */
export function formatPaiseToINR(paise: number | bigint): string {
  const rupees = Number(paise) / 100;
  return inrFormatter.format(rupees);
}
