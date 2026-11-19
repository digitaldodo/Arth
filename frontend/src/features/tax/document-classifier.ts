export type TaxDocumentKind = 'form16' | 'form16a' | 'form130' | 'form131' | 'form26as' | 'ais' | 'tis' | 'payslip' | 'investment_declaration' | 'epf' | 'ppf' | 'life_insurance' | 'elss' | 'nps' | 'health_insurance' | 'home_loan_interest' | 'rent_receipt' | 'rental_agreement' | 'tuition_fee' | 'education_loan_interest' | 'donation_receipt' | 'fd_interest' | 'savings_interest' | 'capital_gains' | 'investment_statement' | 'bank_statement' | 'other_tax_document';

export interface DocumentClassificationSuggestion {
  documentType: TaxDocumentKind | null;
  typeConfidence: number;
  taxPeriod: string | null;
  periodCandidates: string[];
  issuer: string | null;
}

const TYPE_MARKERS: Array<{ kind: TaxDocumentKind; markers: string[] }> = [
  { kind: 'form16a', markers: ['form 16a', 'form no. 16a'] },
  { kind: 'form131', markers: ['form 131', 'form no. 131'] },
  { kind: 'form130', markers: ['form 130', 'form no. 130'] },
  { kind: 'form16', markers: ['form 16', 'form no. 16', 'certificate under section 203'] },
  { kind: 'form26as', markers: ['form 26as', 'tax credit statement'] },
  { kind: 'ais', markers: ['annual information statement', 'income tax ais'] },
  { kind: 'tis', markers: ['taxpayer information summary', 'tax information summary'] },
  { kind: 'investment_declaration', markers: ['investment declaration', 'proof of investments'] },
  { kind: 'payslip', markers: ['salary slip', 'pay slip', 'payslip', 'pay advice'] },
  { kind: 'home_loan_interest', markers: ['home loan interest certificate', 'interest certificate for housing loan'] },
  { kind: 'education_loan_interest', markers: ['education loan interest certificate', 'interest certificate for education loan'] },
  { kind: 'rental_agreement', markers: ['rental agreement', 'lease agreement'] },
  { kind: 'rent_receipt', markers: ['rent receipt', 'rent paid receipt'] },
  { kind: 'health_insurance', markers: ['health insurance premium receipt', 'medical insurance premium receipt'] },
  { kind: 'life_insurance', markers: ['life insurance premium receipt', 'life insurance premium statement'] },
  { kind: 'donation_receipt', markers: ['donation receipt', 'receipt for donation'] },
  { kind: 'tuition_fee', markers: ['tuition fee receipt', 'school fee receipt'] },
  { kind: 'capital_gains', markers: ['capital gains statement', 'capital gain statement'] },
  { kind: 'savings_interest', markers: ['savings account interest certificate', 'savings interest certificate'] },
  { kind: 'fd_interest', markers: ['fixed deposit interest certificate', 'term deposit interest certificate'] },
  { kind: 'investment_statement', markers: ['investment statement', 'consolidated account statement'] },
  { kind: 'nps', markers: ['national pension system', 'nps transaction statement'] },
  { kind: 'epf', markers: ['employees provident fund', 'epf passbook', 'provident fund passbook'] },
  { kind: 'ppf', markers: ['public provident fund', 'ppf account statement'] },
  { kind: 'elss', markers: ['equity linked savings scheme', 'elss statement'] },
  { kind: 'bank_statement', markers: ['bank statement', 'statement of account', 'account statement'] },
];

const ISSUERS = [
  'Income Tax Department', 'Central Board of Direct Taxes', 'Employees Provident Fund Organisation',
  'National Pension System', 'Life Insurance Corporation of India', 'HDFC Bank', 'ICICI Bank',
  'State Bank of India', 'Axis Bank', 'Kotak Mahindra Bank', 'Punjab National Bank', 'Bank of Baroda',
  'Canara Bank', 'IDFC FIRST Bank',
];

function normalize(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

function findPeriods(text: string): string[] {
  const candidates = new Set<string>();
  const patterns: Array<{ regex: RegExp; kind: 'AY' | 'TY' | 'FY' }> = [
    { regex: /\b(?:assessment\s+year|ay)\s*[:#-]?\s*(20\d{2})\s*[-–/]\s*(\d{2}|20\d{2})\b/gi, kind: 'AY' },
    { regex: /\b(?:tax\s+year|ty)\s*[:#-]?\s*(20\d{2})\s*[-–/]\s*(\d{2}|20\d{2})\b/gi, kind: 'TY' },
    { regex: /\b(?:financial\s+year|fy)\s*[:#-]?\s*(20\d{2})\s*[-–/]\s*(\d{2}|20\d{2})\b/gi, kind: 'FY' },
  ];
  for (const { regex, kind } of patterns) {
    for (const match of text.matchAll(regex)) {
      const start = Number(match[1]);
      const end = match[2].length === 2 ? Math.floor(start / 100) * 100 + Number(match[2]) : Number(match[2]);
      if (end !== start + 1) continue;
      const year = kind === 'FY' ? 'AY' : kind;
      const normalizedStart = kind === 'FY' ? end : start;
      candidates.add(`${year}${normalizedStart}-${String(normalizedStart + 1).slice(-2)}`);
    }
  }
  return [...candidates];
}

/** Conservative document and period hints for a human review step; never establishes document truth. */
export function classifyTaxDocument(text: string, fileName = ''): DocumentClassificationSuggestion {
  const normalized = normalize(`${text.slice(0, 40_000)} ${fileName}`);
  const typeMatch = TYPE_MARKERS.find(({ markers }) => markers.some((marker) => normalized.includes(normalize(marker))));
  const periodCandidates = findPeriods(`${text.slice(0, 40_000)} ${fileName}`);
  const issuer = ISSUERS.find((name) => normalized.includes(normalize(name))) || null;
  return {
    documentType: typeMatch?.kind || null,
    typeConfidence: typeMatch ? 0.88 : 0,
    taxPeriod: periodCandidates.length === 1 ? periodCandidates[0] : null,
    periodCandidates,
    issuer,
  };
}
