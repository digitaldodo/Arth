import { detectStatementAdapter, findHeaderColumn } from './statement-adapters';
import { assessPossibleDuplicate } from '@/features/categorization/duplicates';

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
  necessity?: 'essential' | 'optional' | 'luxury' | null;
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
  if (typeof value === 'number' && Number.isFinite(value)) {
    const isNegative = value < 0;
    const absVal = Math.abs(value);
    const fixed = absVal.toFixed(2);
    const paise = Math.round(absVal * 100);
    return { amount: `${isNegative ? '-' : ''}${fixed}`, amountPaise: paise };
  }
  let text = normal(value).replace(/₹|Rs\.?/gi, '').replace(/\s/g, '');
  const negative = /^\(.*\)$/.test(text) || text.startsWith('-');
  text = text.replace(/[(),]/g, '').replace(/^-/, '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error('Amount is not a valid INR value');
  const [whole, fraction = ''] = text.split('.');
  const exactPaise = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  const paise = Number(exactPaise);
  if (!Number.isSafeInteger(paise)) throw new Error('Amount is outside the safe paise range');
  const normalizedAmount = `${whole}.${fraction.padEnd(2, '0')}`;
  return { amount: `${negative ? '-' : ''}${normalizedAmount}`, amountPaise: paise };
}

export function parseIndianDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return validDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  const text = normal(value);
  if (!text) throw new Error('Date value is missing or empty');
  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/.exec(text);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const numeric = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?!\d)/.exec(text);
  if (numeric) {
    const year = Number(numeric[3]) < 100 ? 2000 + Number(numeric[3]) : Number(numeric[3]);
    return validDate(year, Number(numeric[2]), Number(numeric[1]));
  }
  const named = /^(\d{1,2})[-\s/]([A-Za-z]{3,})[-\s/](\d{4}|\d{2})(?!\d)/.exec(text);
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

export function parseCsv(text: unknown): string[][] {
  const content = typeof text === 'string' ? text : String(text ?? '');
  if (!content.trim()) return [];
  const firstLine = content.split('\n')[0] || '';
  const delimiter = [',', '\t', ';'].sort((a, b) => (firstLine.split(b).length - firstLine.split(a).length))[0];
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '"') {
      if (quoted && content[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && char === delimiter) { row.push(cell); cell = ''; }
    else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && content[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((v) => Boolean(v && typeof v === 'string' && v.trim()))) rows.push(row);
      row = [];
    } else cell += char;
  }
  if (quoted) throw new Error('CSV file has an unmatched quotation mark. Export the statement again and retry.');
  if (cell || row.length) {
    row.push(cell);
    if (row.some((v) => Boolean(v && typeof v === 'string' && v.trim()))) rows.push(row);
  }
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

export const STATEMENT_METADATA_REGEX =
  /^(?:opening\s*bal(?:ance)?|closing\s*bal(?:ance)?|balance\s*b\/?f|balance\s*c\/?f|brought\s*forward|carried\s*forward|available\s*balance|running\s*balance|balance\s*summary|total\s*withdrawal[s]?|total\s*deposit[s]?|total\s*debit[s]?|total\s*credit[s]?|statement\s*summary|account\s*summary|od\s*limit|overdraft\s*limit|statement\s*of\s*account|account\s*statement|customer\s*id|account\s*no|nomination\s*registered|page\s*\d+\s*(?:of|\/)\s*\d+|computer\s*generated|registered\s*office|gstin|ifsc|micr|branch\s*details|end\s*of\s*(?:statement|personal))/i;

export function isStatementMetadataOrSummary(text: unknown): boolean {
  if (text == null) return false;
  const clean = String(text).trim();
  if (!clean) return false;
  return STATEMENT_METADATA_REGEX.test(clean) ||
    /^(?:page\s*\d+|statement\s*period|generated\s*on|downloaded\s*on|rtgs\/neft\s*ifsc)/i.test(clean);
}

export interface PdfTextItem {
  text: string;
  x: number;
  y: number;
  width?: number;
}

/**
 * Spatial table extractor that maps PDF text items into columns using header bounding boxes.
 * Ensures empty cells (e.g. empty withdrawal on deposit, or empty deposit on withdrawal)
 * do not cause rightward columns (like Closing Balance) to shift into amount columns.
 */
export function extractTableFromPdfItems(pages: PdfTextItem[][]): string[][] {
  const table: string[][] = [];
  let columnBoundaries: number[] = [];
  let numColumns = 0;

  for (const pageItems of pages) {
    if (!pageItems || !pageItems.length) continue;

    // Group items into lines by Y coordinate (within 3pt clustering tolerance)
    const lineMap = new Map<number, PdfTextItem[]>();
    for (const item of pageItems) {
      if (!item || !item.text) continue;
      const itemText = String(item.text).trim();
      if (!itemText) continue;
      const roundedY = Math.round(item.y / 3) * 3;
      const list = lineMap.get(roundedY) || [];
      list.push(item);
      lineMap.set(roundedY, list);
    }

    // Sort lines top to bottom (descending Y coordinate)
    const sortedY = [...lineMap.keys()].sort((a, b) => b - a);

    for (const y of sortedY) {
      const items = lineMap.get(y)!.sort((a, b) => a.x - b.x);
      const lineText = items.map((it) => String(it.text ?? '').trim()).filter(Boolean).join(' ');
      if (!lineText) continue;

      const lower = lineText.toLowerCase();
      const hasDateHeader = /(?:txn\s*date|trans(?:action)?\s*date|\bdate\b)/i.test(lower);
      const hasDescHeader = /(?:narration|description|particulars|details)/i.test(lower);
      const hasAmountOrBalHeader = /(?:withdrawal|deposit|debit|credit|balance|amount)/i.test(lower);

      if (hasDateHeader && hasDescHeader && hasAmountOrBalHeader && items.length >= 3) {
        // Merge items that belong to the same header label (e.g. "Withdrawal" + "Amt.")
        const mergedHeaderItems: Array<{ x: number; endX: number; text: string }> = [];
        for (const it of items) {
          const itText = String(it.text ?? '').trim();
          const width = it.width || (itText.length * 6);
          const endX = it.x + width;
          const prev = mergedHeaderItems.at(-1);
          if (prev && it.x - prev.endX <= 8) {
            prev.text = `${prev.text} ${itText}`;
            prev.endX = Math.max(prev.endX, endX);
          } else {
            mergedHeaderItems.push({ x: it.x, endX, text: itText });
          }
        }

        numColumns = mergedHeaderItems.length;
        columnBoundaries = [];
        for (let i = 0; i < mergedHeaderItems.length - 1; i++) {
          const current = mergedHeaderItems[i];
          const next = mergedHeaderItems[i + 1];
          columnBoundaries.push((current.endX + next.x) / 2);
        }

        table.push(mergedHeaderItems.map((h) => String(h.text ?? '').trim()));
        continue;
      }

      // Map line items into established column boundaries
      if (columnBoundaries.length > 0 && numColumns > 0) {
        if (isStatementMetadataOrSummary(lineText) && items.length <= 2) {
          table.push([lineText]);
          continue;
        }

        const rowCells: string[] = Array(numColumns).fill('');
        for (const it of items) {
          const itText = String(it.text ?? '').trim();
          const midX = it.x + ((it.width || 0) / 2);
          let colIdx = 0;
          while (colIdx < columnBoundaries.length && midX > columnBoundaries[colIdx]) {
            colIdx++;
          }
          if (colIdx < numColumns) {
            rowCells[colIdx] = rowCells[colIdx] ? `${rowCells[colIdx]} ${itText}` : itText;
          }
        }
        table.push(rowCells.map((c) => String(c ?? '').trim()));
      } else {
        table.push(lineText.split(/\s{2,}/).map((v) => String(v ?? '').trim()));
      }
    }
  }

  return table;
}

export function normalizeStatementTable(
  table: unknown[][],
  fullText = '',
  mapping?: StatementColumnMapping,
): StatementParseResult {
  const safeTable = (Array.isArray(table) ? table : [])
    .filter((row): row is unknown[] => Array.isArray(row))
    .map((row) => Array.from(row).map(normal));
  const adapter = detectStatementAdapter(`${fullText} ${safeTable.slice(0, 12).flat().join(' ')}`);
  const bank = adapter.label;
  const warnings: string[] = [];
  if (adapter.id === 'generic') warnings.push('Bank format was not identified. Rows use generic statement column matching; review each row.');
  if (adapter.validation !== 'fixture_verified' && adapter.validation !== 'synthetic_fixture') {
    warnings.push('This format has no verified fixture validation. Check every extracted field before importing.');
  }
  const detectedHeaderIndex = safeTable.findIndex((row) => {
    const headers = row.map(keyText);
    return findHeaderColumn(headers, adapter.dateHeaders) >= 0 && findHeaderColumn(headers, adapter.descriptionHeaders) >= 0;
  });
  const headerIndex = mapping?.headerIndex ?? detectedHeaderIndex;
  if (headerIndex < 0 || headerIndex >= safeTable.length) {
    return {
      rows: [],
      bank,
      adapterId: adapter.id,
      adapterValidation: adapter.validation,
      warnings: [...warnings, 'Could not find a transaction date and narration header row. Try a CSV export or map columns manually.'],
      period: null,
      mappingRequired: true,
      sourceTable: safeTable,
    };
  }
  const headers = safeTable[headerIndex].map(keyText);
  const col = (candidates: string[]) => findHeaderColumn(headers, candidates);
  const mapped = (key: keyof StatementColumnMapping, fallback: number) => mapping ? mapping[key] as number | null : fallback;
  const dateCol = mapped('date', col(adapter.dateHeaders)) ?? -1, valueDateCol = mapped('valueDate', col(['value date', 'value dt', 'val date'])) ?? -1;
  const descCol = mapped('description', col(adapter.descriptionHeaders)) ?? -1;
  const debitCol = mapped('debit', col(adapter.debitHeaders)) ?? -1, creditCol = mapped('credit', col(adapter.creditHeaders)) ?? -1;
  const amountCol = mapped('amount', col(['amount', 'amount inr', 'amount (inr)', 'transaction amount', 'txn amount', 'spends', 'net amount'])) ?? -1;
  const typeCol = mapped('type', col(['type', 'dr cr', 'transaction type', 'cr dr', 'txn type'])) ?? -1;
  const refCol = mapped('reference', col(adapter.referenceHeaders)) ?? -1, balanceCol = mapped('balance', col(adapter.balanceHeaders)) ?? -1;
  const categoryCol = col(['category', 'category name']);
  const necessityCol = col(['necessity', 'necessity class']);
  if (dateCol < 0 || descCol < 0) {
    return {
      rows: [],
      bank,
      adapterId: adapter.id,
      adapterValidation: adapter.validation,
      warnings: [...warnings, 'Choose both transaction date and description columns before parsing.'],
      period: null,
      mappingRequired: true,
      sourceTable: safeTable,
    };
  }
  if (debitCol < 0 && creditCol < 0 && amountCol < 0) warnings.push('No debit, credit, or amount column was found. Rows will need manual review.');
  const rows: ParsedStatementRow[] = [];
  let prior: ParsedStatementRow | null = null;
  let explicitOpeningBalancePaise: string | null = null;
  let explicitClosingBalancePaise: string | null = null;

  for (let index = headerIndex + 1; index < safeTable.length; index++) {
    const values = safeTable[index];
    if (!values || !Array.isArray(values) || !values.some(Boolean)) continue;

    // Check if this row is a repeated table header row
    if (values.reduce((matches, value, column) => matches + Number(Boolean(value && column < headers.length && keyText(value) === headers[column])), 0) >= 2) continue;

    const cellStr = (col: number): string => {
      if (col < 0 || col >= values.length) return '';
      const v = values[col];
      return v != null ? String(v).trim() : '';
    };

    const fullRowText = values.filter(Boolean).map((v) => String(v).trim()).filter(Boolean).join(' ');
    const rawDescription = cellStr(descCol);
    const isMetadata = isStatementMetadataOrSummary(fullRowText) || (rawDescription ? isStatementMetadataOrSummary(rawDescription) : false);

    // If row contains opening or closing balance metadata, extract statement-level balances and never import as transaction
    if (isMetadata) {
      if (/opening\s*bal|brought\s*forward|balance\s*b\/?f/i.test(fullRowText)) {
        for (const cell of values) {
          try {
            const parsed = parseIndianAmount(cell);
            if (parsed.amountPaise > 0) {
              explicitOpeningBalancePaise = parsed.amountPaise.toString();
              break;
            }
          } catch {}
        }
      }
      if (/closing\s*bal|carried\s*forward|balance\s*c\/?f/i.test(fullRowText)) {
        for (const cell of values) {
          try {
            const parsed = parseIndianAmount(cell);
            if (parsed.amountPaise > 0) {
              explicitClosingBalancePaise = parsed.amountPaise.toString();
              break;
            }
          } catch {}
        }
      }
      // Never treat summary / metadata / balance rows as transactions or continuation lines
      continue;
    }

    const rawDate = cellStr(dateCol);

    // Multi-line continuation: row has no date but follows an active transaction
    if (!rawDate && prior) {
      const continuationText = values.filter(Boolean).map((v) => String(v).trim()).filter(Boolean).join(' ');
      if (continuationText && !isStatementMetadataOrSummary(continuationText)) {
        prior.description = `${prior.description || ''} ${continuationText}`.trim();
        prior.confidence = 'medium';
        // Extract reference/UTR from continuation text if prior row is missing reference
        if (!prior.reference) {
          const refMatch = /(?:(?:ref(?:erence)?|utr|rrn|chq|cheque)[:\s/=-]+|upi\/(?:cr|dr)\/)([a-zA-Z0-9]{6,30})/i.exec(continuationText);
          if (refMatch) prior.reference = refMatch[1];
        }
      }
      continue;
    }

    try {
      const date = parseIndianDate(rawDate);
      let valueDate: string | null = null;
      let valueDateProblem = false;
      const rawValueDate = cellStr(valueDateCol);
      if (rawValueDate) {
        try { valueDate = parseIndianDate(rawValueDate); }
        catch { valueDateProblem = true; warnings.push(`Row ${index + 1}: value date could not be read; the transaction is flagged for review.`); }
      }

      let description = rawDescription;
      if (!description) {
        description = values
          .filter((_, i) => i !== dateCol && i !== balanceCol && i !== debitCol && i !== creditCol && i !== amountCol && i !== refCol && i !== valueDateCol)
          .filter(Boolean)
          .map((v) => String(v).trim())
          .filter(Boolean)
          .join(' ');
      }
      let missingDescription = false;
      if (!description) {
        description = 'Unspecified Transaction';
        missingDescription = true;
      } else if (isStatementMetadataOrSummary(description)) {
        // Not a genuine transaction description (summary or empty)
        continue;
      }

      const debit = cellStr(debitCol);
      const credit = cellStr(creditCol);

      let debitPresent = false;
      let creditPresent = false;
      let debitAmount = { amount: '', amountPaise: 0 };
      let creditAmount = { amount: '', amountPaise: 0 };

      if (debit && !/^[-—]$/.test(debit)) {
        try {
          const d = parseIndianAmount(debit);
          if (d.amountPaise > 0) {
            debitPresent = true;
            debitAmount = d;
          }
        } catch {}
      }

      if (credit && !/^[-—]$/.test(credit)) {
        try {
          const c = parseIndianAmount(credit);
          if (c.amountPaise > 0) {
            creditPresent = true;
            creditAmount = c;
          }
        } catch {}
      }

      const conflictingColumns = debitPresent && creditPresent;
      let rawAmount = '';
      let type: StatementKind = 'expense';
      let parsedAmountPaise = 0;
      let isReversalEntry = false;

      if (conflictingColumns) {
        // Both columns populated: flag for user review
        rawAmount = debitAmount.amount || creditAmount.amount;
        parsedAmountPaise = debitAmount.amountPaise || creditAmount.amountPaise;
        type = 'expense';
      } else if (creditPresent) {
        rawAmount = creditAmount.amount;
        parsedAmountPaise = creditAmount.amountPaise;
        if (rawAmount.startsWith('-')) {
          // Negative credit/deposit decreases balance -> expense reversal
          type = 'expense';
          isReversalEntry = true;
        } else {
          type = 'income';
        }
      } else if (debitPresent) {
        rawAmount = debitAmount.amount;
        parsedAmountPaise = debitAmount.amountPaise;
        if (rawAmount.startsWith('-')) {
          // Negative withdrawal/debit increases balance -> income reversal (e.g. HDFC -101.86)
          type = 'income';
          isReversalEntry = true;
        } else {
          type = 'expense';
        }
      } else if (amountCol >= 0 && amountCol !== balanceCol) {
        // Single signed amount column (never closing balance)
        const candidate = cellStr(amountCol);
        if (candidate && !/^[-—]$/.test(candidate)) {
          const parsed = parseIndianAmount(candidate);
          if (parsed.amountPaise > 0) {
            rawAmount = parsed.amount;
            parsedAmountPaise = parsed.amountPaise;
            const isNegative = String(rawAmount || '').trim().startsWith('-');
            const typeVal = cellStr(typeCol);
            if (typeCol >= 0 && /credit|deposit|income|cr/i.test(typeVal)) {
              if (isNegative) {
                type = 'expense';
                isReversalEntry = true;
              } else {
                type = 'income';
              }
            } else if (typeCol >= 0 && /debit|withdrawal|expense|dr/i.test(typeVal)) {
              if (isNegative) {
                type = 'income';
                isReversalEntry = true;
              } else {
                type = 'expense';
              }
            } else if (/[+-]/.test(rawAmount)) {
              type = isNegative ? 'expense' : 'income';
            } else {
              type = /salary|interest|refund|cashback|dividend/i.test(description) ? 'income' : 'expense';
            }
          }
        }
      }

      // If both debit and credit are empty/zero (or no transaction amount), this is NOT a transaction! Skip it!
      if (!rawAmount || parsedAmountPaise === 0) {
        continue;
      }

      const isCardSettlement = /CREDIT CARD PAYMENT|CARD PAYMENT|CC PAYMENT|CREDIT CARD BILL/i.test(description);
      const isReversal = isReversalEntry || /REVERSAL|CHARGEBACK/i.test(description);
      const isRefund = /REFUND|CASHBACK/i.test(description) && !isReversal;
      const isTransfer = /SELF TRANSFER|TRANSFER TO OWN|OWN ACCOUNT|LOAN DISBURS|LOAN CREDIT/i.test(description);

      let classification: RowClassification = 'new';
      let state: ImportReviewState = 'new';
      let warning: string | undefined;
      let exclusionReason: string | undefined;
      let shouldSelect = true;

      if (missingDescription) {
        classification = 'needs_review';
        state = 'needs_review';
        warning = 'Transaction narration is missing in statement row. Verify details before importing.';
        exclusionReason = 'Missing transaction description';
        shouldSelect = false;
      } else if (valueDateProblem) {
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
        warning = isReversalEntry
          ? 'Reversal transaction with signed negative amount. Direction verified against statement balance.'
          : 'Possible reversal or chargeback. Review and link to original transaction.';
        exclusionReason = 'Candidate reversal';
        shouldSelect = false;
      } else if (isRefund) {
        classification = 'refund';
        state = 'ambiguous';
        warning = 'Possible refund or cashback. Review manually to avoid treating it as salary or income.';
        exclusionReason = 'Candidate refund';
        shouldSelect = false;
      } else if (type === 'income') {
        classification = 'income';
        state = 'new';
        shouldSelect = true;
      }

      // Check if reference is present in reference column or description
      let reference: string | null = cellStr(refCol) || null;
      if (!reference) {
        const refMatch = /(?:(?:ref(?:erence)?|utr|rrn|chq|cheque)[:\s/=-]+|upi\/(?:cr|dr)\/)([a-zA-Z0-9]{6,30})/i.exec(description);
        if (refMatch) reference = refMatch[1];
      }

      const balanceValue = cellStr(balanceCol) || null;
      const rawNecessity = cellStr(necessityCol).toLowerCase();
      const parsedNecessity = type === 'expense' && (rawNecessity === 'essential' || rawNecessity === 'optional' || rawNecessity === 'luxury')
        ? rawNecessity
        : null;
      const rawCategory = cellStr(categoryCol);

      const row: ParsedStatementRow = {
        key: `${index}-${date}-${parsedAmountPaise}`,
        date,
        valueDate,
        description,
        amount: String(rawAmount || '').replace(/^-/, ''),
        amountPaise: parsedAmountPaise,
        type,
        paymentMethod: 'online',
        reference,
        balance: balanceValue,
        state,
        classification,
        confidence: debitCol >= 0 || creditCol >= 0 ? 'high' : 'medium',
        selected: shouldSelect,
        categoryId: rawCategory,
        necessity: parsedNecessity,
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

  let openingBalancePaise: string | null = explicitOpeningBalancePaise;
  let closingBalancePaise: string | null = explicitClosingBalancePaise;
  const balanceRows = rows.map((row, index) => ({ row, index })).filter(({ row }) => row.balance).sort((a, b) => a.row.date.localeCompare(b.row.date) || a.index - b.index);
  if (balanceRows.length) {
    try {
      const oldest = balanceRows[0].row;
      const newest = balanceRows.at(-1)!.row;
      if (!openingBalancePaise) {
        const balanceBeforeFirstRow = isCreditCard
          ? BigInt(parseIndianAmount(oldest.balance).amountPaise) - (oldest.type === 'expense' ? BigInt(oldest.amountPaise) : -BigInt(oldest.amountPaise))
          : BigInt(parseIndianAmount(oldest.balance).amountPaise) - (oldest.type === 'income' ? BigInt(oldest.amountPaise) : -BigInt(oldest.amountPaise));
        openingBalancePaise = balanceBeforeFirstRow.toString();
      }
      if (!closingBalancePaise) {
        closingBalancePaise = BigInt(parseIndianAmount(newest.balance).amountPaise).toString();
      }
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
    ...(rows.length === 0 ? { mappingRequired: true, sourceTable: safeTable } : {}),
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
  const normalizeDescription = (value: unknown) => keyText(value).replace(/\b(?:upi|neft|imps|rtgs)\b/g, '').trim();
  const duplicateIndexes = new Set<number>();
  const referenceGroup = new Map<string, number[]>();
  const exactGroup = new Map<string, Array<{ index: number; reference: string }>>();
  const identity = (date: string, amount: number, type: string, description: unknown) =>
    JSON.stringify([date, amount, type, normalizeDescription(description)]);
  const append = <T,>(map: Map<string, T[]>, key: string, value: T) => {
    const group = map.get(key);
    if (group) group.push(value);
    else map.set(key, [value]);
  };

  rows.forEach((row, index) => {
    const reference = typeof row.reference === 'string' ? row.reference.trim().toLowerCase() : '';
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

  return rows.map((row, rowIndex) => {
    const rowReference = typeof row.reference === 'string' ? row.reference.trim().toLowerCase() : '';
    const ledgerAssessment = assessPossibleDuplicate({
      date: row.date, amountPaise: row.amountPaise, type: row.type,
      description: row.description, accountId, reference: rowReference || null,
    }, existing);
    const duplicate = ledgerAssessment.possibleDuplicate;

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
