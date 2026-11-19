export type ExtractedTaxCandidate = {
  key: string;
  value: string;
  page: number;
  location: string;
  confidence: number;
  formSection?: string;
  crossCheckWarning?: string;
};

export type DocumentExtractionMethod = 'text_pdf' | 'ocr_local' | 'spreadsheet' | 'manual';

export interface FormFieldPattern {
  key: string;
  labels: string[];
  confidence: number;
  formSection?: string;
}

export interface FormAdapter {
  id: string;
  name: string;
  supportedKinds: string[];
  patterns: FormFieldPattern[];
  crossChecks?: (extracted: Map<string, string>) => Array<{ key: string; warning: string }>;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function maskIdentifiers(value: string): string {
  return (value || '')
    .replace(/\b[A-Z]{5}\d{4}[A-Z]\b/gi, '[MASKED_PAN]')
    .replace(/\b[A-Z]{4}\d{5}[A-Z]\b/gi, '[MASKED_TAN]')
    .replace(/\b\d{10,18}\b/g, '[MASKED_IDENTIFIER]')
    .replace(/\s+/g, ' ')
    .trim();
}

export const CORE_PATTERNS: FormFieldPattern[] = [
  {
    key: 'salary.gross',
    labels: [
      'gross salary',
      'gross amount of salary',
      'salary as per provisions contained in section 17',
      'salary as per section 17',
      'gross earnings',
      'gross pay',
      'salary before exemptions',
      'total gross salary',
    ],
    confidence: 0.79,
    formSection: 'Salary under section 17',
  },
  {
    key: 'salary.exemptions',
    labels: [
      'exempt allowances',
      'exemptions under section 10',
      'salary exempt under section 10',
      'allowances to the extent exempt under section 10',
      'total exemption under section 10',
    ],
    confidence: 0.70,
    formSection: 'Exemptions under section 10',
  },
  {
    key: 'salary.standard_deduction',
    labels: [
      'standard deduction',
      'deduction under section 16(ia)',
      'standard deduction under section 16(ia)',
      'deduction u/s 16(ia)',
    ],
    confidence: 0.76,
    formSection: 'Deduction under section 16',
  },
  {
    key: 'salary.taxable',
    labels: [
      'income chargeable under the head salaries',
      'taxable salary',
      'income from salary',
      'total taxable salary',
    ],
    confidence: 0.74,
    formSection: 'Chargeable Salary',
  },
  {
    key: 'tax.tds',
    labels: [
      'total tax deducted',
      'total tds',
      'tax deducted at source',
      'tax deducted by employer',
      'total tax deposited',
      'tds/tcs credit',
      'amount of tax deducted',
    ],
    confidence: 0.78,
    formSection: 'TDS Summary',
  },
  {
    key: 'tax.total_liability',
    labels: [
      'total tax payable',
      'tax payable after rebate',
      'net tax payable',
      'tax on total income',
    ],
    confidence: 0.68,
    formSection: 'Tax Computation',
  },
  {
    key: 'income.interest',
    labels: [
      'interest income',
      'income from interest',
      'interest from deposits',
      'interest from savings bank',
      'gross interest paid',
      'total interest credited',
    ],
    confidence: 0.64,
    formSection: 'Interest Income',
  },
  {
    key: 'deduction.section_80c',
    labels: [
      'deduction under section 80c',
      'deductions under schedule xv',
      'deduction under section 123',
      'qualifying amount under schedule xv',
      'section 80c',
      'epf employee contribution',
      'ppf deposit',
      'life insurance premium',
      'elss statement',
      'principal repaid',
      'housing loan principal',
      'repayment of housing loan',
    ],
    confidence: 0.72,
    formSection: 'Section 80C / Schedule XV',
  },
  {
    key: 'deduction.section_80d',
    labels: [
      'deduction under section 80d',
      'health insurance deduction',
      'health insurance premium',
      'medical insurance premium',
      'section 80d',
    ],
    confidence: 0.72,
    formSection: 'Section 80D / Section 126',
  },
  {
    key: 'deduction.section_80ccd_1b',
    labels: [
      'deduction under section 80ccd(1b)',
      'additional nps deduction',
      'section 80ccd(1b)',
      'nps tier 1 contribution',
    ],
    confidence: 0.68,
    formSection: 'Section 80CCD(1B)',
  },
  {
    key: 'deduction.employer_nps',
    labels: [
      'employer contribution to nps',
      'employer contribution under section 80ccd(2)',
      'employer contribution under section 124',
      'section 80ccd(2)',
    ],
    confidence: 0.70,
    formSection: 'Section 80CCD(2)',
  },
  {
    key: 'deduction.home_loan_interest',
    labels: [
      'interest payable on borrowed capital',
      'deduction under section 24(b)',
      'deduction under section 22',
      'interest on borrowed capital under section 24(b)',
      'interest on housing loan',
    ],
    confidence: 0.66,
    formSection: 'Section 24(b) / Section 22',
  },
  {
    key: 'deduction.education_loan_interest',
    labels: [
      'deduction under section 80e',
      'interest on education loan',
      'interest paid on higher education loan',
      'section 80e',
    ],
    confidence: 0.66,
    formSection: 'Section 80E / Section 129',
  },
  {
    key: 'deduction.donations',
    labels: [
      'deduction under section 80g',
      'eligible donation amount',
      'donation under section 80g',
      'section 80g',
    ],
    confidence: 0.66,
    formSection: 'Section 80G / Section 127',
  },
  {
    key: 'deduction.savings_interest',
    labels: [
      'deduction under section 80tta',
      'deduction under section 80ttb',
      'savings interest deduction',
      'section 80tta',
      'section 80ttb',
    ],
    confidence: 0.64,
    formSection: 'Section 80TTA / 80TTB',
  },
];

export const FORM_ADAPTERS: FormAdapter[] = [
  {
    id: 'form16',
    name: 'Form 16 Salary Certificate',
    supportedKinds: ['form16', 'form130'],
    patterns: CORE_PATTERNS.filter((p) => p.key.startsWith('salary.') || p.key.startsWith('tax.') || p.key.startsWith('deduction.')),
    crossChecks: (extracted) => {
      const warnings: Array<{ key: string; warning: string }> = [];
      const gross = extracted.get('salary.gross');
      const taxable = extracted.get('salary.taxable');
      if (gross && taxable) {
        try {
          if (BigInt(taxable) > BigInt(gross)) {
            warnings.push({
              key: 'salary.taxable',
              warning: 'Taxable salary exceeds gross salary; check extracted exemptions and deductions.',
            });
          }
        } catch { /* Ignore arithmetic validation on invalid numbers */ }
      }
      return warnings;
    },
  },
  {
    id: 'form16a',
    name: 'Form 16A Non-Salary TDS',
    supportedKinds: ['form16a', 'form131'],
    patterns: CORE_PATTERNS.filter((p) => p.key === 'tax.tds' || p.key === 'income.interest'),
  },
  {
    id: 'statement',
    name: 'Annual Information / Tax Statement (26AS/AIS/TIS)',
    supportedKinds: ['form26as', 'ais', 'tis'],
    patterns: CORE_PATTERNS.filter((p) => p.key === 'tax.tds' || p.key === 'income.interest' || p.key === 'deduction.section_80c'),
  },
  {
    id: 'payslip',
    name: 'Salary Payslip',
    supportedKinds: ['payslip', 'salary_slip'],
    patterns: CORE_PATTERNS.filter((p) => p.key.startsWith('salary.') || p.key === 'tax.tds' || p.key === 'deduction.section_80c'),
  },
  {
    id: 'investment_80c',
    name: '80C Investment / Deposit Receipt',
    supportedKinds: ['ppf', 'epf', 'elss', 'life_insurance', 'sukanya', 'investment_80c'],
    patterns: CORE_PATTERNS.filter((p) => p.key === 'deduction.section_80c'),
  },
  {
    id: 'health_insurance',
    name: 'Health Insurance Premium Receipt (80D)',
    supportedKinds: ['health_insurance', 'mediclaim', '80d'],
    patterns: CORE_PATTERNS.filter((p) => p.key === 'deduction.section_80d'),
  },
  {
    id: 'home_loan',
    name: 'Home Loan Interest & Principal Certificate',
    supportedKinds: ['home_loan', 'housing_loan', '24b'],
    patterns: CORE_PATTERNS.filter((p) => p.key === 'deduction.home_loan_interest' || p.key === 'deduction.section_80c'),
    crossChecks: (extracted) => {
      const warnings: Array<{ key: string; warning: string }> = [];
      const interest = extracted.get('deduction.home_loan_interest');
      if (interest) {
        try {
          if (BigInt(interest) > 500000000n) { // > ₹50,00,000 (annual home loan interest outlier)
            warnings.push({
              key: 'deduction.home_loan_interest',
              warning: 'Home loan interest appears unusually high (> ₹50L/year); please verify.',
            });
          }
        } catch { /* Ignore arithmetic validation on invalid numbers */ }
      }
      return warnings;
    },
  },
  {
    id: 'education_loan',
    name: 'Education Loan Interest Certificate (80E)',
    supportedKinds: ['education_loan', '80e'],
    patterns: CORE_PATTERNS.filter((p) => p.key === 'deduction.education_loan_interest'),
  },
  {
    id: 'nps',
    name: 'NPS Statement (80CCD)',
    supportedKinds: ['nps', '80ccd', 'tier1'],
    patterns: CORE_PATTERNS.filter((p) => p.key === 'deduction.section_80ccd_1b' || p.key === 'deduction.employer_nps'),
  },
  {
    id: 'donations',
    name: 'Donation Receipt (80G)',
    supportedKinds: ['donation', 'section_80g', '80g'],
    patterns: CORE_PATTERNS.filter((p) => p.key === 'deduction.donations'),
  },
];

export function detectTaxFieldCandidates(
  text: string,
  method: DocumentExtractionMethod,
  declaredKind?: string,
): ExtractedTaxCandidate[] {
  const found: ExtractedTaxCandidate[] = [];
  const pages = text.split(/\[PAGE (\d+)\]/g);
  let page = 1;

  for (let index = 0; index < pages.length; index++) {
    if (index % 2 === 1) {
      page = Number(pages[index]) || 1;
      continue;
    }
    const rawContent = pages[index];
    const content = rawContent
      .replace(/\b[A-Z]{5}\d{4}[A-Z]\b/gi, ' [MASKED_PAN] ')
      .replace(/\b\d{10,18}\b/g, ' [MASKED_IDENTIFIER] ');

    for (const pattern of CORE_PATTERNS) {
      if (found.some((field) => field.key === pattern.key)) continue;

      const labelPattern = [...pattern.labels]
        .sort((a, b) => b.length - a.length)
        .map(escapeRegex)
        .join('|');
      const match = new RegExp(
        `(?:${labelPattern})(?:\\s*(?:under\\s+section|u\\/s|section)\\s*\\d+[a-z0-9()]*)?[^\\d\\n]{0,50}([0-9][0-9,]{0,14})`,
        'i'
      ).exec(content);
      const amount = match?.[1]?.replace(/,/g, '');

      if (match && amount && /^\d{1,15}$/.test(amount)) {
        const confidence =
          method === 'text_pdf'
            ? pattern.confidence
            : method === 'ocr_local'
              ? Math.min(0.52, pattern.confidence)
              : Math.min(0.68, pattern.confidence);

        found.push({
          key: pattern.key,
          value: amount,
          page,
          location: maskIdentifiers(`${pattern.labels[0]}: ${match[0].slice(0, 100)}`),
          confidence,
          formSection: pattern.formSection,
        });
      }
    }
  }

  // Run form-specific cross checks if a matching adapter exists
  const activeAdapter = declaredKind
    ? FORM_ADAPTERS.find((a) => a.supportedKinds.includes(declaredKind))
    : FORM_ADAPTERS.find((a) => a.id === 'form16');

  if (activeAdapter?.crossChecks) {
    const valueMap = new Map(found.map((candidate) => [candidate.key, candidate.value]));
    const warnings = activeAdapter.crossChecks(valueMap);
    for (const { key, warning } of warnings) {
      const target = found.find((candidate) => candidate.key === key);
      if (target) {
        target.crossCheckWarning = warning;
        target.confidence = Math.max(0.2, Number((target.confidence * 0.8).toFixed(2)));
      }
    }
  }

  return found;
}
