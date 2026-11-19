export type LedgerCreditHint = 'possible_salary' | 'possible_interest' | 'possible_refund' | 'possible_transfer' | 'review';

/** Derive tax-year ledger bounds without applying a tax classification to transactions. */
export function taxYearDateRange(ruleset: string): { start: string; end: string } | null {
  if (!/^(?:AY|TY)20\d{2}-\d{2}$/.test(ruleset)) return null;
  const year = Number(ruleset.slice(2, 6)) - (ruleset.startsWith('AY') ? 1 : 0);
  return { start: `${year}-04-01`, end: `${year + 1}-03-31` };
}

/** Narration is only a review hint; the return value never indicates taxable income. */
export function hintLedgerCredit(description: string | null): LedgerCreditHint {
  const text = description || '';
  if (/\brefund|reversal|cashback\b/i.test(text)) return 'possible_refund';
  if (/\bself transfer|own account|transfer to own\b/i.test(text)) return 'possible_transfer';
  if (/\binterest|int\s*paid\b/i.test(text)) return 'possible_interest';
  if (/\bsalary|payroll|wages\b/i.test(text)) return 'possible_salary';
  return 'review';
}

/** Redact PAN and long account/reference digit strings before the tax review stores or displays narration. */
export function safeLedgerDescription(value: string | null): string {
  return (value || '').replace(/[A-Z]{5}\d{4}[A-Z]/gi, '[PAN]')
    .replace(/\b\d{10,18}\b/g, '[account/reference]').replace(/\s+/g, ' ').slice(0, 180);
}
