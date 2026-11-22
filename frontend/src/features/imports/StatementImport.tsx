'use client';

import { useEffect, useMemo, useRef, useState, Fragment, type DragEvent, type FormEvent } from 'react';
import { v7 as uuidv7 } from 'uuid';
import { formatPaiseToINR, parseINRToPaise, type CategoryDTO, type CreateTransactionResponse } from '@arth/contracts';
import { sanitizeUserFacingError } from '@/lib/error-utils';
import { getCachedCategories, getCachedTransactions, getPendingMutations, getStatementImportBatches, removePendingMutation, saveStatementImportBatch, type StatementImportBatch } from '@/lib/offline-db';
import { fetchCategories, fetchTransactions } from '@/lib/api-client';
import { syncEngine } from '@/features/sync/sync-engine';
import {
  normalizeStatementTable,
  parseCsv,
  tagDuplicates,
  computeStatementSummary,
  extractTableFromPdfItems,
  type ParsedStatementRow,
  type StatementColumnMapping,
  type StatementParseResult,
  type StatementSummary,
  type PdfTextItem,
} from './statement-parser';
import { getStatementCompatibilityMatrix } from './statement-adapters';
import { alignOcrRows, requireOcrReview, type OcrCell, type OcrLine } from './statement-ocr';
import { skippedRowsForImport } from './statement-skip-history';
import { merchantFingerprint, recordCategoryCorrection, suggestCategory } from '@/features/categorization';
import { Badge } from '@/components/ui/Badge';
import { categorizeTransactionWithLayers } from '@/features/categorization/layered-categorization';
import { saveUserMerchantRule } from '@/features/categorization/user-merchant-rules';
import { extractCounterpartyAndPaymentMethod, normalizeMerchantKey } from '@/features/categorization/upi-parser';
import { detectRecurringPatterns, type RecurringPatternResult } from '@/features/categorization/recurring-detector';
import { classifyNecessity } from '@/features/categorization/necessity-classifier';
import { computeSourceFingerprint } from './historical-reconciliation';

type Props = {
  userId: string;
  onImported: (count: number) => void;
  onManualEntry?: () => void;
};

type PasswordCallback = (password: string) => void;

type ExistingLedgerRow = {
  id?: string;
  transaction_date: string;
  amount_paise: number;
  type: string;
  description: string | null;
  cleanMerchant?: string;
  account_id?: string | null;
  statement_reference?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  necessity?: 'essential' | 'optional' | 'luxury' | null;
  source_fingerprint?: string | null;
};

function isAttentionRow(r: ParsedStatementRow): boolean {
  if (r.state === 'imported') return false;
  if (r.userSkipped || r.state === 'skipped') return true;
  if (r.state === 'ambiguous') return true;
  if (r.classification === 'extraction_problem') return true;
  if (!r.date || isNaN(Date.parse(r.date))) return true;
  if (!r.amountPaise || r.amountPaise <= 0) return true;
  return false;
}

function isAlreadyInLedgerRow(r: ParsedStatementRow): boolean {
  if (r.state === 'imported') return false;
  if (r.includedAnyway) return false;
  if (isAttentionRow(r)) return false;
  return (
    r.matchedLedger != null ||
    r.classification === 'already_recorded' ||
    r.classification === 'possible_duplicate'
  );
}

function enrichStatementRows(
  rows: ParsedStatementRow[],
  existingLedger: ExistingLedgerRow[],
  categories: readonly CategoryDTO[],
  userId?: string,
  institution?: string | null
): ParsedStatementRow[] {
  // 1. Tag duplicates and match with ledger via 4-tier hierarchy
  const tagged = tagDuplicates(rows, existingLedger, null, userId);

  // 2. Detect recurring payment patterns across historical ledger + newly extracted rows
  const recurringPatterns = detectRecurringPatterns([
    ...existingLedger.map((r) => ({
      transaction_date: r.transaction_date,
      amount_paise: r.amount_paise,
      type: r.type,
      description: r.description,
      cleanMerchant: r.cleanMerchant,
    })),
    ...tagged.map((r) => ({
      transaction_date: r.date,
      amount_paise: r.amountPaise,
      type: r.type,
      description: r.description,
      cleanMerchant: r.cleanMerchant,
    })),
  ]);

  // 3. Layered categorization and strict 3-tier necessity classification
  const available = categories.filter((category) => !category.archived_at);

  return tagged.map((row) => {
    const merchantKey = normalizeMerchantKey(row.cleanMerchant || row.description || '');
    const recPattern = recurringPatterns.get(merchantKey) || null;

    const layered = categorizeTransactionWithLayers(
      row.description,
      available,
      row.type,
      userId,
      row.cleanMerchant
    );

    const necResult = classifyNecessity({
      narration: row.description,
      cleanMerchant: row.cleanMerchant,
      categoryName: layered.categoryName,
      type: row.type,
      userId,
      recurringPattern: recPattern,
      historicalTransactions: existingLedger,
    });

    const fp = computeSourceFingerprint({
      userId,
      transactionDate: row.date,
      amountPaise: row.amountPaise,
      type: row.type,
      normalizedMerchant: merchantKey,
      institution,
    });

    return {
      ...row,
      categoryId: layered.categoryId || '',
      necessity: row.type === 'expense' ? (layered.necessity || necResult.necessity || row.necessity || null) : null,
      recurringPattern: recPattern,
      sourceFingerprint: fp,
    };
  });
}

type StoredBatch = {
  id: string;
  account_id: string | null;
  source_name: string;
  source_format: 'pdf' | 'csv' | 'xlsx' | 'xls';
  parser_id: string;
  statement_start: string | null;
  statement_end: string | null;
  opening_balance_paise: string | null;
  closing_balance_paise: string | null;
  source_sha256: string | null;
  status: 'processing' | 'completed' | 'partial' | 'failed' | 'undone';
  detected_count: number;
  imported_count: number;
  skipped_count: number;
  duplicate_count: number;
  skipped_rows?: NonNullable<StatementImportBatch['skipped_rows']>;
  transaction_ids?: string[];
  created_at: string;
};

const MAPPING_FIELDS: Array<[keyof StatementColumnMapping, string]> = [
  ['date', 'Transaction date'],
  ['valueDate', 'Value date'],
  ['description', 'Description / narration'],
  ['debit', 'Debit amount'],
  ['credit', 'Credit amount'],
  ['amount', 'Single amount'],
  ['type', 'Debit / credit type'],
  ['reference', 'Reference / UTR'],
  ['balance', 'Running balance'],
];

export function StatementImport({ userId, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [result, setResult] = useState<StatementParseResult | null>(null);
  const [mappingHeaderIndex, setMappingHeaderIndex] = useState('0');
  const [mappingColumns, setMappingColumns] = useState<Record<string, string>>({});
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [rememberSessionPassword, setRememberSessionPassword] = useState(false);
  const sessionPasswordRef = useRef<string | null>(null);
  const [ocrProgress, setOcrProgress] = useState(0);
  const passwordCallback = useRef<PasswordCallback | null>(null);
  const [processing, setProcessing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<StatementImportBatch[]>([]);
  const [pendingCountByBatch, setPendingCountByBatch] = useState<Record<string, number>>({});
  const [confirmUndoId, setConfirmUndoId] = useState<string | null>(null);
  const [retryingBatchId, setRetryingBatchId] = useState<string | null>(null);
  const [showCompatibility, setShowCompatibility] = useState(false);
  const [reviewFilter, setReviewFilter] = useState<'all' | 'new' | 'already_recorded' | 'possible_duplicate' | 'needs_review'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedRowKeys, setExpandedRowKeys] = useState<Set<string>>(new Set());
  const [sectionReviewOpen, setSectionReviewOpen] = useState(true);
  const [sectionImportedOpen, setSectionImportedOpen] = useState(false);
  const [sectionAlreadyInLedgerOpen, setSectionAlreadyInLedgerOpen] = useState(true);
  const [sectionAttentionOpen, setSectionAttentionOpen] = useState(false);
  const [dateCorrectionMap, setDateCorrectionMap] = useState<Record<string, string>>({});
  const [rememberMerchantPrompt, setRememberMerchantPrompt] = useState<{
    rowKey: string;
    merchantPattern: string;
    categoryId: string;
    categoryName: string;
  } | null>(null);
  const [inspectedBatch, setInspectedBatch] = useState<StatementImportBatch | null>(null);
  const [rememberedSuccessMsg, setRememberedSuccessMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pdfTask = useRef<{ destroy: () => Promise<void> } | null>(null);
  const parseVersion = useRef(0);

  const refreshPendingCounts = async (batchList: StatementImportBatch[]) => {
    try {
      const pending = await getPendingMutations(userId);
      const counts: Record<string, number> = {};
      for (const batch of batchList) {
        const idSet = new Set(batch.imported_ids);
        counts[batch.id] = pending.filter((m) => idSet.has(m.entityId)).length;
      }
      setPendingCountByBatch(counts);
    } catch {}
  };

  function toggleRowExpand(key: string) {
    setExpandedRowKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  useEffect(() => {
    let active = true;
    void Promise.all([getCachedCategories(userId), getStatementImportBatches(userId)]).then(async ([cached, imports]) => {
      if (!active) return;
      setCategories(cached);
      const recoverable = imports.map((item) => item.status === 'processing' ? { ...item, status: 'partial' as const } : item);
      setHistory(recoverable);
      void refreshPendingCounts(recoverable);
      for (const item of recoverable) {
        if (item.status === 'partial' && imports.find((old) => old.id === item.id)?.status === 'processing') {
          void saveStatementImportBatch(item);
        }
      }
      try {
        const fresh = await fetchCategories({ include_archived: false });
        if (active) setCategories(fresh.categories);
      } catch {
        /* Cached categories remain available offline */
      }
      try {
        const batchResponse = await fetch('/api/backend/financial/import-batches', { cache: 'no-store' });
        if (!batchResponse.ok) throw new Error('Could not load saved import metadata');
        const batchData = await batchResponse.json() as { batches: StoredBatch[] };
        if (!active) return;
        const remote: StatementImportBatch[] = (batchData.batches || []).map((batch) => ({
          id: batch.id,
          user_id: userId,
          source: batch.source_name,
          created_at: batch.created_at,
          imported_ids: batch.transaction_ids || [],
          detected_count: batch.detected_count,
          status: batch.status === 'undone' ? 'undone' as const : batch.status === 'completed' ? 'completed' as const : batch.status === 'processing' ? 'processing' as const : 'partial' as const,
          account_id: null,
          statement_start: batch.statement_start,
          statement_end: batch.statement_end,
          opening_balance_paise: batch.opening_balance_paise,
          closing_balance_paise: batch.closing_balance_paise,
          parser_id: batch.parser_id,
          source_format: batch.source_format,
          source_sha256: batch.source_sha256,
          skipped_rows: batch.skipped_rows || [],
        }));
        setHistory((current) => {
          const localById = new Map(current.map((item) => [item.id, item]));
          for (const item of remote) {
            const local = localById.get(item.id);
            localById.set(item.id, local ? { ...item, ...local, status: item.status, imported_ids: [...new Set([...local.imported_ids, ...item.imported_ids])] } : item);
          }
          const merged = [...localById.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
          void refreshPendingCounts(merged);
          return merged;
        });
      } catch {
        /* Keep browser history available when persistent metadata is offline */
      }
    });
    return () => { active = false; };
  }, [userId]);

  useEffect(() => () => {
    parseVersion.current++;
    sessionPasswordRef.current = null;
    if (pdfTask.current) void pdfTask.current.destroy().catch(() => {});
  }, []);

  const importedRows = useMemo(() => {
    return result?.rows.filter((r) => r.state === 'imported') || [];
  }, [result?.rows]);

  const attentionRows = useMemo(() => {
    if (!result?.rows) return [];
    return result.rows.filter(isAttentionRow);
  }, [result?.rows]);

  const alreadyInLedgerRows = useMemo(() => {
    if (!result?.rows) return [];
    return result.rows.filter(isAlreadyInLedgerRow);
  }, [result?.rows]);

  const toReviewRows = useMemo(() => {
    if (!result?.rows) return [];
    return result.rows.filter((r) => r.state !== 'imported' && !isAttentionRow(r) && !isAlreadyInLedgerRow(r));
  }, [result?.rows]);

  const selectedRows = useMemo(() => toReviewRows.filter((row) => row.selected), [toReviewRows]);

  const selectedTotalPaise = useMemo(() => {
    return selectedRows.reduce((acc, row) => acc + BigInt(row.amountPaise), 0n);
  }, [selectedRows]);

  const summary: StatementSummary | null = useMemo(() => {
    if (!result) return null;
    return computeStatementSummary(
      result.rows,
      result.openingBalancePaise ?? null,
      result.closingBalancePaise ?? null,
      'bank'
    );
  }, [result]);

  const totals = useMemo(() => ({
    debits: summary ? BigInt(summary.totalDebitsPaise) : 0n,
    credits: summary ? BigInt(summary.totalCreditsPaise) : 0n,
    duplicates: summary ? summary.skippedByReason.possible_duplicate : 0,
    alreadyRecorded: summary ? summary.alreadyRecordedCount : 0,
    review: summary ? summary.needsReviewCount : 0,
  }), [summary]);

  const filterList = (list: ParsedStatementRow[]) => {
    const q = typeof searchQuery === 'string' ? searchQuery.toLowerCase().trim() : '';
    if (!q) return list;
    return list.filter((r) =>
      (r.description || '').toLowerCase().includes(q) ||
      (r.cleanMerchant || '').toLowerCase().includes(q) ||
      (r.amount || '').includes(q) ||
      (r.date || '').includes(q) ||
      (r.reference && String(r.reference).toLowerCase().includes(q))
    );
  };

  const filteredReviewRows = useMemo(() => filterList(toReviewRows), [toReviewRows, searchQuery]);
  const filteredImportedRows = useMemo(() => filterList(importedRows), [importedRows, searchQuery]);
  const filteredAlreadyInLedgerRows = useMemo(() => filterList(alreadyInLedgerRows), [alreadyInLedgerRows, searchQuery]);
  const filteredAttentionRows = useMemo(() => filterList(attentionRows), [attentionRows, searchQuery]);

  const filteredRows = filteredReviewRows;

  async function readFile(selectedFile: File) {
    const version = ++parseVersion.current;
    if (pdfTask.current) {
      await pdfTask.current.destroy().catch(() => {});
      pdfTask.current = null;
    }
    passwordCallback.current = null;
    setFile(selectedFile);
    setResult(null);
    setMappingHeaderIndex('0');
    setMappingColumns({});
    setError('');
    setMessage('');
    setPassword('');
    setPasswordRequired(false);

    if (selectedFile.size > 30 * 1024 * 1024) {
      setError('Statements must be 30 MB or smaller.');
      return;
    }
    const ext = selectedFile.name.toLowerCase().split('.').pop();
    if (!['csv', 'xlsx', 'xls', 'pdf'].includes(ext || '')) {
      setError('Please choose a valid PDF, CSV, XLSX, or XLS statement.');
      return;
    }

    setProcessing(true);
    try {
      let parsed: StatementParseResult;
      if (ext === 'csv') {
        parsed = normalizeStatementTable(parseCsv(await selectedFile.text()), selectedFile.name);
      } else if (ext === 'xlsx' || ext === 'xls') {
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(await selectedFile.arrayBuffer(), { type: 'array', cellDates: false });
        const first = workbook.SheetNames[0];
        if (!first) throw new Error('The spreadsheet contains no sheets.');
        parsed = normalizeStatementTable(XLSX.utils.sheet_to_json(workbook.Sheets[first], { header: 1, raw: false }) as unknown[][], selectedFile.name);
      } else {
        parsed = await parsePdf(selectedFile);
      }

      if (version !== parseVersion.current) return;

      if (parsed.ocrRequired) {
        setResult(parsed);
        setMessage('This PDF contains no selectable text (scanned document). You can run local on-device OCR below to extract transactions.');
        return;
      }
      if (parsed.mappingRequired && !parsed.rows.length) {
        setResult(parsed);
        setMessage('Could not automatically determine statement columns. Choose the header row and map columns below.');
        return;
      }

      const fileHash = file ? await hashFile(file) : null;
      if (fileHash) {
        const existingBatch = history.find((b) => b.source_sha256 === fileHash);
        if (existingBatch) {
          const dateStr = new Date(existingBatch.created_at).toLocaleDateString('en-IN');
          parsed.warnings.push(`This statement file has already been imported on ${dateStr} (Batch ${existingBatch.id.slice(0, 8)}). All rows are verified against your ledger to prevent duplicate entries.`);
        }
      }

      const ledger = await getExistingTransactions(userId);
      parsed.rows = enrichStatementRows(parsed.rows, ledger.rows, categories, userId, parsed.bank);
      if (!ledger.complete) {
        parsed.warnings.push('The complete server ledger could not be verified offline. Duplicate detection used transactions cached locally on this device.');
      }

      if (!parsed.rows.length) {
        setResult(parsed);
        setMessage('No transaction records could be extracted from this statement. Try exporting as CSV/Excel or mapping columns manually.');
        return;
      }

      setResult(parsed);
      setMessage(`${parsed.rows.length} transaction${parsed.rows.length === 1 ? '' : 's'} extracted. Review each entry before committing to your ledger.`);
    } catch (cause) {
      if (version !== parseVersion.current) return;
      const msg = cause instanceof Error ? cause.message : String(cause);
      if (msg.includes('Password') || msg.includes('encrypted') || msg.includes('password')) {
        setError('This PDF statement is password-protected or the password was incorrect. Enter its password above to decrypt locally.');
      } else if (msg.includes('Invalid PDF') || msg.includes('corrupted') || msg.includes('stream') || msg.includes('format')) {
        setError('The file could not be parsed as a valid statement. It may be corrupted or in an unsupported layout. Try exporting as CSV or Excel from your bank.');
      } else {
        setError(msg || 'Could not parse this statement. Try exporting as CSV or Excel.');
      }
    } finally {
      if (version === parseVersion.current) {
        setProcessing(false);
        setPassword('');
      }
    }
  }

  async function applyManualMapping() {
    if (!result?.sourceTable || !file) return;
    const selected = (key: string) => mappingColumns[key] === undefined || mappingColumns[key] === '' ? null : Number(mappingColumns[key]);
    const date = selected('date'), description = selected('description');
    if (!mappingHeaderIndex) { setError('Select the row containing column headings.'); return; }
    if (date === null || description === null) { setError('Please map both Transaction Date and Narration/Description columns.'); return; }
    if (selected('debit') === null && selected('credit') === null && selected('amount') === null) { setError('Map either Debit/Credit columns or a single Amount column.'); return; }

    const mapping: StatementColumnMapping = {
      headerIndex: Number(mappingHeaderIndex),
      date,
      valueDate: selected('valueDate'),
      description,
      debit: selected('debit'),
      credit: selected('credit'),
      amount: selected('amount'),
      type: selected('type'),
      reference: selected('reference'),
      balance: selected('balance'),
    };

    setProcessing(true);
    setError('');
    try {
      let parsed = normalizeStatementTable(result.sourceTable, file.name, mapping);
      if (parsed.ocrConfidence !== undefined) parsed = requireOcrReview(parsed, parsed.ocrConfidence);
      if (!parsed.rows.length) {
        setResult(parsed);
        setError(parsed.warnings[0] || 'No rows matched those column mappings. Please adjust and retry.');
        return;
      }
      const fileHash = file ? await hashFile(file) : null;
      if (fileHash) {
        const existingBatch = history.find((b) => b.source_sha256 === fileHash);
        if (existingBatch) {
          const dateStr = new Date(existingBatch.created_at).toLocaleDateString('en-IN');
          parsed.warnings.push(`This statement file has already been imported on ${dateStr} (Batch ${existingBatch.id.slice(0, 8)}). All rows are verified against your ledger to prevent duplicate entries.`);
        }
      }

      const ledger = await getExistingTransactions(userId);
      parsed.rows = enrichStatementRows(parsed.rows, ledger.rows, categories, userId, parsed.bank);
      if (!ledger.complete) {
        parsed.warnings.push('The complete server ledger could not be verified offline. Duplicate detection used transactions cached locally on this device.');
      }
      setResult(parsed);
      setMessage(`${parsed.rows.length} transaction${parsed.rows.length === 1 ? '' : 's'} extracted using column mapping. Review rows before importing.`);
    } catch (cause) {
      setError(sanitizeUserFacingError(cause, 'Could not parse with selected columns.'));
    } finally {
      setProcessing(false);
    }
  }

  async function parsePdf(pdfFile: File): Promise<StatementParseResult> {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
    const task = pdfjs.getDocument({ data: await pdfFile.arrayBuffer() });
    pdfTask.current = task;
    let encrypted = false;
    let autoTriedSessionPassword = false;

    task.onPassword = (updatePassword: PasswordCallback, reason: number) => {
      encrypted = true;
      if (sessionPasswordRef.current && !autoTriedSessionPassword && reason !== pdfjs.PasswordResponses.INCORRECT_PASSWORD) {
        autoTriedSessionPassword = true;
        updatePassword(sessionPasswordRef.current);
        return;
      }
      if (reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD) {
        sessionPasswordRef.current = null;
        setError('Incorrect PDF password. Please try again. Passwords are processed only in volatile memory on this device.');
      } else {
        setError('This PDF statement is encrypted. Enter its document password to unlock locally.');
      }
      passwordCallback.current = updatePassword;
      setPasswordRequired(true);
    };

    const pdf = await task.promise;
    setPasswordRequired(false);
    setError('');
    passwordCallback.current = null;

    const pagesItems: PdfTextItem[][] = [];
    let headingText = '';
    let selectableTextCount = 0;

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const pageItems: PdfTextItem[] = [];
      for (const item of content.items) {
        if (!item || !('str' in item) || typeof item.str !== 'string' || !item.str.trim()) continue;
        const [, , , , x, y] = item.transform;
        pageItems.push({
          text: item.str,
          x,
          y,
          width: (item as { width?: number }).width,
        });
        selectableTextCount += item.str.length;
      }
      pagesItems.push(pageItems);
      headingText += ` ${pageItems.slice(0, 15).map((it) => it.text).join(' ')}`;
    }

    if (!encrypted && pdf.numPages > 0) setPasswordRequired(false);
    await task.destroy();
    pdfTask.current = null;

    const table = extractTableFromPdfItems(pagesItems);
    const parsed = normalizeStatementTable(table, `${pdfFile.name} ${headingText}`);
    if (selectableTextCount === 0) {
      parsed.ocrRequired = true;
      parsed.warnings.push('This PDF contains no selectable text layer. Local OCR is available as an explicit review-only option.');
    }
    return parsed;
  }

  async function runLocalOcr() {
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) return;
    const version = parseVersion.current;
    setProcessing(true);
    setError('');
    setMessage('Initializing local OCR engine on this device…');
    setOcrProgress(0);

    let task: import('pdfjs-dist').PDFDocumentLoadingTask | null = null;
    let worker: Awaited<ReturnType<typeof import('tesseract.js').createWorker>> | null = null;
    let canvas: HTMLCanvasElement | null = null;

    try {
      const pdfjs = await import('pdfjs-dist');
      const tesseract = await import('tesseract.js');
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
      task = pdfjs.getDocument({ data: await file.arrayBuffer() });
      pdfTask.current = task;
      let autoTriedSessionPassword = false;

      task.onPassword = (updatePassword: PasswordCallback, reason: number) => {
        if (sessionPasswordRef.current && !autoTriedSessionPassword && reason !== pdfjs.PasswordResponses.INCORRECT_PASSWORD) {
          autoTriedSessionPassword = true;
          updatePassword(sessionPasswordRef.current);
          return;
        }
        if (reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD) {
          sessionPasswordRef.current = null;
          setError('Incorrect PDF password. Try again. Passwords remain in volatile memory.');
        } else {
          setError('Enter document password to decrypt locally for OCR.');
        }
        passwordCallback.current = updatePassword;
        setPasswordRequired(true);
      };

      const pdf = await task.promise;
      if (version !== parseVersion.current) return;
      if (pdf.numPages > 25) throw new Error('Local OCR is limited to 25 pages. Export a smaller statement range or use CSV/Excel.');

      setPasswordRequired(false);
      passwordCallback.current = null;

      worker = await tesseract.createWorker('eng+hin', tesseract.OEM.LSTM_ONLY, {
        workerPath: '/ocr/worker.min.js',
        corePath: '/ocr/tesseract-core-lstm.wasm.js',
        langPath: `${window.location.origin}/ocr/`,
        workerBlobURL: false,
        gzip: true,
        logger: (entry) => { if (Number.isFinite(entry.progress)) setOcrProgress(Math.round(entry.progress * 100)); },
      });
      await worker.setParameters({ preserve_interword_spaces: '1', user_defined_dpi: '180' });

      const lines: OcrLine[] = [];
      const pages: OcrCell[][][] = [];
      const headerText: string[] = [];

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        if (version !== parseVersion.current) return;
        setMessage(`Running local OCR on page ${pageNumber} of ${pdf.numPages}…`);
        const page = await pdf.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = Math.min(2.2, 2200 / Math.max(baseViewport.width, baseViewport.height));
        const viewport = page.getViewport({ scale });
        canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Could not prepare local OCR canvas. Try CSV or Excel export.');
        await page.render({ canvas, canvasContext: context, viewport }).promise;

        const { data } = await worker.recognize(canvas, {}, { blocks: true, text: true });
        const pageRows = new Map<number, Array<{ text: string; left: number; right: number; confidence: number }>>();
        for (const block of data.blocks || []) {
          for (const paragraph of block.paragraphs) {
            for (const line of paragraph.lines) {
              for (const word of line.words) {
                const rowKey = Math.round(((line.bbox.y0 + line.bbox.y1) / 2) / 8) * 8;
                const words = pageRows.get(rowKey) || [];
                words.push({ text: word.text, left: word.bbox.x0, right: word.bbox.x1, confidence: word.confidence });
                pageRows.set(rowKey, words);
              }
            }
          }
        }

        const threshold = viewport.width * 0.025;
        const orderedRows = [...pageRows.entries()].sort((a, b) => b[0] - a[0]).map(([, words]) => {
          const cells: OcrCell[] = [];
          const sorted = words.sort((a, b) => a.left - b.left);
          let group = [sorted[0]];
          for (const word of sorted.slice(1)) {
            if (word.left - group[group.length - 1].right > threshold) {
              cells.push({ text: group.map((item) => item.text).join(' '), center: (group[0].left + group[group.length - 1].right) / 2 });
              group = [word];
            } else group.push(word);
          }
          if (group.length) cells.push({ text: group.map((item) => item.text).join(' '), center: (group[0].left + group[group.length - 1].right) / 2 });
          const confidence = words.reduce((sum, word) => sum + word.confidence, 0) / words.length;
          lines.push({ text: cells.map((cell) => cell.text).join('   '), confidence });
          return cells;
        });
        pages.push(orderedRows);
        if (pageNumber === 1) headerText.push(...orderedRows.slice(0, 12).map((row) => row.map((cell) => cell.text).join(' ')));
        canvas.width = 0; canvas.height = 0; canvas = null;
        page.cleanup();
      }

      if (version !== parseVersion.current) return;
      const averageConfidence = lines.length ? lines.reduce((sum, line) => sum + line.confidence, 0) / lines.length : 0;
      let parsed = normalizeStatementTable(alignOcrRows(pages.flat()), `${file.name} ${headerText.slice(0, 20).join(' ')}`);
      parsed = requireOcrReview(parsed, averageConfidence);
      parsed.rows = parsed.rows.map((row) => {
        const rowIndex = Number(row.key.split('-', 1)[0]);
        const confidence = Math.round(lines[rowIndex]?.confidence ?? averageConfidence);
        const detail = `Local OCR row confidence ${confidence}%. Verify date, narration, amount and debit/credit direction.`;
        return { ...row, ocrConfidence: confidence, confidence: confidence >= 85 ? 'medium' : 'low', warning: detail };
      });

      const fileHash = file ? await hashFile(file) : null;
      if (fileHash) {
        const existingBatch = history.find((b) => b.source_sha256 === fileHash);
        if (existingBatch) {
          const dateStr = new Date(existingBatch.created_at).toLocaleDateString('en-IN');
          parsed.warnings.push(`This statement file has already been imported on ${dateStr} (Batch ${existingBatch.id.slice(0, 8)}). All rows are verified against your ledger to prevent duplicate entries.`);
        }
      }

      const ledger = await getExistingTransactions(userId);
      parsed.rows = enrichStatementRows(parsed.rows, ledger.rows, categories, userId, parsed.bank);
      if (!ledger.complete) {
        parsed.warnings.push('The complete server ledger could not be verified offline. Duplicate detection used transactions cached locally on this device.');
      }
      parsed.rows = parsed.rows.map((row) => ({ ...row, selected: false }));

      setResult(parsed);
      setMessage(parsed.rows.length
        ? `${parsed.rows.length} OCR rows extracted locally. All rows require manual review and remain unselected by default.`
        : 'OCR did not produce a recognizable transaction table. Export CSV or Excel, or record transactions manually.');
    } catch (cause) {
      if (version === parseVersion.current) setError(cause instanceof Error ? cause.message : 'Local OCR could not process this PDF. Export CSV or Excel and retry.');
    } finally {
      if (canvas) { canvas.width = 0; canvas.height = 0; }
      if (worker) await worker.terminate().catch(() => {});
      if (task) await task.destroy().catch(() => {});
      if (pdfTask.current === task) pdfTask.current = null;
      if (version === parseVersion.current) { setProcessing(false); setPassword(''); setOcrProgress(0); }
    }
  }

  function submitPassword(event: FormEvent) {
    event.preventDefault();
    if (!password || !passwordCallback.current) return;
    const pwd = password;
    if (rememberSessionPassword) {
      sessionPasswordRef.current = pwd;
    } else {
      sessionPasswordRef.current = null;
    }
    const callback = passwordCallback.current;
    callback(pwd);
    setPassword('');
    setError('');
  }

  function cancelPasswordPrompt() {
    setPasswordRequired(false);
    setPassword('');
    passwordCallback.current = null;
    if (pdfTask.current) {
      void pdfTask.current.destroy().catch(() => {});
      pdfTask.current = null;
    }
    setProcessing(false);
    setFile(null);
    setError('Statement decryption was cancelled. You can select another file or retry with the password.');
  }

  function updateRow(key: string, patch: Partial<ParsedStatementRow>) {
    setResult((current) => current ? { ...current, rows: current.rows.map((row) => row.key === key ? { ...row, ...patch } : row) } : current);
  }

  function selectAllRows(selected: boolean) {
    setResult((current) => {
      if (!current) return current;
      const targetKeys = new Set(toReviewRows.map((r) => r.key));
      return {
        ...current,
        rows: current.rows.map((row) => (targetKeys.has(row.key) ? { ...row, selected } : row)),
      };
    });
  }

  function selectNewOnly() {
    setResult((current) => {
      if (!current) return current;
      const targetKeys = new Set(toReviewRows.map((r) => r.key));
      return {
        ...current,
        rows: current.rows.map((row) => (targetKeys.has(row.key) ? { ...row, selected: true } : row)),
      };
    });
  }

  function confirmRowDate(key: string) {
    const chosenDate = dateCorrectionMap[key];
    if (!chosenDate) return;
    updateRow(key, {
      date: chosenDate,
      state: 'new',
      classification: 'new',
      selected: true,
      warning: undefined,
      exclusionReason: undefined,
    });
    setDateCorrectionMap((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function includeRowInReview(key: string) {
    updateRow(key, {
      state: 'new',
      classification: 'new',
      selected: true,
      includedAnyway: true,
      userSkipped: false,
      exclusionReason: undefined,
      warning: undefined,
    });
  }

  function permanentlySkipRow(key: string) {
    updateRow(key, {
      selected: false,
      userSkipped: true,
      state: 'skipped',
      exclusionReason: 'Permanently skipped by user',
    });
  }

  function skipReviewRow(key: string) {
    permanentlySkipRow(key);
  }

  function resolveAmbiguousDirection(key: string, nextType: 'income' | 'expense') {
    updateRow(key, {
      type: nextType,
      state: 'new',
      classification: 'new',
      selected: true,
      includedAnyway: true,
      userSkipped: false,
      exclusionReason: undefined,
      warning: undefined,
    });
  }

  function handleRememberMerchant(row: ParsedStatementRow, catId: string) {
    const cat = categories.find((c) => c.id === catId);
    if (!cat) return;
    const pattern = row.cleanMerchant || row.description;
    saveUserMerchantRule(userId, {
      pattern,
      cleanName: row.cleanMerchant || pattern,
      categoryId: cat.id,
      categoryName: cat.name,
      necessity: row.necessity ?? null,
    });
    setRememberedSuccessMsg(`Rule remembered! Transactions matching "${pattern}" will auto-categorize to ${cat.name}.`);
    setTimeout(() => setRememberedSuccessMsg(null), 4000);
    setRememberMerchantPrompt(null);

    // Apply rule immediately to other uncategorized rows in this parsed statement
    setResult((cur) => {
      if (!cur) return cur;
      return {
        ...cur,
        rows: cur.rows.map((r) => {
          if (r.key === row.key || r.categoryId) return r;
          const rPattern = r.cleanMerchant || r.description;
          if (rPattern.toLowerCase().includes(pattern.toLowerCase()) || pattern.toLowerCase().includes(rPattern.toLowerCase())) {
            return {
              ...r,
              categoryId: cat.id,
              necessity: r.type === 'expense' ? (r.necessity || (row.necessity ?? null)) : null,
            };
          }
          return r;
        }),
      };
    });
  }

  async function persistRemoteBatch(batch: StatementImportBatch, sourceFormat: StoredBatch['source_format'], parserId: string, sourceHash: string | null, importedCount: number) {
    const response = await fetch('/api/backend/financial/import-batches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        id: batch.id,
        account_id: null,
        source_name: safeSourceName(batch.source),
        source_format: sourceFormat,
        parser_id: parserId,
        parser_version: '1',
        statement_start: batch.statement_start || null,
        statement_end: batch.statement_end || null,
        opening_balance_paise: batch.opening_balance_paise || null,
        closing_balance_paise: batch.closing_balance_paise || null,
        source_sha256: sourceHash,
        status: batch.status,
        detected_count: batch.detected_count,
        imported_count: importedCount,
        skipped_count: Math.max(0, batch.detected_count - importedCount),
        duplicate_count: batch.duplicate_count ?? result?.rows.filter((row) => row.state === 'possible_duplicate').length ?? 0,
        discrepancy_count: batch.discrepancy_count ?? result?.rows.filter((row) => row.state === 'needs_review').length ?? 0,
        skipped_rows: batch.skipped_rows || [],
      }),
    });
    if (!response.ok) throw new Error('Could not record import batch on your account. Retrying offline.');
  }

  async function retryBatchSync(target: StatementImportBatch) {
    setRetryingBatchId(target.id);
    setError('');
    try {
      if (target.source_format && target.parser_id) {
        await persistRemoteBatch(target, target.source_format, target.parser_id, target.source_sha256 || null, target.imported_ids.length).catch(() => {});
      }
      await syncEngine.retryFailedMutations(userId);
      await syncEngine.processQueue(userId);
      const pending = (await getPendingMutations(userId)).filter((mutation) => target.imported_ids.includes(mutation.entityId));
      const updated = { ...target };
      await saveStatementImportBatch(updated);
      const syncedCount = Math.max(0, target.imported_ids.length - pending.length);
      if (updated.source_format && updated.parser_id) {
        await persistRemoteBatch(updated, updated.source_format, updated.parser_id, updated.source_sha256 || null, syncedCount).catch(() => {});
      }
      const updatedHistory = history.map((item) => item.id === target.id ? updated : item);
      setHistory(updatedHistory);
      void refreshPendingCounts(updatedHistory);
      setMessage(pending.length ? `${syncedCount} of ${target.imported_ids.length} synced; ${pending.length} transaction${pending.length === 1 ? '' : 's'} still pending synchronization.` : 'All rows in this batch are synchronized to cloud.');
    } catch (cause) {
      setError(sanitizeUserFacingError(cause, 'Could not synchronize statement batch.'));
    } finally {
      setRetryingBatchId(null);
    }
  }

  async function importSelected() {
    if (!result || !selectedRows.length) return;
    const categoriesById = new Map(categories.map((category) => [category.id, category]));

    setImporting(true);
    setError('');
    const batchId = uuidv7();
    const importedIds: string[] = [];
    const importedRowKeys = new Set<string>();
    const sourceFormat = (file?.name.toLowerCase().split('.').pop() || 'pdf') as StoredBatch['source_format'];
    const sourceHash = file ? await hashFile(file) : null;

    const batchRecord: StatementImportBatch = {
      id: batchId,
      user_id: userId,
      source: file ? safeSourceName(file.name) : 'Statement',
      created_at: new Date().toISOString(),
      imported_ids: [],
      detected_count: result.rows.length,
      status: 'processing',
      account_id: null,
      statement_start: result.period?.start || null,
      statement_end: result.period?.end || null,
      opening_balance_paise: result.openingBalancePaise || null,
      closing_balance_paise: result.closingBalancePaise || null,
      parser_id: result.adapterId,
      source_format: sourceFormat,
      source_sha256: sourceHash,
      duplicate_count: result.rows.filter((row) => row.state === 'possible_duplicate').length,
      discrepancy_count: result.rows.filter((row) => row.state === 'needs_review').length,
      skipped_rows: [],
    };

    try {
      await saveStatementImportBatch(batchRecord);
      await persistRemoteBatch(batchRecord, sourceFormat, result.adapterId, sourceHash, 0).catch(() => {});

      for (const row of selectedRows) {
        const category = row.categoryId ? categoriesById.get(row.categoryId) : undefined;
        const categorySuggestion = suggestCategory(row.description, categories, row.type);
        if (category && categorySuggestion && categorySuggestion.category.id !== category.id) {
          await recordCategoryCorrection(userId, merchantFingerprint(row.description), category.id);
        }

        const necessity = row.type === 'expense' ? (row.necessity || null) : null;

        const response: CreateTransactionResponse = await syncEngine.createTransactionLocalFirst({
          id: uuidv7(),
          amount: row.amount,
          type: row.type,
          category_id: category ? category.id : null,
          transaction_date: row.date,
          payment_method: row.paymentMethod,
          necessity,
          description: (row.description || 'Unspecified Transaction').slice(0, 500),
          notes: `Statement import · ${result.bank}${row.reference ? ` · ref ${row.reference}` : ''} · batch ${batchId.slice(0, 8)}`,
          account_id: null,
          import_batch_id: batchId,
          statement_reference: row.reference,
          ingestion_source: 'bank_statement',
          parser_version: `${result.adapterId}:1`,
          category_verified: Boolean(category),
          categorization_method: category
            ? categorySuggestion
              ? categorySuggestion.category.id === category.id ? categorySuggestion.method : 'user_correction'
              : 'manual'
            : 'manual',
          category_suggestion_confidence: categorySuggestion?.confidence ?? null,
          category_evidence: categorySuggestion ? [...categorySuggestion.evidence] : [],
          category_was_corrected: Boolean(category && categorySuggestion && categorySuggestion.category.id !== category.id),
          categorization_model_version: categorySuggestion?.method === 'weak_supervision' ? 'weak-label-rules-v1' : null,
        }, categories, userId);

        importedIds.push(response.transaction.id);
        importedRowKeys.add(row.key);
        updateRow(row.key, { state: 'imported', selected: false, warning: 'Added to consolidated ledger.' });
        batchRecord.imported_ids = [...importedIds];
        await saveStatementImportBatch(batchRecord);
      }

      batchRecord.imported_ids = [...importedIds];
      batchRecord.skipped_rows = skippedRowsForImport(result.rows, importedRowKeys);
      await saveStatementImportBatch(batchRecord);

      await syncEngine.processQueue(userId);
      const pendingForBatch = (await getPendingMutations(userId)).filter((mutation) => importedIds.includes(mutation.entityId));
      const syncedCount = Math.max(0, importedIds.length - pendingForBatch.length);
      batchRecord.status = 'completed';
      await saveStatementImportBatch(batchRecord);
      await persistRemoteBatch(batchRecord, sourceFormat, result.adapterId, sourceHash, syncedCount).catch(() => {});

      const updatedHistory = [batchRecord, ...history.filter((item) => item.id !== batchId)];
      setHistory(updatedHistory);
      void refreshPendingCounts(updatedHistory);
      setSectionImportedOpen(true);
      setMessage(pendingForBatch.length
        ? `${syncedCount} of ${importedIds.length} transactions synced; ${pendingForBatch.length} saved locally and queued for cloud sync. Batch ${batchId.slice(0, 8)}.`
        : `Successfully imported ${importedIds.length} transactions into your consolidated ledger. Batch ${batchId.slice(0, 8)}.`);
      onImported(importedIds.length);
    } catch {
      setError(`${importedIds.length} of ${selectedRows.length} transactions were added before an interruption. Successfully added rows remain in your ledger.`);
      batchRecord.status = importedIds.length > 0 ? 'completed' : 'partial';
      batchRecord.imported_ids = [...importedIds];
      batchRecord.skipped_rows = skippedRowsForImport(result.rows, importedRowKeys);
      await saveStatementImportBatch(batchRecord);
      await persistRemoteBatch(batchRecord, sourceFormat, result.adapterId, sourceHash, importedIds.length).catch(() => {});
      const updatedHistory = [batchRecord, ...history.filter((item) => item.id !== batchId)];
      setHistory(updatedHistory);
      void refreshPendingCounts(updatedHistory);
    } finally {
      setImporting(false);
    }
  }

  async function undoBatchFor(target: StatementImportBatch) {
    if (!navigator.onLine) {
      setError('An active internet connection is required to safely undo a statement batch.');
      return;
    }
    setError('');
    try {
      const response = await fetch(`/api/backend/financial/import-batches/${target.id}/undo`, { method: 'POST' });
      const data = await response.json() as { success?: boolean; removed_count?: number; error?: string };
      if (!response.ok || !data.success) throw new Error(data.error || 'The statement batch could not be undone.');

      // Remove any pending create mutations for this batch before local deletion
      const pending = await getPendingMutations(userId);
      for (const mutation of pending) {
        if (target.imported_ids.includes(mutation.entityId)) {
          await removePendingMutation(mutation.id).catch(() => {});
        }
      }

      for (const id of target.imported_ids) {
        try { await syncEngine.deleteTransactionLocalFirst(id, userId); } catch { /* Local deletion fallback */ }
      }
      await syncEngine.processQueue(userId);
      const updated = { ...target, status: 'undone' as const };
      await saveStatementImportBatch(updated);
      const updatedHistory = history.map((item) => item.id === target.id ? updated : item);
      setHistory(updatedHistory);
      void refreshPendingCounts(updatedHistory);
      setConfirmUndoId(null);
      setMessage(`${data.removed_count || target.imported_ids.length} transactions were removed from your ledger.`);
      onImported(data.removed_count || target.imported_ids.length);
    } catch (cause) {
      setError(sanitizeUserFacingError(cause, 'The statement batch could not be undone.'));
    }
  }

  // Drag and drop handlers
  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) void readFile(droppedFile);
  }

  const inputClass = 'w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:outline-hidden focus:border-[var(--action-primary-bg)] focus:ring-1 focus:ring-[var(--action-primary-bg)]';
  const mappingHeaderCells = result?.sourceTable?.[Number(mappingHeaderIndex)] || [];

  return (
    <section className="space-y-5">
      {/* 1. INITIAL UPLOAD VIEW OR ACTIVE FILE HEADER */}
      {!result ? (
        <div className="space-y-4">
          {/* Upload Area */}
          <div
            onDragOver={handleDragOver}
            onDragEnter={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex flex-col items-center justify-center p-8 sm:p-10 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
              isDragging
                ? 'border-[var(--action-primary-bg)] bg-[var(--action-primary-bg)]/5 ring-4 ring-[var(--action-primary-bg)]/10'
                : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-subtle)] hover:border-[var(--border-strong)]'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.csv,.xlsx,.xls"
              className="hidden"
              onChange={(event) => {
                const picked = event.target.files?.[0];
                if (picked) void readFile(picked);
              }}
            />
            <div className="w-12 h-12 mb-3 rounded-full bg-[var(--bg-canvas)] border border-[var(--border-hairline)] flex items-center justify-center text-xl text-[var(--text-secondary)]">
              📄
            </div>
            <p className="text-sm font-semibold text-[var(--text-primary)] text-center">
              {file ? file.name : 'Select or drag your bank statement here'}
            </p>
            <p className="mt-1 text-xs text-[var(--text-secondary)] text-center max-w-sm">
              Supports PDF, CSV, XLSX, or XLS statements up to 30 MB. All parsing occurs directly on this device.
            </p>

            {/* Supported Formats Pills */}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5 text-[11px] font-mono text-[var(--text-muted)]">
              <span className="px-2 py-0.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-hairline)]">PDF</span>
              <span className="px-2 py-0.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-hairline)]">CSV</span>
              <span className="px-2 py-0.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-hairline)]">XLSX</span>
              <span className="px-2 py-0.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-hairline)]">XLS</span>
            </div>
          </div>

          {/* Privacy & Security Guarantee Banner */}
          <div className="flex items-start gap-2.5 p-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] text-xs text-[var(--text-secondary)]">
            <span className="text-sm shrink-0">🔒</span>
            <div className="space-y-0.5">
              <p className="font-medium text-[var(--text-primary)]">Strict Local Privacy</p>
              <p>
                Statements are parsed in volatile browser memory. Passwords, extracted transactions, and balances are never uploaded or retained by SpendSense.
              </p>
            </div>
          </div>

          {/* Conditional PDF Password Input */}
          {passwordRequired && (
            <form onSubmit={submitPassword} className="rounded-xl border border-amber-300/60 bg-amber-500/5 p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">🔐</span>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">Encrypted PDF Statement</h3>
                </div>
                <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                  Password required
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Indian bank statements are password-protected (e.g. uppercase PAN, Date of Birth). Decryption occurs exclusively on this device.
              </p>
              <div className="space-y-2">
                <label className="block text-xs font-medium text-[var(--text-primary)]">
                  Document Password
                  <div className="mt-1 flex gap-2">
                    <input
                      className={inputClass}
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="off"
                      placeholder="Enter statement password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="px-3 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>
                <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberSessionPassword}
                    onChange={(e) => setRememberSessionPassword(e.target.checked)}
                    className="rounded border-[var(--border-subtle)]"
                  />
                  <span>Remember in browser memory for this session (auto-unlocks same-password statements until tab close)</span>
                </label>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="submit"
                  className="rounded-md bg-[var(--action-primary-bg)] px-4 py-2 text-xs font-medium text-[var(--action-primary-fg)] hover:bg-[var(--action-primary-hover)] transition-colors cursor-pointer"
                >
                  Unlock Locally
                </button>
                <button
                  type="button"
                  onClick={cancelPasswordPrompt}
                  className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Processing Indicator */}
          {processing && (
            <div className="flex items-center gap-3 p-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-sm text-[var(--text-secondary)]">
              <div className="w-4 h-4 border-2 border-[var(--action-primary-bg)] border-t-transparent rounded-full animate-spin shrink-0" />
              <span>{ocrProgress > 0 ? `Local OCR in progress: ${ocrProgress}%…` : 'Reading and parsing statement on this device…'}</span>
            </div>
          )}

          {/* Error & Message Alerts */}
          {error && (
            <div role="alert" className="p-3.5 rounded-lg border border-red-300/50 bg-red-50/50 dark:bg-red-950/20 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}
          {message && !error && (
            <div role="status" className="p-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-xs text-[var(--text-secondary)]">
              {message}
            </div>
          )}
        </div>
      ) : (
        /* 2. STATEMENT REVIEW WORKFLOW */
        <div className="space-y-4">
          {/* Active File Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)]">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-lg shrink-0">📄</span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate max-w-xs sm:max-w-md">
                    {file?.name || 'Statement'}
                  </h3>
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 shrink-0">
                    {result.bank}
                  </span>
                </div>
                {result.period && (
                  <p className="text-xs text-[var(--text-secondary)] truncate">
                    Period: {result.period.start} to {result.period.end}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setFile(null);
                setError('');
                setMessage('');
              }}
              className="px-3 py-1.5 text-xs font-medium border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-md transition-colors cursor-pointer"
            >
              Choose different file
            </button>
          </div>

          {/* Scanned PDF Prompt */}
          {result.ocrRequired && (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-2">
              <h4 className="text-sm font-semibold text-[var(--text-primary)]">Scanned PDF Detected</h4>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                This document contains scanned images without a selectable text layer. You can run local on-device OCR using bundled English and Hindi models. Extracted rows will remain unselected for careful review.
              </p>
              <button
                type="button"
                disabled={processing}
                onClick={() => void runLocalOcr()}
                className="mt-2 rounded-md bg-[var(--action-primary-bg)] px-3.5 py-2 text-xs font-medium text-[var(--action-primary-fg)] disabled:opacity-50 cursor-pointer"
              >
                {processing ? 'Processing OCR…' : 'Run Local OCR'}
              </button>
            </div>
          )}

          {/* Metric Summary Cards */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3">
              <div className="text-[11px] text-[var(--text-muted)]">Detected</div>
              <div className="mt-0.5 text-base font-bold text-[var(--text-primary)]">{result.rows.length}</div>
            </div>
            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3">
              <div className="text-[11px] text-[var(--text-muted)]">Selected to Add</div>
              <div className="mt-0.5 text-base font-bold text-emerald-600 dark:text-emerald-400">{selectedRows.length}</div>
            </div>
            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3">
              <div className="text-[11px] text-[var(--text-muted)]">New Records</div>
              <div className="mt-0.5 text-base font-bold text-[var(--text-primary)]">{summary?.newCount ?? 0}</div>
            </div>
            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3">
              <div className="text-[11px] text-[var(--text-muted)]">Already on File</div>
              <div className="mt-0.5 text-base font-bold text-slate-500">{totals.alreadyRecorded}</div>
            </div>
            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3">
              <div className="text-[11px] text-[var(--text-muted)]">Duplicates / Review</div>
              <div className="mt-0.5 text-base font-bold text-amber-600 dark:text-amber-400">{totals.duplicates + totals.review}</div>
            </div>
            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3">
              <div className="text-[11px] text-[var(--text-muted)]">Total Flow</div>
              <div className="mt-0.5 text-xs font-semibold text-[var(--text-primary)] truncate">
                -{formatPaiseToINR(totals.debits)} / +{formatPaiseToINR(totals.credits)}
              </div>
            </div>
          </div>

          {/* Standalone Statement Balance & Reconciliation Card */}
          <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 sm:p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-hairline)] pb-3">
              <div className="flex items-center gap-2">
                <span className="text-base">⚖️</span>
                <h4 className="text-sm font-semibold text-[var(--text-primary)]">Statement Balance &amp; Reconciliation</h4>
              </div>
              {summary?.isReconciled !== null && summary?.isReconciled !== undefined && (
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  summary.isReconciled
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                }`}>
                  {summary.isReconciled ? '✓ Reconciled (Difference: ₹0.00)' : `Discrepancy: ${formatPaiseToINR(BigInt(summary.reconciliationDifferencePaise || 0))}`}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="space-y-0.5">
                <span className="text-[var(--text-muted)]">Opening Balance</span>
                <p className="font-mono font-semibold text-[var(--text-primary)]">
                  {result.openingBalancePaise ? formatPaiseToINR(BigInt(result.openingBalancePaise)) : 'Not detected'}
                </p>
              </div>
              <div className="space-y-0.5">
                <span className="text-[var(--text-muted)]">Total Withdrawals (Debits)</span>
                <p className="font-mono font-semibold text-rose-600 dark:text-rose-400">
                  -{formatPaiseToINR(totals.debits)}
                </p>
              </div>
              <div className="space-y-0.5">
                <span className="text-[var(--text-muted)]">Total Deposits (Credits)</span>
                <p className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                  +{formatPaiseToINR(totals.credits)}
                </p>
              </div>
              <div className="space-y-0.5">
                <span className="text-[var(--text-muted)]">Closing Balance</span>
                <p className="font-mono font-semibold text-[var(--text-primary)]">
                  {result.closingBalancePaise ? formatPaiseToINR(BigInt(result.closingBalancePaise)) : 'Not detected'}
                </p>
              </div>
            </div>

            <p className="text-[11px] text-[var(--text-secondary)] bg-[var(--bg-surface-subtle)] p-2.5 rounded-md border border-[var(--border-hairline)] leading-relaxed">
              <strong className="text-[var(--text-primary)]">Financial Integrity Notice:</strong> Opening and closing statement balances are verified solely for reconciliation math. They are never imported as ledger transactions. Only individual debit and credit movements are committed.
            </p>
          </section>

          {/* Warnings List */}
          {result.warnings.length > 0 && (
            <ul className="list-disc pl-5 text-xs text-amber-700 dark:text-amber-300 space-y-0.5">
              {result.warnings.slice(0, 5).map((w, idx) => <li key={idx}>{w}</li>)}
            </ul>
          )}

          {/* Optional Column Mapping Card */}
          {result.mappingRequired && result.sourceTable && (
            <fieldset className="rounded-xl border border-[var(--border-subtle)] p-4 space-y-3">
              <legend className="px-1 text-xs font-semibold text-[var(--text-primary)]">Map Statement Columns</legend>
              <p className="text-xs text-[var(--text-secondary)]">
                Identify the header row and map the respective columns. Transactions will re-extract and deduplicate against your ledger.
              </p>
              <label className="block max-w-xl text-xs font-medium text-[var(--text-primary)]">
                Header row
                <select className={`${inputClass} mt-1`} value={mappingHeaderIndex} onChange={(event) => { setMappingHeaderIndex(event.target.value); setMappingColumns({}); }}>
                  <option value="">Select header row</option>
                  {result.sourceTable.slice(0, 20).map((row, index) => (
                    <option value={index} key={index}>Row {index + 1}: {row.slice(0, 5).join(' · ').slice(0, 80)}</option>
                  ))}
                </select>
              </label>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {MAPPING_FIELDS.map(([key, label]) => (
                  <label key={key} className="text-[11px] text-[var(--text-muted)]">
                    {label}
                    <select className={`${inputClass} mt-0.5`} value={mappingColumns[key] || ''} onChange={(event) => setMappingColumns((current) => ({ ...current, [key]: event.target.value }))}>
                      <option value="">Not mapped</option>
                      {mappingHeaderCells.map((heading, index) => (
                        <option value={index} key={`${index}-${heading}`}>Column {index + 1}: {heading || '(blank)'}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <button
                type="button"
                disabled={processing}
                onClick={() => void applyManualMapping()}
                className="rounded-md bg-[var(--action-primary-bg)] px-3.5 py-2 text-xs font-medium text-[var(--action-primary-fg)] disabled:opacity-50 cursor-pointer"
              >
                {processing ? 'Parsing…' : 'Apply Mapping & Review'}
              </button>
            </fieldset>
          )}

          {/* Four-Section Unified Review Workflow */}
          <div className="space-y-4">
            {/* Remembered Rule Notification Banner */}
            {rememberedSuccessMsg && (
              <div className="p-3 rounded-lg bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs flex items-center justify-between">
                <span>✓ {rememberedSuccessMsg}</span>
                <button type="button" onClick={() => setRememberedSuccessMsg(null)} className="text-xs cursor-pointer font-bold ml-2">✕</button>
              </div>
            )}

            {/* Overall Statement Progress & Search Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-[var(--text-primary)]">Statement Sections:</span>
                <button
                  type="button"
                  onClick={() => setSectionReviewOpen(!sectionReviewOpen)}
                  className="px-2.5 py-1 rounded-md bg-[var(--action-primary-bg)]/10 text-[var(--action-primary-bg)] font-semibold hover:bg-[var(--action-primary-bg)]/20 transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <span>Section A — To Review</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)]">
                    {toReviewRows.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setSectionImportedOpen(!sectionImportedOpen)}
                  className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <span>Section B — Imported</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-emerald-600 text-white">
                    {importedRows.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setSectionAlreadyInLedgerOpen(!sectionAlreadyInLedgerOpen)}
                  className="px-2.5 py-1 rounded-md bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 font-semibold hover:bg-sky-100 dark:hover:bg-sky-900/40 transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <span>Section C — Already in Ledger</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-sky-600 text-white">
                    {alreadyInLedgerRows.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setSectionAttentionOpen(!sectionAttentionOpen)}
                  className="px-2.5 py-1 rounded-md bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <span>Section D — Skipped &amp; Needs Attention</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-600 text-white">
                    {attentionRows.length}
                  </span>
                </button>
              </div>
              <div className="w-full sm:w-64">
                <input
                  type="text"
                  placeholder="Filter across all sections…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            {/* SECTION A — TO REVIEW */}
            <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5 border-b border-[var(--border-hairline)] bg-[var(--bg-surface)]">
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setSectionReviewOpen(!sectionReviewOpen)}
                    className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-bold text-sm cursor-pointer"
                    aria-label={sectionReviewOpen ? 'Collapse Section A' : 'Expand Section A'}
                  >
                    {sectionReviewOpen ? '▼' : '▶'}
                  </button>
                  <h3 className="text-sm sm:text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <span>Section A — To Review</span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--action-primary-bg)]/15 text-[var(--action-primary-bg)]">
                      {toReviewRows.length}
                    </span>
                  </h3>
                </div>

                <button
                  type="button"
                  disabled={importing || !selectedRows.length}
                  onClick={() => void importSelected()}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--action-primary-bg)] px-5 py-2 text-xs sm:text-sm font-bold text-[var(--action-primary-fg)] hover:bg-[var(--action-primary-hover)] transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {importing ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      <span>Importing {selectedRows.length} transactions…</span>
                    </>
                  ) : (
                    <span>Import Selected ({selectedRows.length}) Transactions · {formatPaiseToINR(selectedTotalPaise)}</span>
                  )}
                </button>
              </div>

              {sectionReviewOpen && (
              <div className="space-y-3">
                <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
                  <div className="text-xs text-[var(--text-secondary)]">
                    Review and confirm uncommitted transactions. Categories and necessity are optional.
                  </div>
                  <div className="w-full md:w-64">
                    <input
                      type="text"
                      placeholder="Filter by description, merchant, amount…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>

                {/* Selection Shortcuts */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-[var(--text-muted)] border-t border-[var(--border-hairline)]">
                  <div className="flex items-center gap-2">
                    <span>Select:</span>
                    <button
                      type="button"
                      onClick={() => selectAllRows(true)}
                      className="text-[var(--action-primary-bg)] hover:underline cursor-pointer font-medium"
                    >
                      Select all ({toReviewRows.length})
                    </button>
                    <span>·</span>
                    <button
                      type="button"
                      onClick={selectNewOnly}
                      className="text-[var(--action-primary-bg)] hover:underline cursor-pointer font-medium"
                    >
                      Select new only
                    </button>
                    <span>·</span>
                    <button
                      type="button"
                      onClick={() => selectAllRows(false)}
                      className="text-[var(--text-secondary)] hover:underline cursor-pointer"
                    >
                      Deselect all
                    </button>
                  </div>
                  <span>Showing {filteredRows.length} of {toReviewRows.length} rows to review</span>
                </div>

                {toReviewRows.length === 0 ? (
                  <div className="p-8 text-center text-xs text-[var(--text-muted)] border border-dashed border-[var(--border-hairline)] rounded-lg space-y-1">
                    <p className="font-semibold text-[var(--text-primary)]">No uncommitted transactions to review.</p>
                    <p>All extracted transactions have either been committed to your Ledger (Section B) or placed in Section C for attention.</p>
                  </div>
                ) : filteredRows.length === 0 ? (
                  <div className="p-8 text-center text-xs text-[var(--text-muted)] border border-dashed border-[var(--border-hairline)] rounded-lg">
                    No transactions match the search filter.
                  </div>
                ) : (
                  <>
                    {/* Desktop Review Table */}
                    <div className="hidden md:block overflow-x-auto rounded-lg border border-[var(--border-hairline)]">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] border-b border-[var(--border-hairline)]">
                          <tr>
                            <th className="py-2.5 px-3 w-10 text-center">
                              <input
                                type="checkbox"
                                checked={filteredRows.length > 0 && filteredRows.every((r) => r.selected)}
                                onChange={(e) => {
                                  const check = e.target.checked;
                                  setResult((curr) => curr ? {
                                    ...curr,
                                    rows: curr.rows.map((r) => filteredRows.some((fr) => fr.key === r.key) ? { ...r, selected: check } : r),
                                  } : curr);
                                }}
                                aria-label="Select all filtered rows"
                                className="h-4 w-4 rounded border-[var(--border-subtle)] text-[var(--action-primary-bg)] focus:ring-[var(--action-primary-bg)] cursor-pointer"
                              />
                            </th>
                            <th className="py-2.5 px-3 w-28 font-medium">Date</th>
                            <th className="py-2.5 px-3 font-medium">Merchant / Counterparty</th>
                            <th className="py-2.5 px-3 w-24 text-center font-medium">Channel</th>
                            <th className="py-2.5 px-3 w-24 text-center font-medium">Direction</th>
                            <th className="py-2.5 px-3 w-32 text-right font-medium">Amount</th>
                            <th className="py-2.5 px-3 w-40 font-medium">Category (Optional)</th>
                            <th className="py-2.5 px-3 w-16 text-center font-medium">Details</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-hairline)]">
                          {filteredRows.map((row) => {
                            const isExpanded = expandedRowKeys.has(row.key);
                            const category = categories.find((c) => c.id === row.categoryId);
                            return (
                              <Fragment key={row.key}>
                                <tr className={`transition-colors hover:bg-[var(--bg-surface-subtle)] ${row.selected ? 'bg-[var(--bg-surface)]' : 'bg-[var(--bg-canvas)] opacity-80'}`}>
                                  <td className="py-2.5 px-3 text-center align-top">
                                    <input
                                      type="checkbox"
                                      checked={row.selected}
                                      onChange={(e) => updateRow(row.key, { selected: e.target.checked })}
                                      aria-label={`Select ${row.description || 'transaction'}`}
                                      className="h-4 w-4 rounded border-[var(--border-subtle)] text-[var(--action-primary-bg)] focus:ring-[var(--action-primary-bg)] cursor-pointer"
                                    />
                                  </td>
                                  <td className="py-2.5 px-3 font-mono text-[var(--text-secondary)] align-top whitespace-nowrap">
                                    {row.date}
                                  </td>
                                  <td className="py-2.5 px-3 align-top min-w-0 max-w-sm lg:max-w-md">
                                    <div className="font-semibold text-[var(--text-primary)] leading-tight" title={row.description || ''}>
                                      {row.cleanMerchant || row.description || 'Unspecified Transaction'}
                                    </div>
                                    {row.cleanMerchant && row.cleanMerchant !== row.description && (
                                      <p className="text-[10px] text-[var(--text-muted)] line-clamp-1 mt-0.5" title={row.description}>
                                        {row.description}
                                      </p>
                                    )}
                                    <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[10px] text-[var(--text-muted)]">
                                      {row.reference && (
                                        <span className="font-mono bg-[var(--bg-surface-subtle)] px-1.5 py-0.5 rounded border border-[var(--border-hairline)]">
                                          Ref: {row.reference}
                                        </span>
                                      )}
                                      {row.valueDate && <span>Value: {row.valueDate}</span>}
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3 align-top text-center whitespace-nowrap">
                                    <Badge variant={row.paymentMethod === 'upi' ? 'upi' : row.paymentMethod === 'online' ? 'online' : 'cash'} size="xs">
                                      {row.paymentMethod === 'upi' ? 'UPI' : row.paymentMethod === 'online' ? 'Online' : 'Cash'}
                                    </Badge>
                                  </td>
                                  <td className="py-2.5 px-3 align-top text-center whitespace-nowrap">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                      row.type === 'expense'
                                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                    }`}>
                                      {row.type === 'expense' ? 'Expense' : 'Income'}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 align-top text-right font-mono font-semibold whitespace-nowrap">
                                    <span className={row.type === 'expense' ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}>
                                      {row.type === 'expense' ? '-' : '+'}₹{row.amount}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 align-top">
                                    <select
                                      className="w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2 py-1 text-xs text-[var(--text-primary)]"
                                      value={row.categoryId || ''}
                                      onChange={(event) => {
                                        const nextCatId = event.target.value;
                                        updateRow(row.key, { categoryId: nextCatId });
                                        if (nextCatId) {
                                          const cat = categories.find((c) => c.id === nextCatId);
                                          if (cat) {
                                            setRememberMerchantPrompt({
                                              rowKey: row.key,
                                              merchantPattern: row.cleanMerchant || row.description,
                                              categoryId: nextCatId,
                                              categoryName: cat.name,
                                            });
                                          }
                                        } else {
                                          setRememberMerchantPrompt(null);
                                        }
                                      }}
                                    >
                                      <option value="">Uncategorized</option>
                                      {categories.filter((c) => c.type === row.type && !c.archived_at).map((c) => (
                                        <option value={c.id} key={c.id}>{c.name}</option>
                                      ))}
                                    </select>
                                    {rememberMerchantPrompt?.rowKey === row.key && (
                                      <div className="mt-1 p-1.5 rounded bg-[var(--action-primary-bg)]/10 border border-[var(--action-primary-bg)]/20 text-[10px] space-y-1">
                                        <span className="block text-[var(--text-primary)]">
                                          Remember <strong>{rememberMerchantPrompt.categoryName}</strong> for future imports of &quot;{rememberMerchantPrompt.merchantPattern.slice(0, 30)}&quot;?
                                        </span>
                                        <div className="flex items-center gap-1.5">
                                          <button
                                            type="button"
                                            onClick={() => handleRememberMerchant(row, rememberMerchantPrompt.categoryId)}
                                            className="px-2 py-0.5 rounded bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] font-medium text-[9px] cursor-pointer"
                                          >
                                            Remember
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setRememberMerchantPrompt(null)}
                                            className="text-[9px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                                          >
                                            Dismiss
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 align-top text-center whitespace-nowrap">
                                    <button
                                      type="button"
                                      onClick={() => toggleRowExpand(row.key)}
                                      className="px-2 py-1 rounded text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] transition-colors cursor-pointer"
                                      aria-label={isExpanded ? 'Hide transaction details' : 'View or edit transaction details'}
                                    >
                                      {isExpanded ? 'Hide ▲' : 'Details ▼'}
                                    </button>
                                  </td>
                                </tr>
                                {isExpanded && (
                                  <tr className="bg-[var(--bg-surface-subtle)]">
                                    <td colSpan={8} className="p-4 border-t border-[var(--border-hairline)]">
                                      <div className="space-y-3">
                                        <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
                                          <label className="text-[10px] font-medium text-[var(--text-muted)]">
                                            Date
                                            <input
                                              className={`${inputClass} mt-0.5`}
                                              type="date"
                                              value={row.date}
                                              onChange={(event) => updateRow(row.key, { date: event.target.value })}
                                            />
                                          </label>
                                          <label className="text-[10px] font-medium text-[var(--text-muted)] sm:col-span-2">
                                            Description / Narration
                                            <input
                                              className={`${inputClass} mt-0.5`}
                                              value={row.description || ''}
                                              onChange={(event) => updateRow(row.key, { description: event.target.value })}
                                            />
                                          </label>
                                          <label className="text-[10px] font-medium text-[var(--text-muted)]">
                                            Amount (₹)
                                            <input
                                              className={`${inputClass} mt-0.5 font-mono`}
                                              inputMode="decimal"
                                              value={row.amount || ''}
                                              onChange={(event) => {
                                                const value = event.target.value;
                                                try {
                                                  const paise = Number(parseINRToPaise(value));
                                                  updateRow(row.key, { amount: value, amountPaise: paise });
                                                } catch {
                                                  updateRow(row.key, { amount: value });
                                                }
                                              }}
                                            />
                                          </label>
                                          <label className="text-[10px] font-medium text-[var(--text-muted)]">
                                            Direction
                                            <select
                                              className={`${inputClass} mt-0.5`}
                                              value={row.type}
                                              onChange={(event) => {
                                                const nextType = event.target.value as 'income' | 'expense';
                                                updateRow(row.key, {
                                                  type: nextType,
                                                  categoryId: categories.find((c) => c.type === nextType && !c.archived_at)?.id || '',
                                                  necessity: nextType === 'expense' ? (row.necessity || null) : null,
                                                });
                                              }}
                                            >
                                              <option value="expense">Expense</option>
                                              <option value="income">Income</option>
                                            </select>
                                          </label>
                                          <label className="text-[10px] font-medium text-[var(--text-muted)]">
                                            Necessity (Optional)
                                            {row.type === 'expense' ? (
                                              <select
                                                className={`${inputClass} mt-0.5`}
                                                value={row.necessity || ''}
                                                onChange={(event) => updateRow(row.key, { necessity: (event.target.value as 'essential' | 'optional' | 'luxury') || null })}
                                              >
                                                <option value="">Unclassified</option>
                                                <option value="essential">Essential</option>
                                                <option value="optional">Optional</option>
                                                <option value="luxury">Luxury</option>
                                              </select>
                                            ) : (
                                              <input
                                                className={`${inputClass} mt-0.5 opacity-50 cursor-not-allowed`}
                                                disabled
                                                value="—"
                                              />
                                            )}
                                          </label>
                                          <label className="text-[10px] font-medium text-[var(--text-muted)]">
                                            Channel
                                            <select
                                              className={`${inputClass} mt-0.5`}
                                              value={row.paymentMethod}
                                              onChange={(event) => updateRow(row.key, { paymentMethod: event.target.value as 'online' | 'cash' | 'upi' })}
                                            >
                                              <option value="upi">UPI</option>
                                              <option value="online">Online / Card</option>
                                              <option value="cash">Cash</option>
                                            </select>
                                          </label>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-[var(--text-muted)] pt-1 border-t border-[var(--border-hairline)]">
                                          <label className="inline-flex items-center gap-1.5">
                                            <span>Reference / UTR:</span>
                                            <input
                                              className="rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2 py-0.5 text-xs font-mono text-[var(--text-primary)]"
                                              placeholder="Optional reference"
                                              value={row.reference || ''}
                                              onChange={(event) => updateRow(row.key, { reference: event.target.value || null })}
                                            />
                                          </label>
                                          {row.balance && <span>Statement balance: ₹{row.balance}</span>}
                                          {row.cleanMerchant && (
                                            <span>Detected counterparty: <strong className="text-[var(--text-primary)]">{row.cleanMerchant}</strong></span>
                                          )}
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile Review Cards View */}
                    <div className="block md:hidden space-y-2.5">
                      {filteredRows.map((row) => {
                        const isExpanded = expandedRowKeys.has(row.key);
                        const category = categories.find((c) => c.id === row.categoryId);
                        return (
                          <article
                            key={row.key}
                            className={`rounded-lg border p-3 transition-colors ${
                              row.selected
                                ? 'border-[var(--border-subtle)] bg-[var(--bg-surface)]'
                                : 'border-[var(--border-hairline)] bg-[var(--bg-canvas)] opacity-85'
                            }`}
                          >
                            <div className="flex items-start gap-2.5">
                              <input
                                type="checkbox"
                                checked={row.selected}
                                onChange={(e) => updateRow(row.key, { selected: e.target.checked })}
                                aria-label={`Select ${row.description || 'transaction'}`}
                                className="mt-1 h-4 w-4 rounded border-[var(--border-subtle)] text-[var(--action-primary-bg)] focus:ring-[var(--action-primary-bg)] cursor-pointer shrink-0"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  <p className="text-xs font-semibold text-[var(--text-primary)] line-clamp-2 leading-snug">
                                    {row.cleanMerchant || row.description || 'Unspecified Transaction'}
                                  </p>
                                  <span className={`font-mono font-bold text-xs shrink-0 ${
                                    row.type === 'expense' ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                                  }`}>
                                    {row.type === 'expense' ? '-' : '+'}₹{row.amount}
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[10px] text-[var(--text-muted)]">
                                  <span className="font-mono">{row.date}</span>
                                  <span>·</span>
                                  <Badge variant={row.paymentMethod === 'upi' ? 'upi' : row.paymentMethod === 'online' ? 'online' : 'cash'} size="xs">
                                    {row.paymentMethod === 'upi' ? 'UPI' : row.paymentMethod === 'online' ? 'Online' : 'Cash'}
                                  </Badge>
                                  <span>·</span>
                                  <span>{category ? category.name : 'Uncategorized'}</span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => toggleRowExpand(row.key)}
                                className="p-1 rounded text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                                aria-label={isExpanded ? 'Collapse row details' : 'Expand row details'}
                              >
                                {isExpanded ? '▲' : '▼'}
                              </button>
                            </div>

                            {/* Mobile Expanded Editor */}
                            {isExpanded && (
                              <div className="mt-3 pt-3 border-t border-[var(--border-hairline)] space-y-2.5">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <label className="text-[10px] font-medium text-[var(--text-muted)]">
                                    Date
                                    <input
                                      className={`${inputClass} mt-0.5`}
                                      type="date"
                                      value={row.date}
                                      onChange={(event) => updateRow(row.key, { date: event.target.value })}
                                    />
                                  </label>
                                  <label className="text-[10px] font-medium text-[var(--text-muted)]">
                                    Amount (₹)
                                    <input
                                      className={`${inputClass} mt-0.5 font-mono`}
                                      inputMode="decimal"
                                      value={row.amount}
                                      onChange={(event) => {
                                        const value = event.target.value;
                                        try {
                                          const paise = Number(parseINRToPaise(value));
                                          updateRow(row.key, { amount: value, amountPaise: paise });
                                        } catch {
                                          updateRow(row.key, { amount: value });
                                        }
                                      }}
                                    />
                                  </label>
                                  <label className="text-[10px] font-medium text-[var(--text-muted)] sm:col-span-2">
                                    Description / Narration
                                    <input
                                      className={`${inputClass} mt-0.5`}
                                      value={row.description || ''}
                                      onChange={(event) => updateRow(row.key, { description: event.target.value })}
                                    />
                                  </label>
                                  <label className="text-[10px] font-medium text-[var(--text-muted)]">
                                    Category (Optional)
                                    <select
                                      className={`${inputClass} mt-0.5`}
                                      value={row.categoryId || ''}
                                      onChange={(event) => {
                                        const nextCatId = event.target.value;
                                        updateRow(row.key, { categoryId: nextCatId });
                                        if (nextCatId) {
                                          const cat = categories.find((c) => c.id === nextCatId);
                                          if (cat) {
                                            setRememberMerchantPrompt({
                                              rowKey: row.key,
                                              merchantPattern: row.cleanMerchant || row.description,
                                              categoryId: nextCatId,
                                              categoryName: cat.name,
                                            });
                                          }
                                        }
                                      }}
                                    >
                                      <option value="">Uncategorized</option>
                                      {categories.filter((c) => c.type === row.type && !c.archived_at).map((c) => (
                                        <option value={c.id} key={c.id}>{c.name}</option>
                                      ))}
                                    </select>
                                  </label>
                                  <label className="text-[10px] font-medium text-[var(--text-muted)]">
                                    Channel
                                    <select
                                      className={`${inputClass} mt-0.5`}
                                      value={row.paymentMethod}
                                      onChange={(event) => updateRow(row.key, { paymentMethod: event.target.value as 'online' | 'cash' | 'upi' })}
                                    >
                                      <option value="upi">UPI</option>
                                      <option value="online">Online</option>
                                      <option value="cash">Cash</option>
                                    </select>
                                  </label>
                                </div>
                                {rememberMerchantPrompt?.rowKey === row.key && (
                                  <div className="p-2 rounded bg-[var(--action-primary-bg)]/10 border border-[var(--action-primary-bg)]/20 text-[11px] flex items-center justify-between">
                                    <span>Remember for this merchant?</span>
                                    <button
                                      type="button"
                                      onClick={() => handleRememberMerchant(row, rememberMerchantPrompt.categoryId)}
                                      className="px-2 py-0.5 rounded bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] font-semibold text-[10px]"
                                    >
                                      Save Rule
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

            {/* SECTION B — IMPORTED */}
            <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-[var(--border-hairline)] bg-[var(--bg-surface)]">
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setSectionImportedOpen(!sectionImportedOpen)}
                    className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-bold text-sm cursor-pointer"
                    aria-label={sectionImportedOpen ? 'Collapse Section B' : 'Expand Section B'}
                  >
                    {sectionImportedOpen ? '▼' : '▶'}
                  </button>
                  <h3 className="text-sm sm:text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <span>Section B — Imported</span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      {importedRows.length}
                    </span>
                  </h3>
                </div>

                {importedRows.length > 0 && (
                  <a
                    href="/dashboard"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                  >
                    View in Transaction Ledger →
                  </a>
                )}
              </div>

              {sectionImportedOpen && (
                <div className="p-4 sm:p-5 space-y-4">
                  <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-base text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                        <h4 className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                          {importedRows.length} Transaction{importedRows.length === 1 ? '' : 's'} Committed to Consolidated Ledger
                        </h4>
                      </div>
                      <p className="text-xs text-emerald-700 dark:text-emerald-300">
                        These transactions are permanently persisted on your device and queued for cloud synchronization. They will never appear in Section A (To Review).
                      </p>
                    </div>
                  </div>

                  {importedRows.length === 0 ? (
                    <div className="p-8 text-center text-xs text-[var(--text-muted)] border border-dashed border-[var(--border-hairline)] rounded-lg">
                      No transactions have been committed from this statement session yet. Import records from Section A above.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-[var(--border-hairline)]">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] border-b border-[var(--border-hairline)]">
                          <tr>
                            <th className="py-2.5 px-3 w-28 font-medium">Date</th>
                            <th className="py-2.5 px-3 font-medium">Merchant / Counterparty</th>
                            <th className="py-2.5 px-3 w-24 text-center font-medium">Channel</th>
                            <th className="py-2.5 px-3 w-24 text-center font-medium">Direction</th>
                            <th className="py-2.5 px-3 w-32 text-right font-medium">Amount</th>
                            <th className="py-2.5 px-3 w-36 font-medium">Category</th>
                            <th className="py-2.5 px-3 w-24 text-center font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-hairline)]">
                          {filteredImportedRows.map((row) => {
                            const category = categories.find((c) => c.id === row.categoryId);
                            return (
                              <tr key={row.key} className="hover:bg-[var(--bg-surface-subtle)]">
                                <td className="py-2 px-3 font-mono text-[var(--text-secondary)] whitespace-nowrap">
                                  {row.date}
                                </td>
                                <td className="py-2 px-3 min-w-0 max-w-sm">
                                  <div className="font-medium text-[var(--text-primary)]">
                                    {row.cleanMerchant || row.description || 'Transaction'}
                                  </div>
                                  {row.reference && (
                                    <span className="font-mono text-[10px] text-[var(--text-muted)]">Ref: {row.reference}</span>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-center whitespace-nowrap">
                                  <Badge variant={row.paymentMethod === 'upi' ? 'upi' : row.paymentMethod === 'online' ? 'online' : 'cash'} size="xs">
                                    {row.paymentMethod === 'upi' ? 'UPI' : row.paymentMethod === 'online' ? 'Online' : 'Cash'}
                                  </Badge>
                                </td>
                                <td className="py-2 px-3 text-center whitespace-nowrap">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                    row.type === 'expense'
                                      ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                  }`}>
                                    {row.type === 'expense' ? 'Expense' : 'Income'}
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-right font-mono font-semibold whitespace-nowrap">
                                  <span className={row.type === 'expense' ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}>
                                    {row.type === 'expense' ? '-' : '+'}₹{row.amount}
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-[var(--text-secondary)]">
                                  {category ? category.name : <span className="text-[var(--text-muted)] italic">Uncategorized</span>}
                                </td>
                                <td className="py-2 px-3 text-center whitespace-nowrap">
                                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                    ✓ Imported
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* SECTION C — ALREADY IN LEDGER */}
            <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-[var(--border-hairline)] bg-[var(--bg-surface)]">
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setSectionAlreadyInLedgerOpen(!sectionAlreadyInLedgerOpen)}
                    className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-bold text-sm cursor-pointer"
                    aria-label={sectionAlreadyInLedgerOpen ? 'Collapse Section C' : 'Expand Section C'}
                  >
                    {sectionAlreadyInLedgerOpen ? '▼' : '▶'}
                  </button>
                  <h3 className="text-sm sm:text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <span>Section C — Already in Ledger</span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                      {alreadyInLedgerRows.length}
                    </span>
                  </h3>
                </div>
              </div>

              {sectionAlreadyInLedgerOpen && (
                <div className="p-4 sm:p-5 space-y-4">
                  <div className="p-4 rounded-xl bg-sky-50 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-800/60 space-y-1.5 text-xs">
                    <h4 className="font-semibold text-sky-900 dark:text-sky-200 flex items-center gap-1.5">
                      <span>ℹ️</span>
                      <span>Reconciled Transactions on File ({alreadyInLedgerRows.length})</span>
                    </h4>
                    <p className="text-sky-800 dark:text-sky-300 leading-relaxed">
                      These statement transactions match existing records in your ledger. Custom user edits (custom merchant names, user-assigned categories, custom necessity ratings) are completely preserved and will not be overwritten. If an entry is actually a distinct transaction, click &ldquo;Include Anyway&rdquo; to move it to Section A.
                    </p>
                  </div>

                  {alreadyInLedgerRows.length === 0 ? (
                    <div className="p-8 text-center text-xs text-[var(--text-muted)] border border-dashed border-[var(--border-hairline)] rounded-lg">
                      No duplicate or previously recorded transactions identified in this statement.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-[var(--border-hairline)]">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] border-b border-[var(--border-hairline)]">
                          <tr>
                            <th className="py-2.5 px-3 w-48 font-medium">Statement Transaction</th>
                            <th className="py-2.5 px-3 w-48 font-medium">Matched Ledger Record</th>
                            <th className="py-2.5 px-3 font-medium">Match Method &amp; Confidence</th>
                            <th className="py-2.5 px-3 w-36 text-right font-medium">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-hairline)]">
                          {filteredAlreadyInLedgerRows.map((row) => {
                            const match = row.matchedLedger;
                            const ledgerRec = match?.matchedLedger;
                            const isConfirmed = match?.matchConfidence === 'confirmed';
                            const isLikely = match?.matchConfidence === 'likely';
                            const scorePct = match?.confidenceScore !== undefined ? Math.round(match.confidenceScore) : (isConfirmed ? 100 : 80);

                            return (
                              <tr key={row.key} className="hover:bg-[var(--bg-surface-subtle)]">
                                <td className="py-3 px-3 align-top">
                                  <div className="font-medium text-[var(--text-primary)]">
                                    {row.cleanMerchant || row.description || 'Transaction'}
                                  </div>
                                  <div className="font-mono text-[11px] text-[var(--text-secondary)] mt-0.5">
                                    {row.date} · <span className={row.type === 'expense' ? 'text-rose-600 dark:text-rose-400 font-semibold' : 'text-emerald-600 dark:text-emerald-400 font-semibold'}>{row.type === 'expense' ? '-' : '+'}₹{row.amount}</span>
                                  </div>
                                  {row.reference && (
                                    <div className="font-mono text-[10px] text-[var(--text-muted)] mt-0.5">Ref: {row.reference}</div>
                                  )}
                                </td>
                                <td className="py-3 px-3 align-top">
                                  {ledgerRec ? (
                                    <div>
                                      <div className="font-medium text-[var(--text-primary)]">
                                        {ledgerRec.description || 'Ledger Record'}
                                      </div>
                                      <div className="font-mono text-[11px] text-[var(--text-secondary)] mt-0.5">
                                        {ledgerRec.transaction_date} · ₹{(ledgerRec.amount_paise / 100).toFixed(2)}
                                      </div>
                                      <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[10px]">
                                        {ledgerRec.category_name && (
                                          <span className="px-1.5 py-0.2 rounded bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] text-[var(--text-secondary)]">
                                            {ledgerRec.category_name}
                                          </span>
                                        )}
                                        {ledgerRec.necessity && (
                                          <span className={`px-1.5 py-0.2 rounded font-medium capitalize ${
                                            ledgerRec.necessity === 'essential'
                                              ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                                              : ledgerRec.necessity === 'optional'
                                              ? 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300'
                                              : 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                                          }`}>
                                            {ledgerRec.necessity}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="text-[var(--text-muted)] italic text-[11px]">Matching ledger row</div>
                                  )}
                                </td>
                                <td className="py-3 px-3 align-top">
                                  <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-1.5">
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                                        isConfirmed
                                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                          : isLikely
                                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                          : 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                                      }`}>
                                        {isConfirmed ? '✓ Confirmed Match' : isLikely ? '⚠️ Likely Match' : '⚠️ Possible Duplicate'} ({scorePct}%)
                                      </span>
                                    </div>
                                    <span className="text-[11px] text-[var(--text-muted)] leading-tight">
                                      {match?.matchMethod || row.warning || 'Identified via statement reconciliation'}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-3 px-3 align-top text-right whitespace-nowrap">
                                  {isConfirmed ? (
                                    <div className="flex flex-col items-end gap-1">
                                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                        On File
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => includeRowInReview(row.key)}
                                        className="text-[10px] text-[var(--action-primary-bg)] hover:underline cursor-pointer"
                                        title="Force inclusion into Section A if this is actually a separate transaction"
                                      >
                                        Include Anyway
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => includeRowInReview(row.key)}
                                      className="rounded bg-[var(--action-primary-bg)] hover:bg-[var(--action-primary-hover)] px-2.5 py-1 text-xs font-semibold text-[var(--action-primary-fg)] transition-colors cursor-pointer shadow-xs"
                                    >
                                      Include Anyway
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* SECTION D — SKIPPED & NEEDS ATTENTION */}
            <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-[var(--border-hairline)] bg-[var(--bg-surface)]">
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setSectionAttentionOpen(!sectionAttentionOpen)}
                    className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-bold text-sm cursor-pointer"
                    aria-label={sectionAttentionOpen ? 'Collapse Section D' : 'Expand Section D'}
                  >
                    {sectionAttentionOpen ? '▼' : '▶'}
                  </button>
                  <h3 className="text-sm sm:text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <span>Section D — Skipped &amp; Needs Attention</span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      {attentionRows.length}
                    </span>
                  </h3>
                </div>
              </div>

              {sectionAttentionOpen && (
                <div className="p-4 sm:p-5 space-y-4">
                  <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/60 space-y-1 text-xs">
                    <h4 className="font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                      <span>⚠️</span>
                      <span>Skipped &amp; Attention Rows ({attentionRows.length})</span>
                    </h4>
                    <p className="text-amber-800 dark:text-amber-300 leading-relaxed">
                      Transactions listed below are excluded from automatic ledger import because they have ambiguous dates, unresolvable amounts, conflicting debit/credit indicators, or were skipped. Every row shows an explicit reason and recovery actions.
                    </p>
                  </div>

                  {attentionRows.length === 0 ? (
                    <div className="p-8 text-center text-xs text-[var(--text-muted)] border border-dashed border-[var(--border-hairline)] rounded-lg">
                      No transactions skipped or requiring attention in this statement.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-[var(--border-hairline)]">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] border-b border-[var(--border-hairline)]">
                          <tr>
                            <th className="py-2.5 px-3 w-44 font-medium">Date / Resolution</th>
                            <th className="py-2.5 px-3 font-medium">Narration / Counterparty</th>
                            <th className="py-2.5 px-3 w-36 text-right font-medium">Amount / Direction</th>
                            <th className="py-2.5 px-3 w-44 font-medium">Reason Excluded</th>
                            <th className="py-2.5 px-3 w-44 text-right font-medium">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-hairline)]">
                          {filteredAttentionRows.map((row) => {
                            const isMissingDate = !row.date || row.classification === 'extraction_problem';
                            const isDirectionConflict = /conflict|ambiguous direction/i.test(row.warning || '') || /direction/i.test(row.exclusionReason || '');
                            let reasonLabel = 'Review Needed';
                            let reasonClass = 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300';

                            if (isMissingDate) {
                              reasonLabel = 'Ambiguous Date';
                              reasonClass = 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300';
                            } else if (isDirectionConflict) {
                              reasonLabel = 'Ambiguous Direction';
                              reasonClass = 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300';
                            } else if (row.userSkipped || row.state === 'skipped') {
                              reasonLabel = 'User Skipped';
                              reasonClass = 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300';
                            } else if (row.classification === 'internal_transfer') {
                              reasonLabel = 'Candidate Transfer';
                            } else if (row.classification === 'credit_card_settlement') {
                              reasonLabel = 'Candidate Card Settlement';
                            } else if (row.exclusionReason) {
                              reasonLabel = row.exclusionReason;
                            }

                            return (
                              <tr key={row.key} className="hover:bg-[var(--bg-surface-subtle)]">
                                <td className="py-2.5 px-3 align-top whitespace-nowrap">
                                  {isMissingDate ? (
                                    <div className="space-y-1.5">
                                      <span className="text-[10px] text-rose-600 dark:text-rose-400 font-medium block">
                                        {row.rawDate ? `Raw: "${row.rawDate}"` : 'Date needed'}
                                      </span>
                                      <input
                                        type="date"
                                        value={dateCorrectionMap[row.key] || ''}
                                        onChange={(e) => setDateCorrectionMap((prev) => ({ ...prev, [row.key]: e.target.value }))}
                                        className="w-32 rounded border border-amber-400 bg-[var(--bg-canvas)] px-2 py-1 text-xs font-mono text-[var(--text-primary)]"
                                      />
                                    </div>
                                  ) : (
                                    <span className="font-mono text-[var(--text-secondary)]">{row.date}</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 align-top min-w-0 max-w-sm">
                                  <div className="font-medium text-[var(--text-primary)] leading-tight">
                                    {row.cleanMerchant || row.description || 'Unspecified Transaction'}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[10px] text-[var(--text-muted)]">
                                    {row.reference && <span className="font-mono">Ref: {row.reference}</span>}
                                    {row.warning && <span className="text-amber-700 dark:text-amber-300">Note: {row.warning}</span>}
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 align-top text-right whitespace-nowrap">
                                  <div className="font-mono font-semibold text-xs">
                                    <span className={row.type === 'expense' ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}>
                                      {row.type === 'expense' ? '-' : '+'}₹{row.amount}
                                    </span>
                                  </div>
                                  {isDirectionConflict && (
                                    <div className="flex items-center justify-end gap-1 mt-1">
                                      <button
                                        type="button"
                                        onClick={() => resolveAmbiguousDirection(row.key, 'expense')}
                                        className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 hover:bg-rose-200 cursor-pointer"
                                      >
                                        Expense
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => resolveAmbiguousDirection(row.key, 'income')}
                                        className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 hover:bg-emerald-200 cursor-pointer"
                                      >
                                        Income
                                      </button>
                                    </div>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 align-top">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${reasonClass}`}>
                                    {reasonLabel}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 align-top text-right whitespace-nowrap space-x-1.5">
                                  {isMissingDate ? (
                                    <button
                                      type="button"
                                      disabled={!dateCorrectionMap[row.key]}
                                      onClick={() => confirmRowDate(row.key)}
                                      className="rounded bg-[var(--action-primary-bg)] px-2.5 py-1 text-xs font-semibold text-[var(--action-primary-fg)] hover:bg-[var(--action-primary-hover)] transition-colors disabled:opacity-40 cursor-pointer"
                                    >
                                      Confirm Date &amp; Move to Review
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => includeRowInReview(row.key)}
                                      className="rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-subtle)] px-2.5 py-1 text-xs font-medium text-[var(--text-primary)] cursor-pointer"
                                    >
                                      {row.userSkipped || row.state === 'skipped' ? 'Restore to Review' : 'Include in Review'}
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. IMPORT HISTORY SECTION */}
      {history.length > 0 && (
        <aside className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Past Statement Batches</h3>
            <span className="text-xs text-[var(--text-muted)]">{history.length} batch{history.length === 1 ? '' : 'es'}</span>
          </div>

          <div className="space-y-2">
            {history.slice(0, 5).map((item) => {
              const pendingCount = pendingCountByBatch[item.id] ?? (item.status === 'partial' ? 1 : 0);
              const isUndone = item.status === 'undone';
              const isRetrying = retryingBatchId === item.id;
              const syncedCount = Math.max(0, item.imported_ids.length - pendingCount);
              const skippedCount = item.skipped_rows?.length ?? Math.max(0, item.detected_count - item.imported_ids.length);

              return (
                <div key={item.id} className="flex flex-wrap items-start justify-between gap-3 border-t border-[var(--border-hairline)] pt-3 text-xs">
                  <div className="min-w-[240px] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-sm font-medium text-[var(--text-primary)]">{item.source}</strong>
                      {isUndone ? (
                        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300">
                          Undone
                        </span>
                      ) : (
                        <>
                          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            Imported
                          </span>
                          {pendingCount === 0 ? (
                            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                              Synced ({item.imported_ids.length}/{item.imported_ids.length})
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                              {syncedCount} of {item.imported_ids.length} Synced · {pendingCount} Pending Sync
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                      {new Date(item.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} · Batch <span className="font-mono text-[var(--text-primary)]">{item.id.slice(0, 8)}</span>
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-muted)]">
                      <span>Detected: <strong className="text-[var(--text-primary)]">{item.detected_count}</strong></span>
                      <span>·</span>
                      <span>Imported to Ledger: <strong className="text-emerald-600 dark:text-emerald-400">{item.imported_ids.length}</strong></span>
                      <span>·</span>
                      <span>Skipped / Attn: <strong className="text-[var(--text-primary)]">{skippedCount}</strong></span>
                    </div>

                    {(item.skipped_rows?.length || 0) > 0 && (
                      <details className="mt-1.5 text-xs">
                        <summary className="cursor-pointer text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
                          {item.skipped_rows!.length} skipped rows · view reasons
                        </summary>
                        <ul className="mt-1.5 space-y-1 pl-4 text-[11px] text-[var(--text-muted)]">
                          {item.skipped_rows!.map((row, index) => (
                            <li key={`${row.transaction_date}-${index}`}>
                              {row.transaction_date || 'Unknown Date'} · {formatPaiseToINR(BigInt(row.amount_paise))} · {row.state.replace('_', ' ')} · {skipReasonLabel(row.reason)}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}

                    {confirmUndoId === item.id && (
                      <div className="mt-2.5 flex items-center gap-2 p-2 rounded-lg bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 text-xs">
                        <span className="text-rose-700 dark:text-rose-300">
                          Remove all {item.imported_ids.length} transactions in this batch from your active ledger?
                        </span>
                        <button
                          type="button"
                          onClick={() => void undoBatchFor(item)}
                          className="rounded-md bg-rose-700 hover:bg-rose-800 text-white px-2.5 py-1 font-medium cursor-pointer"
                        >
                          Confirm Undo
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmUndoId(null)}
                          className="rounded-md border border-[var(--border-subtle)] px-2 py-1 text-[var(--text-secondary)] cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setInspectedBatch(item)}
                      className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                    >
                      Inspect Batch
                    </button>
                    {!isUndone && pendingCount > 0 && (
                      <button
                        type="button"
                        disabled={isRetrying}
                        onClick={() => void retryBatchSync(item)}
                        className="rounded-md bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-500 dark:hover:bg-amber-400 dark:text-neutral-950 px-3 py-1.5 text-xs font-semibold shadow-xs cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-hidden transition-colors"
                      >
                        {isRetrying ? (
                          <>
                            <span className="w-3 h-3 border-2 border-white dark:border-neutral-950 border-t-transparent rounded-full animate-spin" />
                            <span>Syncing…</span>
                          </>
                        ) : (
                          <>
                            <span>↻</span>
                            <span>Retry Sync</span>
                          </>
                        )}
                      </button>
                    )}
                    {!isUndone && item.imported_ids.length > 0 && confirmUndoId !== item.id && (
                      <button
                        type="button"
                        onClick={() => setConfirmUndoId(item.id)}
                        className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 cursor-pointer"
                      >
                        Undo Batch
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
      )}

      {/* Batch Inspection Modal */}
      {inspectedBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-xl p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-hairline)]">
              <div>
                <h3 className="text-base font-semibold text-[var(--text-primary)]">
                  Statement Batch Breakdown: {inspectedBatch.source}
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Batch ID: <span className="font-mono">{inspectedBatch.id}</span> · {new Date(inspectedBatch.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectedBatch(null)}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                aria-label="Close batch inspection"
              >
                ✕
              </button>
            </div>

            {/* Mutually Exclusive Accounting Reconciliation */}
            <div className="rounded-xl bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] p-3.5 space-y-2">
              <div className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider">
                Batch Accounting Reconciliation
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                Statement rows follow strict mutually exclusive accounting:
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-xs">
                <div className="p-2 rounded bg-[var(--bg-canvas)] border border-[var(--border-hairline)]">
                  <span className="text-[10px] text-[var(--text-muted)] block">Detected Rows</span>
                  <strong className="text-[var(--text-primary)] text-sm">{inspectedBatch.detected_count}</strong>
                </div>
                <div className="p-2 rounded bg-[var(--bg-canvas)] border border-[var(--border-hairline)]">
                  <span className="text-[10px] text-[var(--text-muted)] block">Committed to Ledger</span>
                  <strong className="text-emerald-600 dark:text-emerald-400 text-sm">{inspectedBatch.imported_ids.length}</strong>
                </div>
                <div className="p-2 rounded bg-[var(--bg-canvas)] border border-[var(--border-hairline)]">
                  <span className="text-[10px] text-[var(--text-muted)] block">Pending Cloud Sync</span>
                  <strong className="text-amber-600 dark:text-amber-400 text-sm">{pendingCountByBatch[inspectedBatch.id] ?? 0}</strong>
                </div>
                <div className="p-2 rounded bg-[var(--bg-canvas)] border border-[var(--border-hairline)]">
                  <span className="text-[10px] text-[var(--text-muted)] block">Skipped / Attn</span>
                  <strong className="text-[var(--text-primary)] text-sm">{inspectedBatch.skipped_rows?.length ?? 0}</strong>
                </div>
              </div>
              <div className="text-[11px] text-[var(--text-muted)] pt-1">
                <span>Formula: </span>
                <span className="font-mono text-[var(--text-secondary)]">
                  {inspectedBatch.detected_count} detected = {inspectedBatch.imported_ids.length} committed + {inspectedBatch.skipped_rows?.length ?? 0} skipped
                </span>
              </div>
              <div className="text-[10px] text-[var(--text-muted)] italic">
                * Note: Statement summary balances (Opening and Closing balance) are verified purely for reconciliation mathematics and are never classified as transactions or counted in skipped rows.
              </div>
            </div>

            {/* Skipped Rows Detailed List */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-[var(--text-primary)]">
                Skipped &amp; Attention Rows ({inspectedBatch.skipped_rows?.length ?? 0})
              </h4>
              {(!inspectedBatch.skipped_rows || inspectedBatch.skipped_rows.length === 0) ? (
                <p className="text-xs text-[var(--text-muted)]">No rows were skipped in this batch.</p>
              ) : (
                <div className="max-h-60 overflow-y-auto border border-[var(--border-hairline)] rounded-lg">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] border-b border-[var(--border-hairline)] sticky top-0">
                      <tr>
                        <th className="py-2 px-3 font-medium">Date</th>
                        <th className="py-2 px-3 font-medium text-right">Amount</th>
                        <th className="py-2 px-3 font-medium">State</th>
                        <th className="py-2 px-3 font-medium">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-hairline)] font-mono">
                      {inspectedBatch.skipped_rows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-[var(--bg-surface-subtle)]">
                          <td className="py-1.5 px-3 text-[var(--text-secondary)]">{row.transaction_date || '—'}</td>
                          <td className="py-1.5 px-3 text-right text-[var(--text-primary)]">{formatPaiseToINR(BigInt(row.amount_paise))}</td>
                          <td className="py-1.5 px-3 text-[11px] text-[var(--text-muted)]">{row.state.replace('_', ' ')}</td>
                          <td className="py-1.5 px-3 text-[11px] text-amber-700 dark:text-amber-300 font-sans">{skipReasonLabel(row.reason)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-[var(--border-hairline)]">
              <button
                type="button"
                onClick={() => setInspectedBatch(null)}
                className="px-4 py-2 rounded-lg bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. BANK & FORMAT COMPATIBILITY MATRIX */}
      <aside className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4 text-xs text-[var(--text-secondary)] space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="font-semibold text-[var(--text-primary)]">Supported Banks &amp; Statement Formats</h4>
            <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
              SpendSense automatically detects statement layouts for major Indian banks and generic financial tables.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCompatibility((open) => !open)}
            className="rounded-md border border-[var(--border-subtle)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            {showCompatibility ? 'Hide bank list' : 'View supported banks'}
          </button>
        </div>

        {showCompatibility && (
          <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--border-hairline)]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--bg-surface-subtle)] text-[11px] text-[var(--text-muted)] uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-2">Bank / Issuer</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Formats</th>
                  <th className="px-3 py-2">Validation Status</th>
                  <th className="px-3 py-2">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {getStatementCompatibilityMatrix().map((item) => (
                  <tr key={item.id} className="hover:bg-[var(--bg-surface-subtle)]">
                    <td className="px-3 py-2 font-medium text-[var(--text-primary)]">
                      {item.label} <span className="text-[10px] text-[var(--text-muted)]">({item.product})</span>
                    </td>
                    <td className="px-3 py-2 capitalize">{item.accountType.replace(/_/g, ' ')}</td>
                    <td className="px-3 py-2 uppercase text-[10px] font-mono">{item.supportedFormats.join(', ')}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        item.validation === 'fixture_verified'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      }`}>
                        {item.validation.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[11px] text-[var(--text-muted)] max-w-xs">{item.knownLimitations}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </aside>
    </section>
  );
}

function skipReasonLabel(reason: NonNullable<StatementImportBatch['skipped_rows']>[number]['reason']) {
  return ({
    possible_duplicate: 'possible duplicate; verified manually',
    ambiguous: 'classification needed user review',
    balance_mismatch: 'balance or extraction review needed',
    deselected: 'not selected by user',
    import_error: 'interrupted during import',
  } as const)[reason];
}

async function getExistingTransactions(userId: string): Promise<{ rows: ExistingLedgerRow[]; complete: boolean }> {
  const transactionMap = new Map<string, ExistingLedgerRow>();

  // 1. Load from local IndexedDB cache first
  try {
    const cached = await getCachedTransactions(userId);
    for (const tx of cached) {
      if (tx && tx.id) transactionMap.set(tx.id, tx);
    }
  } catch {}

  // 2. Fetch from server and merge
  let serverComplete = false;
  try {
    for (let page = 1; page <= 100; page++) {
      const response = await fetchTransactions({ page, page_size: 100, sort_by: 'date_desc' });
      for (const item of response.items) {
        if (item && item.id) transactionMap.set(item.id, item);
      }
      if (!response.has_more) {
        serverComplete = true;
        break;
      }
    }
  } catch {
    /* Offline or backend unreachable; local device cache is retained */
  }

  return { rows: Array.from(transactionMap.values()), complete: serverComplete };
}

function safeSourceName(name: string) {
  return name.replace(/[A-Z]{5}\d{4}[A-Z]/gi, '[PAN]').replace(/\b\d{10,18}\b/g, '[identifier]').slice(0, 180);
}

async function hashFile(file: File): Promise<string | null> {
  try {
    if (!globalThis.crypto?.subtle) return null;
    const digest = await globalThis.crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}
