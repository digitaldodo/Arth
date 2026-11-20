'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { v7 as uuidv7 } from 'uuid';
import { formatPaiseToINR, parseINRToPaise, parseNonNegativeINRToPaise, type CategoryDTO, type CreateTransactionResponse } from '@arth/contracts';
import { sanitizeUserFacingError } from '@/lib/error-utils';
import { getCachedCategories, getCachedTransactions, getPendingMutations, getStatementImportBatches, saveStatementImportBatch, type StatementImportBatch } from '@/lib/offline-db';
import { fetchCategories, fetchTransactions } from '@/lib/api-client';
import { syncEngine } from '@/features/sync/sync-engine';
import { CrossAccountReconciliation } from './CrossAccountReconciliation';
import { normalizeStatementTable, parseCsv, tagDuplicates, computeStatementSummary, type ParsedStatementRow, type StatementColumnMapping, type StatementParseResult, type StatementSummary } from './statement-parser';
import { getStatementCompatibilityMatrix } from './statement-adapters';
import { alignOcrRows, requireOcrReview, type OcrCell, type OcrLine } from './statement-ocr';
import { skippedRowsForImport } from './statement-skip-history';
import { merchantFingerprint, recordCategoryCorrection, suggestCategory } from '@/features/categorization';
import { FinancialMessageCapture } from './FinancialMessageCapture';

type Props = { userId: string; onImported: (count: number) => void; onManualEntry: () => void };
type PasswordCallback = (password: string) => void;
type ExistingLedgerRow = { transaction_date: string; amount_paise: number; type: string; description: string | null; account_id?: string | null; statement_reference?: string | null };
type FinancialAccount = { id: string; name: string; institution: string; account_type: 'bank' | 'credit_card' | 'cash' | 'wallet' | 'investment' | 'loan'; account_number_last4: string | null; opening_balance_paise: string; current_balance_paise?: string };
type StoredBatch = { id: string; account_id: string | null; source_name: string; source_format: 'pdf' | 'csv' | 'xlsx' | 'xls'; parser_id: string; statement_start: string | null; statement_end: string | null; opening_balance_paise: string | null; closing_balance_paise: string | null; source_sha256: string | null; status: 'processing' | 'completed' | 'partial' | 'failed' | 'undone'; detected_count: number; imported_count: number; skipped_count: number; duplicate_count: number; skipped_rows?: NonNullable<StatementImportBatch['skipped_rows']>; transaction_ids?: string[]; created_at: string };
const MAPPING_FIELDS: Array<[keyof StatementColumnMapping, string]> = [
  ['date', 'Transaction date'], ['valueDate', 'Value date'], ['description', 'Description / narration'], ['debit', 'Debit amount'], ['credit', 'Credit amount'],
  ['amount', 'Single amount'], ['type', 'Debit / credit type'], ['reference', 'Reference / UTR'], ['balance', 'Running balance'],
];

export function StatementImport({ userId, onImported, onManualEntry }: Props) {
  const [file, setFile] = useState<File | null>(null);
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
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [accountId, setAccountId] = useState('');
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountInstitution, setNewAccountInstitution] = useState('');
  const [newAccountType, setNewAccountType] = useState<'bank' | 'credit_card'>('bank');
  const [newAccountLast4, setNewAccountLast4] = useState('');
  const [newOpeningBalance, setNewOpeningBalance] = useState('0');
  const [newOpeningBalanceDate, setNewOpeningBalanceDate] = useState('');
  const [accountFormOpen, setAccountFormOpen] = useState(false);
  const [confirmUndoId, setConfirmUndoId] = useState<string | null>(null);
  const [retryingBatchId, setRetryingBatchId] = useState<string | null>(null);
  const [showCompatibility, setShowCompatibility] = useState(false);
  const pdfTask = useRef<{ destroy: () => Promise<void> } | null>(null);
  const parseVersion = useRef(0);

  useEffect(() => {
    let active = true;
    void Promise.all([getCachedCategories(userId), getStatementImportBatches(userId)]).then(async ([cached, imports]) => {
      if (!active) return;
      setCategories(cached);
      const recoverable = imports.map((item) => item.status === 'processing' ? { ...item, status: 'partial' as const } : item);
      setHistory(recoverable);
      for (const item of recoverable) if (item.status === 'partial' && imports.find((old) => old.id === item.id)?.status === 'processing') void saveStatementImportBatch(item);
      try {
        const fresh = await fetchCategories({ include_archived: false });
        if (active) { setCategories(fresh.categories); }
      } catch { /* Cached categories remain available offline. */ }
      try {
        const [accountResponse, batchResponse] = await Promise.all([
          fetch('/api/backend/financial/accounts', { cache: 'no-store' }),
          fetch('/api/backend/financial/import-batches', { cache: 'no-store' }),
        ]);
        if (!accountResponse.ok || !batchResponse.ok) throw new Error('Could not load saved account/import metadata');
        const accountData = await accountResponse.json() as { accounts: FinancialAccount[] };
        const batchData = await batchResponse.json() as { batches: StoredBatch[] };
        if (!active) return;
        setAccounts(accountData.accounts || []);
        const remote = (batchData.batches || []).map((batch) => ({
          id: batch.id, user_id: userId, source: batch.source_name, created_at: batch.created_at,
          imported_ids: batch.transaction_ids || [], detected_count: batch.detected_count,
          status: batch.status === 'undone' ? 'undone' as const : batch.status === 'completed' ? 'completed' as const : batch.status === 'processing' ? 'processing' as const : 'partial' as const,
          account_id: batch.account_id, statement_start: batch.statement_start, statement_end: batch.statement_end,
          opening_balance_paise: batch.opening_balance_paise, closing_balance_paise: batch.closing_balance_paise,
          parser_id: batch.parser_id, source_format: batch.source_format, source_sha256: batch.source_sha256,
          skipped_rows: batch.skipped_rows || [],
        }));
        setHistory((current) => {
          const localById = new Map(current.map((item) => [item.id, item]));
          for (const item of remote) {
            const local = localById.get(item.id);
          localById.set(item.id, local ? { ...item, ...local, status: item.status, imported_ids: [...new Set([...local.imported_ids, ...item.imported_ids])] } : item);
          }
          return [...localById.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
        });
        if (accountData.accounts?.length) setAccountId((current) => current || accountData.accounts[0].id);
      } catch { /* Keep browser history available when persistent metadata is offline. */ }
    });
    return () => { active = false; };
  }, [userId]);
  useEffect(() => () => {
    parseVersion.current++;
    sessionPasswordRef.current = null;
    if (pdfTask.current) void pdfTask.current.destroy().catch(() => {});
  }, []);
  const selectedAccount = useMemo(() => accounts.find((a) => a.id === accountId), [accounts, accountId]);
  const selectedRows = useMemo(() => result?.rows.filter((row) => row.selected) || [], [result]);
  const summary: StatementSummary | null = useMemo(() => {
    if (!result) return null;
    return computeStatementSummary(
      result.rows,
      result.openingBalancePaise ?? null,
      result.closingBalancePaise ?? null,
      selectedAccount?.account_type === 'credit_card' ? 'credit_card' : 'bank'
    );
  }, [result, selectedAccount?.account_type]);
  const totals = useMemo(() => ({
    debits: summary ? BigInt(summary.totalDebitsPaise) : 0n,
    credits: summary ? BigInt(summary.totalCreditsPaise) : 0n,
    duplicates: summary ? summary.skippedByReason.possible_duplicate : 0,
    review: summary ? summary.needsReviewCount : 0,
  }), [summary]);

  async function readFile(selectedFile: File) {
    const version = ++parseVersion.current;
    if (pdfTask.current) { await pdfTask.current.destroy().catch(() => {}); pdfTask.current = null; }
    passwordCallback.current = null;
    setFile(selectedFile); setResult(null); setMappingHeaderIndex('0'); setMappingColumns({}); setError(''); setMessage(''); setPassword(''); setPasswordRequired(false);
    if (selectedFile.size > 30 * 1024 * 1024) { setError('Files must be 30 MB or smaller.'); return; }
    const ext = selectedFile.name.toLowerCase().split('.').pop();
    if (!['csv', 'xlsx', 'xls', 'pdf'].includes(ext || '')) { setError('Choose a PDF, CSV, XLSX, or XLS statement.'); return; }
    setProcessing(true);
    try {
      let parsed: StatementParseResult;
      if (ext === 'csv') {
        parsed = normalizeStatementTable(parseCsv(await selectedFile.text()), selectedFile.name);
      } else if (ext === 'xlsx' || ext === 'xls') {
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(await selectedFile.arrayBuffer(), { type: 'array', cellDates: false });
        const first = workbook.SheetNames[0];
        if (!first) throw new Error('The workbook contains no sheets.');
        parsed = normalizeStatementTable(XLSX.utils.sheet_to_json(workbook.Sheets[first], { header: 1, raw: false }) as unknown[][], selectedFile.name);
      } else {
        parsed = await parsePdf(selectedFile);
      }
      if (version !== parseVersion.current) return;
      if (parsed.ocrRequired) {
        setResult(parsed);
        setMessage('This PDF has no selectable text. You can run local OCR in this browser, then review every extracted field before import.');
        return;
      }
      if (parsed.mappingRequired && !parsed.rows.length) {
        setResult(parsed);
        setMessage('This statement layout needs column mapping. Choose its header row and map the date, narration and amount columns below.');
        return;
      }
      const ledger = await getExistingTransactions(userId);
      parsed.rows = tagDuplicates(parsed.rows, ledger.rows, accountId || null);
      if (!ledger.complete) parsed.warnings.push('The full online ledger could not be checked. Duplicate detection used only transactions cached on this device.');
      const available = categories.filter((category) => !category.archived_at);
      parsed.rows = parsed.rows.map((row) => {
        const suggested = suggestCategory(row.description, available, row.type);
        const match = suggested?.category;
        return { ...row, categoryId: match?.id || '' };
      });
      if (!parsed.rows.length) {
        setResult(parsed);
        setMessage('No transaction rows were extracted. Check the source file or map the columns manually.');
        return;
      }
      setResult(parsed);
      setMessage(`${parsed.rows.length} transaction${parsed.rows.length === 1 ? '' : 's'} extracted. Review every row before importing.`);
    } catch (cause) {
      if (version !== parseVersion.current) return;
      const msg = cause instanceof Error ? cause.message : String(cause);
      if (msg.includes('Password') || msg.includes('encrypted') || msg.includes('password')) {
        setError('This PDF is encrypted or the password was incorrect. Enter its password above. Passwords are never sent across the network.');
      } else if (msg.includes('Invalid PDF') || msg.includes('corrupted') || msg.includes('stream') || msg.includes('format')) {
        setError('The file could not be parsed as a valid statement. It may be damaged or an unsupported format. Try exporting as CSV or Excel from your bank.');
      } else {
        setError(msg || 'Could not read this statement. Try CSV or Excel export.');
      }
    } finally {
      if (version === parseVersion.current) { setProcessing(false); setPassword(''); }
    }
  }

  async function applyManualMapping() {
    if (!result?.sourceTable || !file) return;
    const selected = (key: string) => mappingColumns[key] === undefined || mappingColumns[key] === '' ? null : Number(mappingColumns[key]);
    const date = selected('date'), description = selected('description');
    if (!mappingHeaderIndex) { setError('Choose the row containing the statement column headings.'); return; }
    if (date === null || description === null) { setError('Choose the transaction date and narration columns.'); return; }
    if (selected('debit') === null && selected('credit') === null && selected('amount') === null) { setError('Choose a debit, credit, or single amount column.'); return; }
    const mapping: StatementColumnMapping = {
      headerIndex: Number(mappingHeaderIndex), date, valueDate: selected('valueDate'), description,
      debit: selected('debit'), credit: selected('credit'), amount: selected('amount'), type: selected('type'),
      reference: selected('reference'), balance: selected('balance'),
    };
    setProcessing(true); setError('');
    try {
      let parsed = normalizeStatementTable(result.sourceTable, file.name, mapping);
      if (parsed.ocrConfidence !== undefined) parsed = requireOcrReview(parsed, parsed.ocrConfidence);
      if (!parsed.rows.length) { setResult(parsed); setError(parsed.warnings[0] || 'No rows matched those columns. Adjust the mapping and retry.'); return; }
      const ledger = await getExistingTransactions(userId);
      parsed.rows = tagDuplicates(parsed.rows, ledger.rows, accountId || null);
      if (!ledger.complete) parsed.warnings.push('The full online ledger could not be checked. Duplicate detection used only transactions cached on this device.');
      const available = categories.filter((category) => !category.archived_at);
      parsed.rows = parsed.rows.map((row) => {
        const suggested = suggestCategory(row.description, available, row.type);
        const match = suggested?.category;
        return { ...row, categoryId: match?.id || '' };
      });
      setResult(parsed); setMessage(`${parsed.rows.length} transaction${parsed.rows.length === 1 ? '' : 's'} extracted using your column mapping. Review every row before importing.`);
    } catch (cause) { setError(sanitizeUserFacingError(cause, 'Could not parse those columns.')); }
    finally { setProcessing(false); }
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
        setError('That PDF password did not unlock the file. Try again. Passwords are processed only in volatile memory on this device.');
      } else {
        setError('This PDF is encrypted. Enter its document password to continue.');
      }
      passwordCallback.current = updatePassword;
      setPasswordRequired(true);
    };
    const pdf = await task.promise;
    setPasswordRequired(false); setError(''); passwordCallback.current = null;
    const table: string[][] = [];
    let headingText = '';
    let selectableTextCount = 0;
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const groups = new Map<number, Array<{ x: number; text: string }>>();
      for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue;
        const [, , , , x, y] = item.transform;
        const lineY = Math.round(y / 3) * 3;
        const group = groups.get(lineY) || [];
        group.push({ x, text: item.str }); groups.set(lineY, group);
      }
      const lines = [...groups.entries()].sort((a, b) => b[0] - a[0]).map(([, items]) => {
        items.sort((a, b) => a.x - b.x);
        return items.map((item) => item.text).join('  ').trim();
      }).filter(Boolean);
      selectableTextCount += lines.join('').length;
      headingText += ` ${lines.slice(0, 12).join(' ')}`;
      for (const line of lines) table.push(line.split(/\s{2,}/).map((v) => v.trim()));
    }
    if (!encrypted && pdf.numPages > 0) setPasswordRequired(false);
    await task.destroy();
    pdfTask.current = null;
    const parsed = normalizeStatementTable(table, `${pdfFile.name} ${headingText}`);
    if (selectableTextCount === 0) {
      parsed.ocrRequired = true;
      parsed.warnings.push('This PDF contains no selectable text. Local OCR is available as an explicit review-only option.');
    }
    return parsed;
  }

  async function runLocalOcr() {
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) return;
    const version = parseVersion.current;
    setProcessing(true); setError(''); setMessage('Preparing the local OCR engine…'); setOcrProgress(0);
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
          setError('That PDF password did not unlock the file. Try again. Passwords are processed only in volatile memory on this device.');
        } else {
          setError('Enter the document password to unlock it locally for OCR.');
        }
        passwordCallback.current = updatePassword;
        setPasswordRequired(true);
      };
      const pdf = await task.promise;
      if (version !== parseVersion.current) return;
      if (pdf.numPages > 25) throw new Error('Local OCR is limited to 25 pages at a time. Export a smaller statement range or use CSV/Excel.');
      setPasswordRequired(false); passwordCallback.current = null;
      worker = await tesseract.createWorker('eng+hin', tesseract.OEM.LSTM_ONLY, {
        workerPath: '/ocr/worker.min.js', corePath: '/ocr/tesseract-core-lstm.wasm.js',
        langPath: `${window.location.origin}/ocr/`, workerBlobURL: false, gzip: true,
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
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('This browser could not prepare a local OCR canvas. Try CSV or Excel export.');
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        const { data } = await worker.recognize(canvas, {}, { blocks: true, text: true });
        const pageRows = new Map<number, Array<{ text: string; left: number; right: number; confidence: number }>>();
        for (const block of data.blocks || []) for (const paragraph of block.paragraphs) for (const line of paragraph.lines) {
          for (const word of line.words) {
            const rowKey = Math.round(((line.bbox.y0 + line.bbox.y1) / 2) / 8) * 8;
            const words = pageRows.get(rowKey) || [];
            words.push({ text: word.text, left: word.bbox.x0, right: word.bbox.x1, confidence: word.confidence });
            pageRows.set(rowKey, words);
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
        const detail = `Local OCR row confidence ${confidence}%. Verify the date, narration, amount and debit/credit direction.`;
        return { ...row, ocrConfidence: confidence, confidence: confidence >= 85 ? 'medium' : 'low', warning: detail };
      });
      const ledger = await getExistingTransactions(userId);
      parsed.rows = tagDuplicates(parsed.rows, ledger.rows, accountId || null);
      if (!ledger.complete) parsed.warnings.push('The full online ledger could not be checked. Duplicate detection used only transactions cached on this device.');
      const available = categories.filter((category) => !category.archived_at);
      parsed.rows = parsed.rows.map((row) => {
        const suggested = suggestCategory(row.description, available, row.type);
        const match = suggested?.category;
        return { ...row, categoryId: match?.id || '', selected: false };
      });
      setResult(parsed);
      setMessage(parsed.rows.length
        ? `${parsed.rows.length} OCR rows extracted locally. All rows require review and remain unselected.`
        : 'OCR did not produce a recognizable transaction table. Export CSV or Excel, or enter transactions manually.');
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

  function submitPassword(event: React.FormEvent) {
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
    setError('Statement decryption was cancelled. You can choose another file or retry with the correct password.');
  }

  function updateRow(key: string, patch: Partial<ParsedStatementRow>) {
    setResult((current) => current ? { ...current, rows: current.rows.map((row) => row.key === key ? { ...row, ...patch } : row) } : current);
  }

  async function changeDestinationAccount(nextId: string) {
    setAccountId(nextId);
    if (!result) return;
    const existing = await getExistingTransactions(userId);
    setResult((current) => {
      if (!current) return current;
      const before = new Map(current.rows.map((row) => [row.key, row]));
      const rows = tagDuplicates(current.rows, existing.rows, nextId || null).map((row) => {
        const old = before.get(row.key)!;
        const changedFromDuplicate = old.state === 'possible_duplicate' && row.state !== 'possible_duplicate';
        const changedToDuplicate = old.state !== 'possible_duplicate' && row.state === 'possible_duplicate';
        return { ...row, selected: changedFromDuplicate ? true : changedToDuplicate ? false : old.selected };
      });
      return { ...current, rows, warnings: existing.complete ? current.warnings.filter((warning) => !warning.startsWith('The full online ledger could not be checked.')) : [...current.warnings.filter((warning) => !warning.startsWith('The full online ledger could not be checked.')), 'The full online ledger could not be checked. Duplicate detection used only transactions cached on this device.'] };
    });
  }

  async function refreshAccounts() {
    try {
      const response = await fetch('/api/backend/financial/accounts', { cache: 'no-store' });
      const data = await response.json() as { accounts?: FinancialAccount[] };
      if (response.ok && data.accounts) setAccounts(data.accounts);
    } catch { /* Existing account names and balances remain visible until online refresh succeeds. */ }
  }

  async function addAccount(event: React.FormEvent) {
    event.preventDefault(); setError('');
    if (!newAccountName.trim() || !newAccountInstitution.trim() || (newAccountLast4 && !/^\d{4}$/.test(newAccountLast4))) {
      setError('Enter an account name, institution, and at most the last four account digits.'); return;
    }
    try {
      const openingBalancePaise = parseNonNegativeINRToPaise(newOpeningBalance);
      if (openingBalancePaise > 0n && !newOpeningBalanceDate) { setError('Enter the date for a non-zero opening balance.'); return; }
      const response = await fetch('/api/backend/financial/accounts', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ name: newAccountName.trim(), institution: newAccountInstitution.trim(), account_type: newAccountType,
          account_number_last4: newAccountLast4 || null, opening_balance_paise: openingBalancePaise.toString(),
          opening_balance_date: newOpeningBalanceDate || null }),
      });
      const data = await response.json() as { account?: FinancialAccount; error?: string };
      if (!response.ok || !data.account) throw new Error(data.error || 'Could not save account.');
      setAccounts((current) => [data.account!, ...current]); void changeDestinationAccount(data.account.id);
      setNewAccountName(''); setNewAccountInstitution(''); setNewAccountLast4(''); setNewOpeningBalance('0'); setNewOpeningBalanceDate(''); setAccountFormOpen(false);
    } catch (cause) { setError(sanitizeUserFacingError(cause, 'Could not save account.')); }
  }

  async function persistRemoteBatch(batch: StatementImportBatch, sourceFormat: StoredBatch['source_format'], parserId: string, sourceHash: string | null, importedCount: number) {
    const response = await fetch('/api/backend/financial/import-batches', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        id: batch.id, account_id: batch.account_id || null, source_name: safeSourceName(batch.source),
        source_format: sourceFormat, parser_id: parserId, parser_version: '1',
        statement_start: batch.statement_start || null, statement_end: batch.statement_end || null,
        opening_balance_paise: batch.opening_balance_paise || null, closing_balance_paise: batch.closing_balance_paise || null,
        source_sha256: sourceHash, status: batch.status, detected_count: batch.detected_count,
        imported_count: importedCount, skipped_count: Math.max(0, batch.detected_count - importedCount),
        duplicate_count: batch.duplicate_count ?? result?.rows.filter((row) => row.state === 'possible_duplicate').length ?? 0,
        discrepancy_count: batch.discrepancy_count ?? result?.rows.filter((row) => row.state === 'needs_review').length ?? 0,
        skipped_rows: batch.skipped_rows || [],
      }),
    });
    if (!response.ok) throw new Error('Could not save import history to your account. Retry while online.');
  }

  async function retryBatchSync(target: StatementImportBatch) {
    setRetryingBatchId(target.id); setError('');
    try {
      await syncEngine.processQueue(userId);
      const pending = (await getPendingMutations(userId)).filter((mutation) => target.imported_ids.includes(mutation.entityId));
      const updated = { ...target, status: pending.length ? 'partial' as const : 'completed' as const };
      await saveStatementImportBatch(updated);
      const syncedCount = Math.max(0, target.imported_ids.length - pending.length);
      if (updated.source_format && updated.parser_id) {
        await persistRemoteBatch(updated, updated.source_format, updated.parser_id, updated.source_sha256 || null, syncedCount);
      }
      setHistory((current) => current.map((item) => item.id === target.id ? updated : item));
      setMessage(pending.length ? `${pending.length} transaction${pending.length === 1 ? '' : 's'} still need synchronization. Review the sync status before retrying.` : 'All rows in this batch are synchronized.');
    } catch (cause) { setError(sanitizeUserFacingError(cause, 'Could not retry statement synchronization.')); }
    finally { setRetryingBatchId(null); }
  }

  async function importSelected() {
    if (!result || !selectedRows.length) return;
    if (!accountId || !accounts.some((account) => account.id === accountId)) { setError('Add or select the destination account before importing.'); return; }
    const categoriesById = new Map(categories.map((category) => [category.id, category]));
    if (selectedRows.some((row) => !categoriesById.has(row.categoryId))) { setError('Choose a valid category for each selected row.'); return; }
    setImporting(true); setError('');
    const batchId = uuidv7();
    const importedIds: string[] = [];
    const importedRowKeys = new Set<string>();
    const sourceFormat = (file?.name.toLowerCase().split('.').pop() || 'pdf') as StoredBatch['source_format'];
    const sourceHash = file ? await hashFile(file) : null;
    const batchRecord: StatementImportBatch = {
      id: batchId, user_id: userId, source: file ? safeSourceName(file.name) : 'Statement', created_at: new Date().toISOString(),
      imported_ids: [], detected_count: result.rows.length, status: 'processing', account_id: accountId,
      statement_start: result.period?.start || null, statement_end: result.period?.end || null,
      opening_balance_paise: result.openingBalancePaise || null, closing_balance_paise: result.closingBalancePaise || null,
      parser_id: result.adapterId, source_format: sourceFormat, source_sha256: sourceHash,
      duplicate_count: result.rows.filter((row) => row.state === 'possible_duplicate').length,
      discrepancy_count: result.rows.filter((row) => row.state === 'needs_review').length,
      skipped_rows: skippedRowsForImport(result.rows),
    };
    try {
      await saveStatementImportBatch(batchRecord);
      await persistRemoteBatch(batchRecord, sourceFormat, result.adapterId, sourceHash, 0);
      for (const row of selectedRows) {
        const category = categoriesById.get(row.categoryId)!;
        const categorySuggestion = suggestCategory(row.description, categories, row.type);
        if (categorySuggestion && categorySuggestion.category.id !== category.id) {
          await recordCategoryCorrection(userId, merchantFingerprint(row.description), category.id);
        }
        const response: CreateTransactionResponse = await syncEngine.createTransactionLocalFirst({
          id: uuidv7(), amount: row.amount, type: row.type, category_id: category.id,
          transaction_date: row.date, payment_method: row.paymentMethod,
          necessity: row.type === 'expense' ? 'essential' : null,
          description: row.description.slice(0, 500),
          notes: `Statement import · ${result.bank}${row.reference ? ` · ref ${row.reference}` : ''} · batch ${batchId}`,
          account_id: accountId, import_batch_id: batchId, statement_reference: row.reference,
          ingestion_source: 'bank_statement', parser_version: `${result.adapterId}:1`, category_verified: true,
          categorization_method: categorySuggestion
            ? categorySuggestion.category.id === category.id ? categorySuggestion.method : 'user_correction'
            : 'manual',
          category_suggestion_confidence: categorySuggestion?.confidence ?? null,
          category_evidence: categorySuggestion ? [...categorySuggestion.evidence] : [],
          category_was_corrected: Boolean(categorySuggestion && categorySuggestion.category.id !== category.id),
          categorization_model_version: categorySuggestion?.method === 'weak_supervision' ? 'weak-label-rules-v1' : null,
        }, categories, userId);
        importedIds.push(response.transaction.id);
        importedRowKeys.add(row.key);
        updateRow(row.key, { state: 'imported', selected: false, warning: 'Added to the ledger.' });
        batchRecord.imported_ids = [...importedIds];
        await saveStatementImportBatch(batchRecord);
      }
      await syncEngine.processQueue(userId);
      const pendingForBatch = (await getPendingMutations(userId)).filter((mutation) => importedIds.includes(mutation.entityId));
      const syncedCount = importedIds.length - pendingForBatch.length;
      batchRecord.status = pendingForBatch.length ? 'partial' : 'completed';
      await saveStatementImportBatch(batchRecord);
      await persistRemoteBatch(batchRecord, sourceFormat, result.adapterId, sourceHash, syncedCount);
      setHistory((current) => [batchRecord, ...current.filter((item) => item.id !== batchId)]);
      setMessage(pendingForBatch.length
        ? `${syncedCount} rows synced; ${pendingForBatch.length} are saved on this device and still need synchronization. Retry sync before importing the statement again.`
        : `${importedIds.length} rows added to your ledger and synchronized. Batch ${batchId.slice(0, 8)}.`);
      void refreshAccounts();
      onImported(importedIds.length);
    } catch {
      setError(`${importedIds.length} of ${selectedRows.length} rows were added before an error. The added rows remain in your ledger; retry only rows still selected after checking the ledger.`);
      batchRecord.status = 'partial'; batchRecord.imported_ids = [...importedIds];
      batchRecord.skipped_rows = skippedRowsForImport(result.rows, importedRowKeys);
      await saveStatementImportBatch(batchRecord);
      await persistRemoteBatch(batchRecord, sourceFormat, result.adapterId, sourceHash, importedIds.length).catch(() => {});
      setHistory((current) => [batchRecord, ...current.filter((item) => item.id !== batchId)]);
    } finally { setImporting(false); }
  }

  const inputClass = 'w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2 py-1.5 text-xs text-[var(--text-primary)]';
  const mappingHeaderCells = result?.sourceTable?.[Number(mappingHeaderIndex)] || [];
  return <section className="space-y-5">
    <nav aria-label="Transaction capture methods" className="grid gap-2 sm:grid-cols-3">
      <button type="button" onClick={onManualEntry} className="min-h-16 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 text-left"><strong className="block text-sm">Manual Entry</strong><span className="text-xs text-[var(--text-muted)]">Record an income or expense</span></button>
      <a href="#bank-statement-import" className="min-h-16 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 text-left"><strong className="block text-sm">Bank Statement</strong><span className="text-xs text-[var(--text-muted)]">Upload and review transactions</span></a>
      <a href="#financial-message-capture" className="min-h-16 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 text-left"><strong className="block text-sm">Financial Message</strong><span className="text-xs text-[var(--text-muted)]">Paste or share a selected message</span></a>
    </nav>
    <div id="financial-message-capture"><FinancialMessageCapture userId={userId} onImported={onImported} onManualEntry={onManualEntry} /></div>
    <div id="bank-statement-import">
    <header>
      <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Documents &amp; Tax</p>
      <h1 className="mt-1 text-2xl font-semibold">Statement import</h1>
      <p className="mt-2 max-w-3xl text-sm text-[var(--text-secondary)]">Read a statement on this device, review each transaction, then choose what to add to your ledger. Passwords and extracted statement text are not saved or sent to SpendSense.</p>
    </header>

    <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 space-y-4">
      <div className="rounded-lg border border-[var(--border-subtle)] p-3 space-y-3">
        <label className="block text-sm font-medium">Destination account
          <select className={`${inputClass} mt-1`} value={accountId} onChange={(event) => void changeDestinationAccount(event.target.value)}>
            <option value="">Choose a bank or card account</option>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.institution}{account.account_number_last4 ? ` · ••${account.account_number_last4}` : ''}{account.current_balance_paise !== undefined ? ` · ${account.account_type === 'credit_card' ? 'Card due ' : 'Balance '}${formatPaiseToINR(BigInt(account.current_balance_paise))}` : ''}</option>)}
          </select>
        </label>
        {accounts.length === 0 && <p className="text-xs text-[var(--text-muted)]">Add an account first. SpendSense stores only the last four account digits.</p>}
        <button type="button" className="rounded-md border px-3 py-2 text-xs" onClick={() => setAccountFormOpen((open) => !open)}>{accountFormOpen ? 'Close account form' : 'Add bank or card account'}</button>
        {accountFormOpen && <form onSubmit={(event) => void addAccount(event)} className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs">Account name<input className={inputClass} value={newAccountName} onChange={(event) => setNewAccountName(event.target.value)} maxLength={80} required placeholder="Personal savings" /></label>
          <label className="text-xs">Institution<input className={inputClass} value={newAccountInstitution} onChange={(event) => setNewAccountInstitution(event.target.value)} maxLength={100} required placeholder="Bank name" /></label>
          <label className="text-xs">Account type<select className={inputClass} value={newAccountType} onChange={(event) => setNewAccountType(event.target.value as 'bank' | 'credit_card')}><option value="bank">Bank account</option><option value="credit_card">Credit card</option></select></label>
          <label className="text-xs">Last four digits (optional)<input className={inputClass} inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={newAccountLast4} onChange={(event) => setNewAccountLast4(event.target.value)} /></label>
          <label className="text-xs">Opening balance (₹)<input className={inputClass} inputMode="decimal" value={newOpeningBalance} onChange={(event) => setNewOpeningBalance(event.target.value)} /></label>
          <label className="text-xs">Opening balance as of<input className={inputClass} type="date" value={newOpeningBalanceDate} onChange={(event) => setNewOpeningBalanceDate(event.target.value)} /></label>
          <button type="submit" className="w-fit rounded-md bg-[var(--action-primary-bg)] px-4 py-2 text-xs font-medium text-[var(--action-primary-fg)]">Save account</button>
        </form>}
      </div>
      <label className="block text-sm font-medium">Choose a statement <input type="file" accept=".pdf,.csv,.xlsx,.xls" className="mt-2 block w-full text-sm" onChange={(event) => { const picked = event.target.files?.[0]; if (picked) void readFile(picked); }} /></label>
      <p className="text-xs text-[var(--text-muted)]">PDF, CSV, XLSX, or XLS · up to 30 MB. Encrypted PDFs are unlocked locally. Scanned PDFs can use optional English/Hindi OCR in this browser; OCR output always requires review.</p>
      {processing && <p role="status" className="text-sm">{ocrProgress > 0 ? `Local OCR progress: ${ocrProgress}%` : 'Reading file on this device…'}</p>}
      {passwordRequired && (
        <form onSubmit={submitPassword} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Encrypted PDF Statement</h3>
            <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">Password required</span>
          </div>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            Indian banks password-protect statements (e.g. uppercase PAN or DOB). Decryption is performed entirely within your browser — the password is an ephemeral in-memory credential, never written to disk, cookies, or remote databases.
          </p>
          <label className="block text-xs font-medium text-[var(--text-primary)]">
            Document password
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
                className="rounded-md border border-[var(--border-subtle)] px-3 text-xs text-[var(--text-secondary)]"
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
            <span>Remember in volatile browser memory for this session (auto-unlocks same-password statements until tab close)</span>
          </label>
          <div className="flex items-center gap-2 pt-1">
            <button
              className="rounded-md bg-[var(--action-primary-bg)] px-4 py-2 text-xs font-medium text-[var(--action-primary-fg)]"
              type="submit"
            >
              Unlock locally
            </button>
            <button
              type="button"
              onClick={cancelPasswordPrompt}
              className="rounded-md border border-[var(--border-subtle)] px-3 py-2 text-xs text-[var(--text-secondary)]"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {error && <p role="alert" className="rounded-md border border-red-300/50 bg-red-50/50 p-3 text-sm text-red-700 dark:text-red-300">{error} {file?.name.toLowerCase().endsWith('.pdf') && 'You can export the statement as CSV or Excel and retry.'}</p>}
      {message && <p role="status" className="text-sm text-[var(--text-secondary)]">{message}</p>}
      {result?.ocrRequired && <div className="rounded-lg border border-[var(--border-subtle)] p-4"><p className="text-sm font-medium">Scanned PDF detected</p><p className="mt-1 text-xs text-[var(--text-secondary)]">OCR runs in this browser using bundled English and Hindi language files. The PDF is not uploaded. OCR may misread dates, amounts or debit/credit direction; all extracted rows will require your review.</p><button type="button" disabled={processing} onClick={() => void runLocalOcr()} className="mt-3 rounded-md border px-3 py-2 text-xs disabled:opacity-50">{processing ? 'Processing locally…' : 'Run local OCR'}</button></div>}
    </div>

    {result && <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
        {[
          ["Detected", summary?.detectedCount ?? result.rows.length],
          ["Selected", selectedRows.length],
          ["New", summary?.newCount ?? 0],
          ["Already on file", summary?.alreadyRecordedCount ?? 0],
          ["Duplicates / Review", (summary?.skippedByReason.possible_duplicate ?? totals.duplicates) + (summary?.needsReviewCount ?? totals.review)],
          ["Parser", `${result.bank} (${result.adapterValidation})`],
        ].map(([label, value]) => <div key={String(label)} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3"><div className="text-[11px] text-[var(--text-muted)]">{label}</div><div className="mt-1 text-sm font-semibold truncate">{value}</div></div>)}
      </div>

      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Review transactions</h2>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Debits {money(totals.debits)} · Credits {money(totals.credits)} {result.period && `· ${result.period.start} to ${result.period.end}`}
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="rounded-md border px-3 py-2 text-xs" onClick={() => setResult((current) => current ? { ...current, rows: current.rows.map((row) => ({ ...row, selected: row.state === 'new' })) } : current)}>Select new rows</button>
            <button type="button" disabled={importing || !selectedRows.length} onClick={() => void importSelected()} className="rounded-md bg-[var(--action-primary-bg)] px-4 py-2 text-sm font-medium text-[var(--action-primary-fg)] disabled:opacity-50">{importing ? 'Adding…' : `Add ${selectedRows.length} to ledger`}</button>
          </div>
        </div>

        {(result.openingBalancePaise !== null && result.openingBalancePaise !== undefined || result.closingBalancePaise !== null && result.closingBalancePaise !== undefined) && (
          <div className="mt-3 rounded-md bg-[var(--bg-subtle)] p-3 text-xs text-[var(--text-secondary)] space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-[var(--text-primary)]">Statement balance reconciliation</span>
              {summary?.isReconciled !== null && summary?.isReconciled !== undefined && (
                <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium ${summary.isReconciled ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'}`}>
                  {summary.isReconciled ? 'Reconciled · Math matches statement exactly' : `Discrepancy: ${formatPaiseToINR(BigInt(summary.reconciliationDifferencePaise || 0))}`}
                </span>
              )}
            </div>
            <p>
              Opening: {result.openingBalancePaise === null || result.openingBalancePaise === undefined ? 'not detected' : money(BigInt(result.openingBalancePaise))} · Closing: {result.closingBalancePaise === null || result.closingBalancePaise === undefined ? 'not detected' : money(BigInt(result.closingBalancePaise))}.
              Opening balance is inferred from the first dated running-balance row; verify against the printed statement before importing.
            </p>
          </div>
        )}

        {result.warnings.length > 0 && <ul className="mt-3 list-disc pl-5 text-xs text-amber-700 dark:text-amber-300">{result.warnings.slice(0, 8).map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
        {result.mappingRequired && result.sourceTable && <fieldset className="mt-4 rounded-md border border-[var(--border-subtle)] p-3"><legend className="px-1 text-xs font-medium">Map statement columns in this browser</legend><p className="mb-3 text-[11px] text-[var(--text-secondary)]">Choose the row containing column headings, then map the fields. Unmapped optional columns are ignored. Rows still require review and duplicate checking before import.</p><label className="block max-w-xl text-[10px] text-[var(--text-muted)]">Header row<select className={inputClass} value={mappingHeaderIndex} onChange={(event) => { setMappingHeaderIndex(event.target.value); setMappingColumns({}); }}><option value="">Choose a row</option>{result.sourceTable.slice(0, 30).map((row, index) => <option value={index} key={index}>Row {index + 1}: {row.slice(0, 6).join(' · ').slice(0, 100)}</option>)}</select></label><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{MAPPING_FIELDS.map(([key, label]) => <label key={key} className="text-[10px] text-[var(--text-muted)]">{label}<select className={inputClass} value={mappingColumns[key] || ''} onChange={(event) => setMappingColumns((current) => ({ ...current, [key]: event.target.value }))}><option value="">Not mapped</option>{mappingHeaderCells.map((heading, index) => <option value={index} key={`${index}-${heading}`}>Column {index + 1}: {heading || '(blank)'}</option>)}</select></label>)}</div><button type="button" disabled={processing} onClick={() => void applyManualMapping()} className="mt-3 rounded-md border px-3 py-2 text-xs disabled:opacity-50">{processing ? 'Parsing locally…' : 'Apply mapping and review rows'}</button></fieldset>}
        <div className="mt-4 space-y-3">
          {result.rows.map((row) => <article key={row.key} className="rounded-lg border border-[var(--border-hairline)] p-3">
            <div className="flex items-start gap-3"><input aria-label={`Select ${row.description}`} type="checkbox" checked={row.selected} onChange={(event) => updateRow(row.key, { selected: event.target.checked })} className="mt-2" /><div className="grid flex-1 gap-2 md:grid-cols-[130px_minmax(180px,1fr)_120px_120px_120px_150px]">
              <label className="text-[10px] text-[var(--text-muted)]">Date<input className={inputClass} type="date" value={row.date} onChange={(event) => updateRow(row.key, { date: event.target.value })} /></label>
              <label className="text-[10px] text-[var(--text-muted)]">Description<input className={inputClass} value={row.description} onChange={(event) => updateRow(row.key, { description: event.target.value })} /></label>
              <label className="text-[10px] text-[var(--text-muted)]">Amount (₹)<input className={inputClass} inputMode="decimal" value={row.amount} onChange={(event) => { const value = event.target.value; try { const paise = Number(parseINRToPaise(value)); updateRow(row.key, { amount: value, amountPaise: paise }); } catch { updateRow(row.key, { amount: value }); } }} /></label>
              <label className="text-[10px] text-[var(--text-muted)]">Type<select className={inputClass} value={row.type} onChange={(event) => updateRow(row.key, { type: event.target.value as 'income' | 'expense', categoryId: categories.find((category) => category.type === event.target.value)?.id || '' })}><option value="expense">Expense</option><option value="income">Income</option></select></label>
              <label className="text-[10px] text-[var(--text-muted)]">Payment channel<select className={inputClass} value={row.paymentMethod} onChange={(event) => updateRow(row.key, { paymentMethod: event.target.value as 'online' | 'cash' })}><option value="online">Online</option><option value="cash">Cash</option></select></label>
              <label className="text-[10px] text-[var(--text-muted)]">Category<select className={inputClass} value={row.categoryId} onChange={(event) => updateRow(row.key, { categoryId: event.target.value })}><option value="">Choose category</option>{categories.filter((category) => category.type === row.type && !category.archived_at).map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select>{(() => { const suggestion = suggestCategory(row.description, categories, row.type); return suggestion ? <span className="mt-1 block text-[10px] text-[var(--text-secondary)]">Suggested: {suggestion.category.name} · {Math.round(suggestion.confidence * 100)}% rule agreement</span> : <span className="mt-1 block text-[10px] text-[var(--text-muted)]">No reliable suggestion · choose a category</span>; })()}</label>
            </div></div>
            <div className="ml-7 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-muted)]">
              {row.classification && (
                <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${
                  row.classification === 'new'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : row.classification === 'already_recorded'
                      ? 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                      : row.classification === 'internal_transfer' || row.classification === 'credit_card_settlement'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                        : row.classification === 'refund' || row.classification === 'reversal'
                          ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                }`}>
                  {row.classification.replace(/_/g, ' ')}
                </span>
              )}
              <span className="capitalize">{row.state.replace('_', ' ')}</span>
              <span>{row.ocrConfidence === undefined ? `${row.confidence} confidence` : `OCR row confidence ${row.ocrConfidence}%`}</span>
              {row.valueDate && <span>Value date: {row.valueDate}</span>}
              {row.reference && <span>Ref: {row.reference}</span>}
              {row.exclusionReason && <span className="text-amber-700 dark:text-amber-300 font-medium">{row.exclusionReason}</span>}
              {row.warning && <span className="text-amber-700 dark:text-amber-300">{row.warning}</span>}
            </div>
          </article>)}
        </div>
      </div>
    </>}
    {history.length > 0 && <aside className="rounded-xl border border-[var(--border-hairline)] p-4"><h2 className="font-semibold">Import history</h2><div className="mt-3 space-y-2">{history.map((item) => <div key={item.id} className="flex flex-wrap items-start justify-between gap-3 border-t border-[var(--border-hairline)] pt-3"><div className="min-w-[240px] flex-1"><strong className="text-sm">{item.source}</strong><p className="text-xs text-[var(--text-secondary)]">{new Date(item.created_at).toLocaleString('en-IN')} · {item.imported_ids.length}/{item.detected_count} added · {accounts.find((account) => account.id === item.account_id)?.name || 'account unavailable'} · {item.status}</p>{(item.skipped_rows?.length || 0) > 0 && <details className="mt-2 text-xs"><summary className="cursor-pointer">{item.skipped_rows!.length} skipped or not imported · view reasons</summary><ul className="mt-2 space-y-1 pl-4">{item.skipped_rows!.map((row, index) => <li key={`${row.transaction_date}-${index}`}>{row.transaction_date} · {formatPaiseToINR(BigInt(row.amount_paise))} · {row.state.replace('_', ' ')} · {skipReasonLabel(row.reason)}</li>)}</ul></details>}{confirmUndoId === item.id && <div className="mt-2 flex items-center gap-2 text-xs"><span>Remove these {item.imported_ids.length} unchanged rows from the active ledger?</span><button onClick={() => void undoBatchFor(item)} className="rounded-md bg-rose-700 px-2 py-1 text-white">Confirm undo</button><button onClick={() => setConfirmUndoId(null)} className="rounded-md border px-2 py-1">Cancel</button></div>}</div><div className="flex gap-2">{(item.status === 'partial' || item.status === 'processing') && <button disabled={retryingBatchId === item.id} onClick={() => void retryBatchSync(item)} className="rounded-md border px-3 py-2 text-xs disabled:opacity-50">{retryingBatchId === item.id ? 'Syncing…' : 'Retry sync'}</button>}{(item.status === 'completed' || item.status === 'partial') && confirmUndoId !== item.id && <button onClick={() => setConfirmUndoId(item.id)} className="rounded-md border border-[var(--border-subtle)] px-3 py-2 text-xs">Undo batch</button>}</div></div>)}</div></aside>}
    <CrossAccountReconciliation accounts={accounts} onReconciled={() => onImported(0)} />
    <aside className="rounded-xl border border-[var(--border-hairline)] p-4 text-xs text-[var(--text-secondary)] space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <strong className="text-[var(--text-primary)]">Format &amp; Bank Compatibility</strong>
          <p className="mt-1">SpendSense uses generic transaction-table matching and identifies common Indian banks from statement text.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCompatibility((open) => !open)}
          className="rounded-md border border-[var(--border-subtle)] px-2.5 py-1 text-xs font-medium hover:bg-[var(--bg-subtle)]"
        >
          {showCompatibility ? 'Hide bank compatibility matrix' : 'View bank compatibility matrix'}
        </button>
      </div>

      {showCompatibility && (
        <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--border-hairline)]">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--bg-subtle)] text-[11px] text-[var(--text-muted)] uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2">Bank / Format</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Formats</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Known Limitations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-hairline)]">
              {getStatementCompatibilityMatrix().map((item) => (
                <tr key={item.id} className="hover:bg-[var(--bg-surface)]">
                  <td className="px-3 py-2 font-medium text-[var(--text-primary)]">
                    {item.label} <span className="text-[10px] text-[var(--text-muted)]">({item.product})</span>
                  </td>
                  <td className="px-3 py-2 capitalize">{item.accountType.replace('_', ' ')}</td>
                  <td className="px-3 py-2 uppercase text-[10px]">{item.supportedFormats.join(', ')}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      item.validation === 'fixture_verified'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                    }`}>
                      {item.validation.replace('_', ' ')}
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
    </div>
  </section>;

  async function undoBatchFor(target: StatementImportBatch) {
    if (!navigator.onLine) { setError('Connect to the internet to safely undo this import batch.'); return; }
    setError('');
    try {
      const response = await fetch(`/api/backend/financial/import-batches/${target.id}/undo`, { method: 'POST' });
      const data = await response.json() as { success?: boolean; removed_count?: number; error?: string };
      if (!response.ok || !data.success) throw new Error(data.error || 'The batch could not be safely undone.');
      for (const id of target.imported_ids) {
        try { await syncEngine.deleteTransactionLocalFirst(id, userId); } catch { /* Server batch undo is authoritative; refresh will reconcile local state. */ }
      }
      await syncEngine.processQueue(userId);
      const updated = { ...target, status: 'undone' as const };
      await saveStatementImportBatch(updated);
      setHistory((current) => current.map((item) => item.id === target.id ? updated : item));
      setConfirmUndoId(null);
      setMessage(`${data.removed_count || 0} rows were safely removed from the active ledger. Batch undo is recorded on your account.`);
      void refreshAccounts();
      onImported(data.removed_count || 0);
    } catch (cause) { setError(sanitizeUserFacingError(cause, 'The batch could not be safely undone.')); }
  }
}

function money(paise: bigint) { return formatPaiseToINR(paise); }
function skipReasonLabel(reason: NonNullable<StatementImportBatch['skipped_rows']>[number]['reason']) {
  return ({ possible_duplicate: 'possible duplicate; review manually', ambiguous: 'classification needs review', balance_mismatch: 'balance or extraction review needed', deselected: 'not selected for import', import_error: 'not added because import was interrupted' } as const)[reason];
}

async function getExistingTransactions(userId: string): Promise<{ rows: ExistingLedgerRow[]; complete: boolean }> {
  const rows: ExistingLedgerRow[] = [];
  try {
    for (let page = 1; page <= 100; page++) {
      const response = await fetchTransactions({ page, page_size: 100, sort_by: 'date_desc' });
      rows.push(...response.items);
      if (!response.has_more) return { rows, complete: true };
    }
    return { rows, complete: false };
  } catch { /* Offline operation can still use the device's ledger cache. */ }
  if (rows.length) return { rows, complete: false };
  return { rows: await getCachedTransactions(userId), complete: false };
}

function safeSourceName(name: string) {
  return name.replace(/[A-Z]{5}\d{4}[A-Z]/gi, '[PAN]').replace(/\b\d{10,18}\b/g, '[identifier]').slice(0, 180);
}

async function hashFile(file: File): Promise<string | null> {
  try {
    if (!globalThis.crypto?.subtle) return null;
    const digest = await globalThis.crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch { return null; }
}
