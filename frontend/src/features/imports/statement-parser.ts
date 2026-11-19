import { detectStatementAdapter, findHeaderColumn } from './statement-adapters';

export type StatementKind = 'income' | 'expense';
export type ImportReviewState = 'new' | 'possible_duplicate' | 'ambiguous' | 'needs_review' | 'imported';

export type RowClassification =
  | 'new'
  | 'already_recorded'
  | 'possible_duplicate'
  | 'internal_transfer'
  | 'income'
  | 'refund'
  | 'reversal'
  | 'credit_card_settlement'
  | 'ambiguous'
  | 'needs_review'
  | 'extraction_problem';

export interface ParsedStatementRow {
  key: string;
  date: string;
  valueDate?: string | null;
  description: string;
  amount: string;
  amountPaise: number;
  type: StatementKind;
  paymentMethod: 'online' | 'cash';
  reference: string | null;
  balance: string | null;
  state: ImportReviewState;
  classification?: RowClassification;
  confidence: 'high' | 'medium' | 'low';
  ocrConfidence?: number;
  selected: boolean;
  categoryId: string;
  warning?: string;
  exclusionReason?: string;
}

export interface StatementSummary {
  detectedCount: number;
  newCount: number;
  alreadyRecordedCount: number;
  selectedCount: number;
  skippedCount: number;
  skippedByReason: {
    possible_duplicate: number;
    ambiguous: number;
    balance_mismatch: number;
    deselected: number;
    import_error: number;
  };
  transferCount: number;
  incomeCount: number;
  refundCount: number;
  needsReviewCount: number;
  totalDebitsPaise: string;
  totalCreditsPaise: string;
  openingBalancePaise: string | null;
  closingBalancePaise: string | null;
  reconciliationDifferencePaise: string | null;
  isReconciled: boolean | null;
}

export interface StatementParseResult {
  rows: ParsedStatementRow[];
  bank: string;
  adapterId: string;
  adapterValidation: 'fixture_verified' | 'synthetic_fixture' | 'unverified';
  warnings: string[];
  period: { start: string; end: string } | null;
  ocrRequired?: boolean;
  ocrConfidence?: number;
  openingBalancePaise?: string | null;
  closingBalancePaise?: string | null;
  reconciliationDifferencePaise?: string | null;
  isReconciled?: boolean | null;
  mappingRequired?: boolean;
  sourceTable?: string[][];
  summary?: StatementSummary;
}

export type StatementColumnMapping = {
  headerIndex: number;
  date: number;
  valueDate: number | null;
  description: number;
  debit: number | null;
  credit: number | null;
  amount: number | null;
  type: number | null;
  reference: number | null;
  balance: number | null;
};

const normal = (value: unknown) => String(value ?? '').trim().replace(/\s+/g, ' ');
const keyText = (value: unknown) => normal(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function parseIndianAmount(value: unknown): { amount: string; amountPaise: number } {
  let text = normal(value).replace(/₹|Rs\.?/gi, '').replace(/\s/g, '');
  const negative = /^\(.*\)$/.test(text) || text.startsWith('-');
  text = text.replace(/[(),]/g, '').replace(/^-/, '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error('Amount is not a valid INR value');
  const [whole, fraction = ''] = text.split('.');
  const exactPaise = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  const paise = Number(exactPaise);
  if (!Number.isSafeInteger(paise)) throw new Error('Amount is outside the safe paise range');
  return { amount: `${negative ? '-' : ''}${text}`, amountPaise: paise };
}

export function parseIndianDate(value: unknown): string {
  const text = normal(value);
  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(text);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const numeric = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(text);
  if (numeric) {
    const year = Number(numeric[3]) < 100 ? 2000 + Number(numeric[3]) : Number(numeric[3]);
    return validDate(year, Number(numeric[2]), Number(numeric[1]));
  }
  const named = /^(\d{1,2})[-\s/]([A-Za-z]{3,})[-\s/](\d{2}|\d{4})$/.exec(text);
  if (named) {
    const month = new Date(`${named[2].slice(0, 3)} 1, 2000`).getMonth() + 1;
    if (!Number.isFinite(month)) throw new Error('Date month is invalid');
    const year = Number(named[3]) < 100 ? 2000 + Number(named[3]) : Number(named[3]);
    return validDate(year, month, Number(named[1]));
  }
  throw new Error('Date format is not recognized');
}

function validDate(year: number, month: number, day: number): string {
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) throw new Error('Date is invalid');
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

export function parseCsv(text: string): string[][] {
  const delimiter = [',', '\t', ';'].sort((a, b) => (text.split('\n')[0].split(b).length - text.split('\n')[0].split(a).length))[0];
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && char === delimiter) { row.push(cell); cell = ''; }
    else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
    } else cell += char;
  }
  if (quoted) throw new Error('CSV file has an unmatched quotation mark. Export the statement again and retry.');
  if (cell || row.length) { row.push(cell); if (row.some((v) => v.trim())) rows.push(row); }
  return rows;
}

export function computeStatementSummary(
  rows: ParsedStatementRow[],
  openingPaise: string | null,
  closingPaise: string | null,
  accountType: 'bank' | 'credit_card' = 'bank',
): StatementSummary {
  let debits = 0n;
  let credits = 0n;
  let newCount = 0;
  let alreadyRecorded = 0;
  let selectedCount = 0;
  let transferCount = 0;
  let incomeCount = 0;
  let refundCount = 0;
  let needsReviewCount = 0;

  const skippedReasons = {
    possible_duplicate: 0,
    ambiguous: 0,
    balance_mismatch: 0,
    deselected: 0,
    import_error: 0,
  };

  for (const row of rows) {
    if (row.type === 'expense') debits += BigInt(row.amountPaise);
    else credits += BigInt(row.amountPaise);

    if (row.classification === 'new') newCount++;
    if (row.classification === 'already_recorded') alreadyRecorded++;
    if (row.classification === 'internal_transfer' || row.classification === 'credit_card_settlement') transferCount++;
    if (row.classification === 'income') incomeCount++;
    if (row.classification === 'refund' || row.classification === 'reversal') refundCount++;
    if (row.classification === 'needs_review' || row.classification === 'extraction_problem') needsReviewCount++;

    if (row.selected) {
      selectedCount++;
    } else {
      if (row.state === 'possible_duplicate' || row.classification === 'possible_duplicate' || row.classification === 'already_recorded') {
        skippedReasons.possible_duplicate++;
      } else if (row.state === 'ambiguous' || row.classification === 'internal_transfer' || row.classification === 'refund' || row.classification === 'credit_card_settlement') {
        skippedReasons.ambiguous++;
      } else if (row.state === 'needs_review' || row.classification === 'needs_review') {
        skippedReasons.balance_mismatch++;
      } else {
        skippedReasons.deselected++;
      }
    }
  }

  let reconciliationDiff: string | null = null;
  let isReconciled: boolean | null = null;
  if (openingPaise !== null && closingPaise !== null) {
    try {
      const open = BigInt(openingPaise);
      const close = BigInt(closingPaise);
      // For bank account: expected closing = opening + credits - debits
      // For credit card liability account: expected closing = opening + debits (charges) - credits (payments)
      const expectedClose = accountType === 'credit_card'
        ? open + debits - credits
        : open + credits - debits;
      const diff = close - expectedClose;
      reconciliationDiff = diff.toString();
      isReconciled = diff === 0n;
    } catch {
      reconciliationDiff = null;
      isReconciled = null;
    }
  }

  return {
    detectedCount: rows.length,
    newCount,
    alreadyRecordedCount: alreadyRecorded,
    selectedCount,
    skippedCount: rows.length - selectedCount,
    skippedByReason: skippedReasons,
    transferCount,
    incomeCount,
    refundCount,
    needsReviewCount,
    totalDebitsPaise: debits.toString(),
    totalCreditsPaise: credits.toString(),
    openingBalancePaise: openingPaise,
    closingBalancePaise: closingPaise,
    reconciliationDifferencePaise: reconciliationDiff,
    isReconciled,
  };
}

export function normalizeStatementTable(
  table: unknown[][],
  fullText = '',
  mapping?: StatementColumnMapping,
): StatementParseResult {
  const normalizedTable = table.map((row) => row.map(normal));
  const adapter = detectStatementAdapter(`${fullText} ${normalizedTable.slice(0, 12).flat().join(' ')}`);
  const bank = adapter.label;
  const warnings: string[] = [];
  if (adapter.id === 'generic') warnings.push('Bank format was not identified. Rows use generic statement column matching; review each row.');
  if (adapter.validation !== 'fixture_verified' && adapter.validation !== 'synthetic_fixture') {
    warnings.push('This format has no verified fixture validation. Check every extracted field before importing.');
  }
  const detectedHeaderIndex = normalizedTable.findIndex((row) => {
    const headers = row.map(keyText);
    return findHeaderColumn(headers, adapter.dateHeaders) >= 0 && findHeaderColumn(headers, adapter.descriptionHeaders) >= 0;
  });
  const headerIndex = mapping?.headerIndex ?? detectedHeaderIndex;
  if (headerIndex < 0) {
    return {
      rows: [],
      bank,
      adapterId: adapter.id,
      adapterValidation: adapter.validation,
      warnings: [...warnings, 'Could not find a transaction date and narration header row. Try a CSV export or map columns manually.'],
      period: null,
      mappingRequired: true,
      sourceTable: normalizedTable,
    };
  }
  const headers = normalizedTable[headerIndex].map(keyText);
  const col = (candidates: string[]) => findHeaderColumn(headers, candidates);
  const mapped = (key: keyof StatementColumnMapping, fallback: number) => mapping ? mapping[key] as number | null : fallback;
  const dateCol = mapped('date', col(adapter.dateHeaders)) ?? -1, valueDateCol = mapped('valueDate', col(['value date', 'value dt', 'val date'])) ?? -1;
  const descCol = mapped('description', col(adapter.descriptionHeaders)) ?? -1;
  const debitCol = mapped('debit', col(adapter.debitHeaders)) ?? -1, creditCol = mapped('credit', col(adapter.creditHeaders)) ?? -1;
  const amountCol = mapped('amount', col(['amount', 'transaction amount', 'spends'])) ?? -1, typeCol = mapped('type', col(['type', 'dr cr', 'transaction type'])) ?? -1;
  const refCol = mapped('reference', col(adapter.referenceHeaders)) ?? -1, balanceCol = mapped('balance', col(adapter.balanceHeaders)) ?? -1;
  if (dateCol < 0 || descCol < 0) {
    return {
      rows: [],
      bank,
      adapterId: adapter.id,
      adapterValidation: adapter.validation,
      warnings: [...warnings, 'Choose both transaction date and description columns before parsing.'],
      period: null,
      mappingRequired: true,
      sourceTable: normalizedTable,
    };
  }
  if (debitCol < 0 && creditCol < 0 && amountCol < 0) warnings.push('No debit, credit, or amount column was found. Rows will need manual review.');
  const rows: ParsedStatementRow[] = [];
  let prior: ParsedStatementRow | null = null;
  for (let index = headerIndex + 1; index < normalizedTable.length; index++) {
    const values = normalizedTable[index];
    if (!values.some(Boolean)) continue;
    // Check if this row is a repeated table header row
    if (values.reduce((matches, value, column) => matches + Number(Boolean(value && keyText(value) === headers[column])), 0) >= 2) continue;
    const rawDate = values[dateCol] || '';
    if (!rawDate && prior && values.some(Boolean)) {
      prior.description = `${prior.description} ${values.filter(Boolean).join(' ')}`.trim();
      prior.confidence = 'medium';
      continue;
    }
    try {
      const date = parseIndianDate(rawDate);
      let valueDate: string | null = null;
      let valueDateProblem = false;
      if (valueDateCol >= 0 && values[valueDateCol]) {
        try { valueDate = parseIndianDate(values[valueDateCol]); }
        catch { valueDateProblem = true; warnings.push(`Row ${index + 1}: value date could not be read; the transaction is flagged for review.`); }
      }
      const description = values[descCol] || '';
      const debit = debitCol >= 0 ? values[debitCol] : '';
      const credit = creditCol >= 0 ? values[creditCol] : '';
      const debitPresent = Boolean(debit && !/^[-—]$/.test(debit) && parseIndianAmount(debit).amountPaise > 0);
      const creditPresent = Boolean(credit && !/^[-—]$/.test(credit) && parseIndianAmount(credit).amountPaise > 0);
      const conflictingColumns = debitPresent && creditPresent;
      let rawAmount = creditPresent ? credit : debitPresent ? debit : '';
      let type: StatementKind = creditPresent ? 'income' : 'expense';
      if (!rawAmount && amountCol >= 0) {
        rawAmount = values[amountCol];
        if (typeCol >= 0 && /credit|deposit|cr/i.test(values[typeCol])) type = 'income';
        else if (typeCol >= 0 && /debit|withdrawal|dr/i.test(values[typeCol])) type = 'expense';
        else if (/[+-]/.test(rawAmount)) type = rawAmount.trim().startsWith('-') ? 'expense' : 'income';
        else { type = /salary|interest|refund|cashback|dividend/i.test(description) ? 'income' : 'expense'; }
      }
      if (!description || !rawAmount || /^[-—]$/.test(rawAmount)) throw new Error('Narration or amount is missing');
      const parsed = parseIndianAmount(rawAmount);
      const signed = parsed.amount.startsWith('-') ? 'expense' : type;
      if (parsed.amountPaise === 0) throw new Error('Transaction amount must be greater than zero');
      const isCardSettlement = /CREDIT CARD PAYMENT|CARD PAYMENT|CC PAYMENT|CREDIT CARD BILL/i.test(description);
      const isReversal = /REVERSAL|CHARGEBACK/i.test(description);
      const isRefund = /REFUND|CASHBACK/i.test(description) && !isReversal;
      const isTransfer = /SELF TRANSFER|TRANSFER TO OWN|OWN ACCOUNT|LOAN DISBURS|LOAN CREDIT/i.test(description);

      let classification: RowClassification = 'new';
      let state: ImportReviewState = 'new';
      let warning: string | undefined;
      let exclusionReason: string | undefined;
      let shouldSelect = true;

      if (valueDateProblem) {
        classification = 'needs_review';
        state = 'needs_review';
        warning = 'Value date could not be parsed. Verify it before importing.';
        exclusionReason = 'Uncertain value date';
        shouldSelect = false;
      } else if (conflictingColumns) {
        classification = 'extraction_problem';
        state = 'ambiguous';
        warning = 'Both debit and credit columns contain non-zero values. Review the row before importing.';
        exclusionReason = 'Conflicting debit/credit columns';
        shouldSelect = false;
      } else if (isCardSettlement) {
        classification = 'credit_card_settlement';
        state = 'ambiguous';
        warning = 'May be a credit card payment. Excluded from automatic import to avoid duplicate expense tracking.';
        exclusionReason = 'Candidate card settlement pair';
        shouldSelect = false;
      } else if (isTransfer) {
        classification = 'internal_transfer';
        state = 'ambiguous';
        warning = 'May be an internal transfer or loan disbursement. Excluded from automatic import to avoid double-counting.';
        exclusionReason = 'Candidate cross-account transfer';
        shouldSelect = false;
      } else if (isReversal) {
        classification = 'reversal';
        state = 'ambiguous';
        warning = 'Possible reversal or chargeback. Review and link to original transaction.';
        exclusionReason = 'Candidate reversal';
        shouldSelect = false;
      } else if (isRefund) {
        classification = 'refund';
        state = 'ambiguous';
        warning = 'Possible refund or cashback. Review manually to avoid treating it as salary or income.';
        exclusionReason = 'Candidate refund';
        shouldSelect = false;
      } else if (signed === 'income') {
        classification = 'income';
        state = 'new';
        shouldSelect = true;
      }

      const row: ParsedStatementRow = {
        key: `${index}-${date}-${parsed.amountPaise}`,
        date,
        valueDate,
        description,
        amount: parsed.amount.replace(/^-/, ''),
        amountPaise: parsed.amountPaise,
        type: signed,
        paymentMethod: 'online',
        reference: refCol >= 0 ? values[refCol] || null : null,
        balance: balanceCol >= 0 ? values[balanceCol] || null : null,
        state,
        classification,
        confidence: debitCol >= 0 || creditCol >= 0 ? 'high' : 'medium',
        selected: shouldSelect,
        categoryId: '',
        ...(warning ? { warning } : {}),
        ...(exclusionReason ? { exclusionReason } : {}),
      };
      rows.push(row);
      prior = row;
    } catch (error) {
      warnings.push(`Row ${index + 1}: ${error instanceof Error ? error.message : 'Could not parse this row'}`);
    }
  }

  // Running balance check across sequential rows
  const isCreditCard = adapter.accountType === 'credit_card';
  for (let index = 1; index < rows.length; index++) {
    const previous = rows[index - 1];
    const current = rows[index];
    if (!previous.balance || !current.balance) continue;
    try {
      const previousBalance = parseIndianAmount(previous.balance).amountPaise;
      const currentBalance = parseIndianAmount(current.balance).amountPaise;
      const delta = (row: ParsedStatementRow) => isCreditCard
        ? (row.type === 'expense' ? row.amountPaise : -row.amountPaise)
        : (row.type === 'income' ? row.amountPaise : -row.amountPaise);
      const matchesAscending = currentBalance - previousBalance === delta(current);
      const matchesDescending = previousBalance - currentBalance === delta(previous);
      if (!matchesAscending && !matchesDescending) {
        current.state = 'needs_review';
        current.classification = 'needs_review';
        current.selected = false;
        current.confidence = 'low';
        current.warning = 'Running balance does not reconcile with the adjacent transaction. Check statement ordering, amount sign, and balance.';
        current.exclusionReason = 'Running balance discrepancy';
      }
    } catch {
      current.state = 'needs_review';
      current.classification = 'needs_review';
      current.selected = false;
      current.confidence = 'low';
      current.warning = 'Running balance could not be validated from the statement values.';
      current.exclusionReason = 'Invalid running balance';
    }
  }

  let openingBalancePaise: string | null = null;
  let closingBalancePaise: string | null = null;
  const balanceRows = rows.map((row, index) => ({ row, index })).filter(({ row }) => row.balance).sort((a, b) => a.row.date.localeCompare(b.row.date) || a.index - b.index);
  if (balanceRows.length) {
    try {
      const oldest = balanceRows[0].row;
      const newest = balanceRows.at(-1)!.row;
      const balanceBeforeFirstRow = isCreditCard
        ? BigInt(parseIndianAmount(oldest.balance).amountPaise) - (oldest.type === 'expense' ? BigInt(oldest.amountPaise) : -BigInt(oldest.amountPaise))
        : BigInt(parseIndianAmount(oldest.balance).amountPaise) - (oldest.type === 'income' ? BigInt(oldest.amountPaise) : -BigInt(oldest.amountPaise));
      openingBalancePaise = balanceBeforeFirstRow.toString();
      closingBalancePaise = BigInt(parseIndianAmount(newest.balance).amountPaise).toString();
    } catch {
      warnings.push('Statement opening/closing balances could not be derived from the running balance column.');
    }
  }

  const dates = rows.map((row) => row.date).sort();
  const summary = computeStatementSummary(rows, openingBalancePaise, closingBalancePaise, adapter.accountType);

  return {
    rows,
    bank,
    adapterId: adapter.id,
    adapterValidation: adapter.validation,
    warnings,
    period: dates.length ? { start: dates[0], end: dates.at(-1)! } : null,
    openingBalancePaise,
    closingBalancePaise,
    reconciliationDifferencePaise: summary.reconciliationDifferencePaise,
    isReconciled: summary.isReconciled,
    summary,
    ...(rows.length === 0 ? { mappingRequired: true, sourceTable: normalizedTable } : {}),
  };
}

export function tagDuplicates(
  rows: ParsedStatementRow[],
  existing: Array<{
    transaction_date: string;
    amount_paise: number;
    type: string;
    description: string | null;
    account_id?: string | null;
    statement_reference?: string | null;
  }>,
  accountId: string | null = null,
): ParsedStatementRow[] {
  const normalizeDescription = (value: string) => keyText(value).replace(/\b(?:upi|neft|imps|rtgs)\b/g, '').trim();
  const duplicateIndexes = new Set<number>();
  const referenceGroup = new Map<string, number[]>();
  const exactGroup = new Map<string, Array<{ index: number; reference: string }>>();
  const identity = (date: string, amount: number, type: string, description: string) =>
    JSON.stringify([date, amount, type, normalizeDescription(description)]);
  const append = <T,>(map: Map<string, T[]>, key: string, value: T) => {
    const group = map.get(key);
    if (group) group.push(value);
    else map.set(key, [value]);
  };

  rows.forEach((row, index) => {
    const reference = row.reference?.trim().toLowerCase() || '';
    if (reference) {
      const key = JSON.stringify([reference, row.amountPaise, row.type]);
      append(referenceGroup, key, index);
    }
    const key = identity(row.date, row.amountPaise, row.type, row.description);
    append(exactGroup, key, { index, reference });
  });

  for (const indexes of referenceGroup.values()) {
    if (indexes.length > 1) indexes.forEach((index) => duplicateIndexes.add(index));
  }
  for (const group of exactGroup.values()) {
    const missingReference = group.filter((item) => !item.reference);
    if (missingReference.length && group.length > 1) group.forEach(({ index }) => duplicateIndexes.add(index));
  }

  const markAlreadyRecorded = (row: ParsedStatementRow, reason: string): ParsedStatementRow => {
    if (row.state === 'imported') return row;
    const state = row.state === 'ambiguous' || row.state === 'needs_review' ? row.state : 'possible_duplicate';
    return {
      ...row,
      state,
      classification: 'already_recorded',
      selected: false,
      warning: [row.warning, reason].filter(Boolean).join(' '),
      exclusionReason: 'Already recorded in active ledger',
    };
  };

  const markPossibleDuplicate = (row: ParsedStatementRow, reason: string): ParsedStatementRow => {
    if (row.state === 'imported') return row;
    const state = row.state === 'ambiguous' || row.state === 'needs_review' ? row.state : 'possible_duplicate';
    return {
      ...row,
      state,
      classification: 'possible_duplicate',
      selected: false,
      warning: [row.warning, reason].filter(Boolean).join(' '),
      exclusionReason: 'Identical statement transaction exists',
    };
  };

  const exactLedgerRows = new Map<string, typeof existing>();
  const exactLedgerWithoutReference = new Map<string, typeof existing>();
  const referenceLedgerRows = new Map<string, typeof existing>();
  for (const item of existing) {
    const key = identity(item.transaction_date, item.amount_paise, item.type, item.description || '');
    append(exactLedgerRows, key, item);
    if (!item.statement_reference?.trim()) append(exactLedgerWithoutReference, key, item);
    const reference = item.statement_reference?.trim().toLowerCase();
    if (reference) {
      const referenceKey = JSON.stringify([item.account_id || '', reference, item.amount_paise, item.type]);
      append(referenceLedgerRows, referenceKey, item);
    }
  }

  return rows.map((row, rowIndex) => {
    const rowReference = row.reference?.trim().toLowerCase() || '';
    const referenceKey = JSON.stringify([accountId || '', rowReference, row.amountPaise, row.type]);
    const ledgerMatchesReference = Boolean(accountId && rowReference && referenceLedgerRows.has(referenceKey));
    const key = identity(row.date, row.amountPaise, row.type, row.description);
    const fallbackRows = rowReference ? exactLedgerWithoutReference.get(key) || [] : exactLedgerRows.get(key) || [];
    const ledgerMatchesExact = fallbackRows.some((item) => !item.account_id || !accountId || item.account_id === accountId);
    const duplicate = ledgerMatchesReference || ledgerMatchesExact;

    if (duplicate) {
      return markAlreadyRecorded(row, 'A matching ledger row exists. Confirm this is the same transaction before importing.');
    }
    if (duplicateIndexes.has(rowIndex)) {
      return markPossibleDuplicate(
        row,
        'Another row in this statement has the same reference or exact date, amount, direction and narration. They may still be separate events; review and select each one intentionally.',
      );
    }
    return row;
  });
}
