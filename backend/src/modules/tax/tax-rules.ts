export interface TaxSlab { upperRupees: bigint | null; ratePercent: bigint }
export interface TaxRuleset {
  id: string;
  framework: 'income_tax_act_1961' | 'income_tax_act_2025';
  period: string;
  effectiveFrom: string;
  verifiedOn: string;
  sources: string[];
  oldSlabsByAge: { general: TaxSlab[]; senior: TaxSlab[]; superSenior: TaxSlab[] };
  newSlabs: TaxSlab[];
  oldStandardDeductionRupees: bigint;
  newStandardDeductionRupees: bigint;
  oldRebate: { thresholdRupees: bigint; maxRupees: bigint };
  newRebate: { thresholdRupees: bigint; maxRupees: bigint; marginalRelief: boolean };
  section123LimitRupees: bigint;
}

const lakh = (value: number) => {
  const text = String(value);
  const [whole, fraction = ''] = text.split('.');
  if (!/^\d+$/.test(whole) || !/^\d*$/.test(fraction) || fraction.length > 1) throw new Error('Tax slab must use whole or half lakh thresholds.');
  return BigInt(whole) * 100_000n + (fraction === '5' ? 50_000n : 0n);
};
const slab = (upper: number | null, rate: number): TaxSlab => ({ upperRupees: upper === null ? null : lakh(upper), ratePercent: BigInt(rate) });

const oldIndividual = {
  general: [slab(2.5, 0), slab(5, 5), slab(10, 20), slab(null, 30)],
  senior: [slab(3, 0), slab(5, 5), slab(10, 20), slab(null, 30)],
  superSenior: [slab(5, 0), slab(10, 20), slab(null, 30)],
};

const oldRates = (period: string, framework: TaxRuleset['framework'], newSlabs: TaxSlab[], newRebateThreshold: number, newRebateMax: number, stdNew: number, sources: string[]): TaxRuleset => ({
  id: `${framework === 'income_tax_act_1961' ? 'ita1961' : 'ita2025'}-${period.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-v1`,
  framework, period, effectiveFrom: period.startsWith('AY') ? `${Number(period.slice(2, 6)) - 1}-04-01` : `${period.slice(2, 6)}-04-01`, verifiedOn: '2026-11-09',
  sources,
  oldSlabsByAge: oldIndividual,
  newSlabs,
  oldStandardDeductionRupees: 50_000n,
  newStandardDeductionRupees: BigInt(stdNew),
  oldRebate: { thresholdRupees: 500_000n, maxRupees: 12_500n },
  newRebate: { thresholdRupees: BigInt(newRebateThreshold), maxRupees: BigInt(newRebateMax), marginalRelief: true },
  section123LimitRupees: 150_000n,
});

export const TAX_RULESETS: Record<string, TaxRuleset> = {
  'AY2024-25': oldRates('AY2024-25', 'income_tax_act_1961', [slab(3, 0), slab(6, 5), slab(9, 10), slab(12, 15), slab(15, 20), slab(null, 30)], 700_000, 25_000, 50_000, ['https://incometaxindia.gov.in/Documents/Act/Finance-Act-2023.pdf', 'https://incometaxindia.gov.in/communications/circular/circular-1-2024.pdf']),
  'AY2025-26': oldRates('AY2025-26', 'income_tax_act_1961', [slab(3, 0), slab(7, 5), slab(10, 10), slab(12, 15), slab(15, 20), slab(null, 30)], 700_000, 25_000, 75_000, ['https://incometaxindia.gov.in/Documents/Act/Finance-Act-2024.pdf']),
  'AY2026-27': oldRates('AY2026-27', 'income_tax_act_1961', [slab(4, 0), slab(8, 5), slab(12, 10), slab(16, 15), slab(20, 20), slab(24, 25), slab(null, 30)], 1_200_000, 60_000, 75_000, ['https://incometaxindia.gov.in/Documents/Act/Finance-Act-2025.pdf', 'https://incometaxindia.gov.in/Documents/Budget/budget-2025/faqs-budget-2025.pdf']),
  'TY2026-27': oldRates('TY2026-27', 'income_tax_act_2025', [slab(4, 0), slab(8, 5), slab(12, 10), slab(16, 15), slab(20, 20), slab(24, 25), slab(null, 30)], 1_200_000, 60_000, 75_000, ['https://www.incometaxindia.gov.in/documents/d/guest/income_tax_act_2025_as_amended_by_fa_act_2026-pdf', 'https://www.incometaxindia.gov.in/documents/d/guest/finance-act-2026-pdf-1']),
};
