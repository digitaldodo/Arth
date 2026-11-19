export type StatementBankId =
  | 'sbi'
  | 'hdfc'
  | 'icici'
  | 'axis'
  | 'kotak'
  | 'pnb'
  | 'bob'
  | 'canara'
  | 'idfc_first'
  | 'credit_card_generic'
  | 'generic';

export interface AdapterCapabilities {
  textPdf: boolean;
  scannedOcr: boolean;
  csv: boolean;
  xlsx: boolean;
  encryptedPdf: boolean;
}

export interface StatementFixtureManifest {
  id: string;
  description: string;
  format: 'pdf' | 'csv' | 'xlsx' | 'xls';
  accountType: 'bank' | 'credit_card';
  anonymized: boolean;
  expectedRows: number;
}

export interface StatementAdapter {
  id: StatementBankId;
  version: string;
  label: string;
  bank: string;
  product: string;
  accountType: 'bank' | 'credit_card';
  supportedFormats: Array<'pdf' | 'csv' | 'xlsx' | 'xls'>;
  markers: string[];
  dateHeaders: string[];
  descriptionHeaders: string[];
  debitHeaders: string[];
  creditHeaders: string[];
  referenceHeaders: string[];
  balanceHeaders: string[];
  capabilities: AdapterCapabilities;
  validation: 'fixture_verified' | 'synthetic_fixture' | 'unverified';
  knownLimitations: string[];
  fixtureManifest: StatementFixtureManifest[];
}

export const STATEMENT_ADAPTERS: StatementAdapter[] = [
  {
    id: 'sbi',
    version: '1.1.0',
    label: 'State Bank of India',
    bank: 'State Bank of India',
    product: 'Savings & Current Account',
    accountType: 'bank',
    supportedFormats: ['csv', 'xlsx', 'xls', 'pdf'],
    markers: ['sbi', 'state bank of india', 'onlinesbi'],
    dateHeaders: ['txn date', 'transaction date', 'value date'],
    descriptionHeaders: ['description', 'narration', 'particulars'],
    debitHeaders: ['debit', 'debit amount', 'withdrawal'],
    creditHeaders: ['credit', 'credit amount', 'deposit'],
    referenceHeaders: ['ref no', 'reference no', 'cheque no', 'chq no', 'ref no./cheque no.'],
    balanceHeaders: ['balance', 'running balance'],
    capabilities: { textPdf: true, scannedOcr: true, csv: true, xlsx: true, encryptedPdf: true },
    validation: 'synthetic_fixture',
    knownLimitations: ['Multi-line UPI references require narration line joining', 'Historical passbook printouts need manual mapping'],
    fixtureManifest: [
      { id: 'sbi-savings-csv', description: 'SBI Savings account CSV statement with UPI narrations and balance checks', format: 'csv', accountType: 'bank', anonymized: true, expectedRows: 4 },
    ],
  },
  {
    id: 'hdfc',
    version: '1.2.0',
    label: 'HDFC Bank',
    bank: 'HDFC Bank',
    product: 'Savings & Current Account',
    accountType: 'bank',
    supportedFormats: ['csv', 'xlsx', 'xls', 'pdf'],
    markers: ['hdfc', 'hdfc bank'],
    dateHeaders: ['date', 'transaction date', 'txn date'],
    descriptionHeaders: ['narration', 'description', 'transaction description'],
    debitHeaders: ['withdrawal amt', 'withdrawal amount', 'debit', 'withdrawal amt.'],
    creditHeaders: ['deposit amt', 'deposit amount', 'credit', 'deposit amt.'],
    referenceHeaders: ['chq ref no', 'chq no', 'ref no', 'utr', 'reference', 'chq./ref.no.'],
    balanceHeaders: ['closing balance', 'balance', 'closing bal'],
    capabilities: { textPdf: true, scannedOcr: true, csv: true, xlsx: true, encryptedPdf: true },
    validation: 'synthetic_fixture',
    knownLimitations: ['Value dates appear in adjacent lines in older netbanking downloads', 'Multi-page statements repeat table headers'],
    fixtureManifest: [
      { id: 'hdfc-savings-csv', description: 'HDFC Savings CSV statement with UTR numbers and multi-line narrations', format: 'csv', accountType: 'bank', anonymized: true, expectedRows: 4 },
      { id: 'hdfc-savings-table', description: 'HDFC Netbanking tabular statement with value dates and closing balance', format: 'pdf', accountType: 'bank', anonymized: true, expectedRows: 3 },
    ],
  },
  {
    id: 'icici',
    version: '1.1.0',
    label: 'ICICI Bank',
    bank: 'ICICI Bank',
    product: 'Savings & Current Account',
    accountType: 'bank',
    supportedFormats: ['csv', 'xlsx', 'xls', 'pdf'],
    markers: ['icici', 'icici bank'],
    dateHeaders: ['transaction date', 'value date', 'date'],
    descriptionHeaders: ['transaction remarks', 'transaction details', 'remarks', 'narration', 'particulars'],
    debitHeaders: ['withdrawal amount', 'withdrawal', 'debit', 'dr amount (inr)'],
    creditHeaders: ['deposit amount', 'deposit', 'credit', 'cr amount (inr)'],
    referenceHeaders: ['cheque number', 'reference number', 'ref no', 'chq/ref no'],
    balanceHeaders: ['balance', 'balance (inr)'],
    capabilities: { textPdf: true, scannedOcr: true, csv: true, xlsx: true, encryptedPdf: true },
    validation: 'synthetic_fixture',
    knownLimitations: ['Running balance column may have Cr/Dr suffixes needing sign normalization'],
    fixtureManifest: [
      { id: 'icici-savings-csv', description: 'ICICI bank transaction report with withdrawal/deposit columns', format: 'csv', accountType: 'bank', anonymized: true, expectedRows: 3 },
    ],
  },
  {
    id: 'axis',
    version: '1.1.0',
    label: 'Axis Bank',
    bank: 'Axis Bank',
    product: 'Savings & Current Account',
    accountType: 'bank',
    supportedFormats: ['csv', 'xlsx', 'xls', 'pdf'],
    markers: ['axis', 'axis bank'],
    dateHeaders: ['tran date', 'transaction date', 'date'],
    descriptionHeaders: ['particulars', 'description', 'narration'],
    debitHeaders: ['debit', 'withdrawal', 'dr'],
    creditHeaders: ['credit', 'deposit', 'cr'],
    referenceHeaders: ['chq no', 'cheque no', 'utr', 'ref no'],
    balanceHeaders: ['balance', 'net balance'],
    capabilities: { textPdf: true, scannedOcr: true, csv: true, xlsx: true, encryptedPdf: true },
    validation: 'synthetic_fixture',
    knownLimitations: ['Short dates may use 2-digit years requiring millenium normalization'],
    fixtureManifest: [
      { id: 'axis-savings-csv', description: 'Axis Bank statement CSV with particulars and transaction dates', format: 'csv', accountType: 'bank', anonymized: true, expectedRows: 3 },
    ],
  },
  {
    id: 'kotak',
    version: '1.1.0',
    label: 'Kotak Mahindra Bank',
    bank: 'Kotak Mahindra Bank',
    product: 'Savings & Current Account',
    accountType: 'bank',
    supportedFormats: ['csv', 'xlsx', 'xls', 'pdf'],
    markers: ['kotak', 'kotak mahindra', 'kotak bank'],
    dateHeaders: ['date', 'transaction date'],
    descriptionHeaders: ['description', 'narration', 'transaction details'],
    debitHeaders: ['withdrawal dr', 'withdrawal', 'debit', 'dr amount'],
    creditHeaders: ['deposit cr', 'deposit', 'credit', 'cr amount'],
    referenceHeaders: ['chq ref no', 'reference no', 'ref no'],
    balanceHeaders: ['balance', 'account balance'],
    capabilities: { textPdf: true, scannedOcr: true, csv: true, xlsx: true, encryptedPdf: true },
    validation: 'synthetic_fixture',
    knownLimitations: ['Withdrawal/deposit headers frequently include (Dr) and (Cr) notation'],
    fixtureManifest: [
      { id: 'kotak-savings-csv', description: 'Kotak statement CSV with withdrawal/deposit indicators', format: 'csv', accountType: 'bank', anonymized: true, expectedRows: 3 },
    ],
  },
  {
    id: 'pnb',
    version: '1.1.0',
    label: 'Punjab National Bank',
    bank: 'Punjab National Bank',
    product: 'Savings & Current Account',
    accountType: 'bank',
    supportedFormats: ['csv', 'xlsx', 'xls', 'pdf'],
    markers: ['pnb', 'punjab national bank'],
    dateHeaders: ['transaction date', 'txn date', 'date'],
    descriptionHeaders: ['description', 'narration', 'particulars'],
    debitHeaders: ['withdrawals', 'debit', 'withdrawal'],
    creditHeaders: ['deposits', 'credit', 'deposit'],
    referenceHeaders: ['cheque number', 'reference no', 'utr', 'ref no'],
    balanceHeaders: ['balance', 'running balance'],
    capabilities: { textPdf: true, scannedOcr: true, csv: true, xlsx: true, encryptedPdf: true },
    validation: 'synthetic_fixture',
    knownLimitations: ['Headers use plural Withdrawals and Deposits'],
    fixtureManifest: [
      { id: 'pnb-savings-csv', description: 'PNB transaction statement with plural column headers', format: 'csv', accountType: 'bank', anonymized: true, expectedRows: 3 },
    ],
  },
  {
    id: 'bob',
    version: '1.1.0',
    label: 'Bank of Baroda',
    bank: 'Bank of Baroda',
    product: 'Savings & Current Account',
    accountType: 'bank',
    supportedFormats: ['csv', 'xlsx', 'xls', 'pdf'],
    markers: ['bank of baroda', 'bob', 'baroda connect'],
    dateHeaders: ['post date', 'transaction date', 'date', 'value date'],
    descriptionHeaders: ['details', 'description', 'narration', 'particulars'],
    debitHeaders: ['debit', 'withdrawal', 'dr'],
    creditHeaders: ['credit', 'deposit', 'cr'],
    referenceHeaders: ['chq ref number', 'ref number', 'reference', 'chq no'],
    balanceHeaders: ['balance', 'available balance'],
    capabilities: { textPdf: true, scannedOcr: true, csv: true, xlsx: true, encryptedPdf: true },
    validation: 'synthetic_fixture',
    knownLimitations: ['Uses Post Date as primary transaction date in some exports'],
    fixtureManifest: [
      { id: 'bob-savings-csv', description: 'Bank of Baroda statement with Post Date and Details columns', format: 'csv', accountType: 'bank', anonymized: true, expectedRows: 3 },
    ],
  },
  {
    id: 'canara',
    version: '1.1.0',
    label: 'Canara Bank',
    bank: 'Canara Bank',
    product: 'Savings & Current Account',
    accountType: 'bank',
    supportedFormats: ['csv', 'xlsx', 'xls', 'pdf'],
    markers: ['canara', 'canara bank'],
    dateHeaders: ['tran date', 'transaction date', 'date', 'value date'],
    descriptionHeaders: ['particulars', 'description', 'narration'],
    debitHeaders: ['debit', 'withdrawal'],
    creditHeaders: ['credit', 'deposit'],
    referenceHeaders: ['cheque no', 'reference number', 'ref no'],
    balanceHeaders: ['balance', 'closing balance'],
    capabilities: { textPdf: true, scannedOcr: true, csv: true, xlsx: true, encryptedPdf: true },
    validation: 'synthetic_fixture',
    knownLimitations: ['Legacy format exports use space delimiters in raw text'],
    fixtureManifest: [
      { id: 'canara-savings-csv', description: 'Canara Bank transaction statement with particulars', format: 'csv', accountType: 'bank', anonymized: true, expectedRows: 3 },
    ],
  },
  {
    id: 'idfc_first',
    version: '1.1.0',
    label: 'IDFC FIRST Bank',
    bank: 'IDFC FIRST Bank',
    product: 'Savings & Current Account',
    accountType: 'bank',
    supportedFormats: ['csv', 'xlsx', 'xls', 'pdf'],
    markers: ['idfc first', 'idfc', 'idfc first bank'],
    dateHeaders: ['transaction date', 'txn date', 'date', 'value date'],
    descriptionHeaders: ['particulars', 'description', 'narration', 'transaction details'],
    debitHeaders: ['debit', 'withdrawal', 'dr amount'],
    creditHeaders: ['credit', 'deposit', 'cr amount'],
    referenceHeaders: ['cheque reference number', 'reference number', 'utr', 'ref no'],
    balanceHeaders: ['balance', 'running balance'],
    capabilities: { textPdf: true, scannedOcr: true, csv: true, xlsx: true, encryptedPdf: true },
    validation: 'synthetic_fixture',
    knownLimitations: ['Statement may contain summary metadata rows prior to table header'],
    fixtureManifest: [
      { id: 'idfc-savings-csv', description: 'IDFC FIRST statement with cheque reference and particulars', format: 'csv', accountType: 'bank', anonymized: true, expectedRows: 3 },
    ],
  },
  {
    id: 'credit_card_generic',
    version: '1.0.0',
    label: 'Credit Card Statement',
    bank: 'Credit Card (Common Formats)',
    product: 'Credit Card Account',
    accountType: 'credit_card',
    supportedFormats: ['csv', 'xlsx', 'xls', 'pdf'],
    markers: ['credit card', 'card statement', 'total amount due', 'minimum amount due', 'card ending', 'billing period'],
    dateHeaders: ['transaction date', 'date', 'txn date', 'post date', 'posting date'],
    descriptionHeaders: ['transaction details', 'description', 'particulars', 'merchant name', 'narration'],
    debitHeaders: ['debit', 'spends', 'dr', 'dr amount'],
    creditHeaders: ['credit', 'payment', 'refund', 'payments/credits', 'credits', 'cr', 'cr amount'],
    referenceHeaders: ['reference number', 'ref no', 'auth code', 'approval code'],
    balanceHeaders: ['balance', 'running balance', 'card balance'],
    capabilities: { textPdf: true, scannedOcr: true, csv: true, xlsx: true, encryptedPdf: true },
    validation: 'synthetic_fixture',
    knownLimitations: [
      'Credit card balance convention is liability: purchases increase total dues, payments reduce dues',
      'Single amount columns often distinguish credits by "CR" or negative sign',
    ],
    fixtureManifest: [
      { id: 'card-statement-csv', description: 'Credit card CSV statement with purchases, payments and fee credits', format: 'csv', accountType: 'credit_card', anonymized: true, expectedRows: 4 },
    ],
  },
  {
    id: 'generic',
    version: '1.0.0',
    label: 'Unidentified bank',
    bank: 'Unidentified Institution',
    product: 'Generic Statement',
    accountType: 'bank',
    supportedFormats: ['csv', 'xlsx', 'xls', 'pdf'],
    markers: [],
    dateHeaders: ['transaction date', 'txn date', 'tran date', 'post date', 'date', 'posting date'],
    descriptionHeaders: ['narration', 'description', 'particulars', 'transaction details', 'transaction remarks', 'remarks', 'details'],
    debitHeaders: ['debit', 'withdrawal', 'withdrawals', 'dr amount', 'debit amount'],
    creditHeaders: ['credit', 'deposit', 'deposits', 'cr amount', 'credit amount'],
    referenceHeaders: ['reference', 'reference no', 'ref no', 'utr', 'cheque no', 'chq no'],
    balanceHeaders: ['balance', 'closing balance', 'running balance'],
    capabilities: { textPdf: true, scannedOcr: true, csv: true, xlsx: true, encryptedPdf: true },
    validation: 'unverified',
    knownLimitations: ['Requires explicit manual verification for all extracted fields', 'May require custom column mapping'],
    fixtureManifest: [],
  },
];

const normalize = (value: unknown) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function detectStatementAdapter(text: string): StatementAdapter {
  const normalizedText = normalize(text);
  // Check credit card markers first if strong card indicators exist
  const cardAdapter = STATEMENT_ADAPTERS.find((a) => a.id === 'credit_card_generic');
  if (cardAdapter && cardAdapter.markers.some((marker) => normalizedText.includes(normalize(marker)))) {
    return cardAdapter;
  }
  return STATEMENT_ADAPTERS.find((adapter) => adapter.id !== 'generic' && adapter.id !== 'credit_card_generic' && adapter.markers.some((marker) => normalizedText.includes(normalize(marker)))) || STATEMENT_ADAPTERS[STATEMENT_ADAPTERS.length - 1];
}

export function findHeaderColumn(headers: string[], candidates: string[]): number {
  return headers.findIndex((header) => {
    const normHeader = normalize(header);
    const words = normHeader.split(/\s+/);
    return candidates.some((candidate) => {
      const normCand = normalize(candidate);
      if (normHeader === normCand) return true;
      if (normCand.length <= 3) {
        return words.includes(normCand);
      }
      return normHeader.includes(normCand);
    });
  });
}

export function getStatementCompatibilityMatrix() {
  return STATEMENT_ADAPTERS.map((adapter) => ({
    id: adapter.id,
    label: adapter.label,
    product: adapter.product,
    accountType: adapter.accountType,
    supportedFormats: adapter.supportedFormats,
    validation: adapter.validation,
    capabilities: adapter.capabilities,
    knownLimitations: adapter.knownLimitations,
    fixturesCount: adapter.fixtureManifest.length,
  }));
}
