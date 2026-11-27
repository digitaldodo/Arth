'use client';

import { useEffect, useRef, useState } from 'react';
import { v7 as uuidv7 } from 'uuid';
import { formatPaiseToINR, parseNonNegativeINRToPaise, paiseToDecimal } from '@arth/contracts';
import { sanitizeUserFacingError } from '@/lib/error-utils';
import { detectTaxFieldCandidates, type DocumentExtractionMethod, type ExtractedTaxCandidate } from './document-extractor';
import { classifyTaxDocument, type DocumentClassificationSuggestion, type TaxDocumentKind } from './document-classifier';

type DocumentKind = TaxDocumentKind;
type PendingExtraction = { fields: ExtractedTaxCandidate[]; method: DocumentExtractionMethod; classification: DocumentClassificationSuggestion };
type ExtractedField = { id: string; document_id: string; field_key: string; field_value: { amount_paise?: string; value?: string; currency?: string; [key: string]: unknown }; source_page: number | null; source_location: string | null; extraction_method: 'text_pdf' | 'ocr_local' | 'spreadsheet' | 'manual'; confidence: number; verification_status: 'extracted' | 'awaiting_confirmation' | 'verified' | 'conflicting' | 'evidence_required' | 'not_applicable' | 'manual_review' };
type TaxDocument = { id: string; document_type: DocumentKind; display_name: string; tax_year: string | null; assessment_year: string | null; issuer_name: string | null; document_status: string; created_at: string; fields: ExtractedField[] };
const DOCUMENT_TYPES: Array<[DocumentKind, string]> = [
  ['form16', 'Form 16'], ['form16a', 'Form 16A'], ['form130', 'Form 130'], ['form131', 'Form 131'], ['form26as', 'Form 26AS'], ['ais', 'AIS'], ['tis', 'TIS'], ['payslip', 'Payslip'], ['investment_declaration', 'Investment declaration'], ['epf', 'EPF statement'], ['ppf', 'PPF statement'], ['life_insurance', 'Life insurance receipt'], ['elss', 'ELSS statement'], ['nps', 'NPS statement'], ['health_insurance', 'Health insurance receipt'], ['home_loan_interest', 'Home loan interest certificate'], ['rent_receipt', 'Rent receipt'], ['rental_agreement', 'Rental agreement'], ['tuition_fee', 'Tuition fee receipt'], ['education_loan_interest', 'Education loan interest certificate'], ['donation_receipt', 'Donation receipt'], ['fd_interest', 'Fixed deposit interest certificate'], ['savings_interest', 'Savings interest statement'], ['capital_gains', 'Capital gains statement'], ['investment_statement', 'Investment statement'], ['bank_statement', 'Bank statement'], ['other_tax_document', 'Other tax document'],
];
const FIELD_LABELS: Record<string, string> = {
  'salary.gross': 'Gross salary', 'salary.taxable': 'Taxable salary', 'tax.tds': 'TDS deducted',
  'income.interest': 'Interest income', 'deduction.old_regime': 'Old-regime deductions (user reviewed)',
  'salary.exemptions': 'Salary exemptions', 'salary.standard_deduction': 'Standard deduction',
  'tax.total_liability': 'Tax payable', 'deduction.section_80c': 'Eligible savings deduction (Section 80C / Schedule XV)',
  'deduction.section_80d': 'Health insurance deduction', 'deduction.section_80ccd_1b': 'Additional NPS deduction',
  'deduction.employer_nps': 'Employer NPS contribution', 'deduction.home_loan_interest': 'Home loan interest deduction',
  'deduction.education_loan_interest': 'Education loan interest deduction', 'deduction.donations': 'Eligible donations deduction',
  'deduction.savings_interest': 'Savings interest deduction', 'tax.credit': 'Other tax credits',
};
export function DocumentsTaxCentre({ userId }: { userId: string }) {
  const [documents, setDocuments] = useState<TaxDocument[]>([]);
  const [documentKind, setDocumentKind] = useState<DocumentKind>('form16');
  const [taxYear, setTaxYear] = useState('');
  const [issuer, setIssuer] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pendingExtraction, setPendingExtraction] = useState<PendingExtraction | null>(null);
  const [metadataSuggestionConfirmed, setMetadataSuggestionConfirmed] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordPrompt, setPasswordPrompt] = useState(false);
  const [scannedPdfDetected, setScannedPdfDetected] = useState(false);
  const [allowLocalOcr, setAllowLocalOcr] = useState(false);
  const [manualValues, setManualValues] = useState<Record<string, string>>({});
  const [reviewValues, setReviewValues] = useState<Record<string, string>>({});
  const pdfPasswordCallback = useRef<((value: string) => void) | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function loadDocuments() {
    try {
      const response = await fetch('/api/backend/financial/documents', { cache: 'no-store' });
      const data = await response.json() as { documents?: Array<Omit<TaxDocument, 'fields'>>; error?: string };
      if (!response.ok) throw new Error(data.error || 'Could not load documents.');
      const docs = await Promise.all((data.documents || []).map(async (document) => {
        const fieldsResponse = await fetch(`/api/backend/financial/documents/${document.id}/fields`, { cache: 'no-store' });
        const fieldsData = await fieldsResponse.json() as { fields?: ExtractedField[] };
        return { ...document, fields: fieldsResponse.ok ? fieldsData.fields || [] : [] };
      }));
      setDocuments(docs);
    } catch (cause) { setError(sanitizeUserFacingError(cause, "We couldn't connect to SpendSense. Check your connection and try again.")); }
  }

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => { if (!cancelled) return loadDocuments(); });
    return () => { cancelled = true; };
  }, [userId]);


  async function readLocal(file: File): Promise<{ text: string; method: 'text_pdf' | 'ocr_local' | 'spreadsheet' }> {
    if (file.size > 30 * 1024 * 1024) throw new Error('Files must be 30 MB or smaller.');
    const ext = file.name.toLowerCase().split('.').pop();
    if (ext === 'pdf') {
      const text = await readPdfText(file);
      if (text.replace(/\[PAGE \d+\]/g, '').replace(/\s/g, '').length >= 40) return { text, method: 'text_pdf' };
      setScannedPdfDetected(true);
      if (!allowLocalOcr) throw new Error('This PDF has no usable text layer. Review the local OCR option below to extract values on this device, or enter them manually.');
      return { text: await readPdfOcr(file), method: 'ocr_local' };
    }
    if (ext === 'csv') return { text: await file.text(), method: 'spreadsheet' };
    if (ext === 'xlsx' || ext === 'xls') {
      const XLSX = await import('xlsx');
      const book = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
      return { text: book.SheetNames.map((sheet) => XLSX.utils.sheet_to_csv(book.Sheets[sheet])).join('\n'), method: 'spreadsheet' };
    }
    throw new Error('Choose a PDF, CSV, XLSX, or XLS document.');
  }

  async function readPdfText(file: File): Promise<string> {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
    const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
    task.onPassword = (updatePassword: (password: string) => void, reason: number) => {
      pdfPasswordCallback.current = updatePassword;
      setPasswordPrompt(true);
      setError(reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD
        ? 'That document password did not unlock the PDF. Try again. Passwords stay in this browser.'
        : 'This PDF is encrypted. Enter its document password to continue.');
    };
    try {
      const pdf = await task.promise;
      setPasswordPrompt(false); setError(''); pdfPasswordCallback.current = null;
      const pages: string[] = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        pages.push(`\n[PAGE ${pageNumber}]\n${content.items.filter((item) => 'str' in item).map((item) => 'str' in item ? item.str : '').join(' ')}`);
      }
      return pages.join('\n');
    } finally {
      pdfPasswordCallback.current = null;
      setPassword(''); setPasswordPrompt(false);
      await task.destroy().catch(() => {});
    }
  }

  async function readPdfOcr(file: File): Promise<string> {
    const pdfjs = await import('pdfjs-dist');
    const tesseract = await import('tesseract.js');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
    const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
    task.onPassword = (updatePassword: (password: string) => void, reason: number) => {
      pdfPasswordCallback.current = updatePassword;
      setPasswordPrompt(true);
      setError(reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD
        ? 'That document password did not unlock the PDF. Try again. Passwords stay in this browser.'
        : 'Enter the document password to unlock it locally for OCR.');
    };
    let worker: Awaited<ReturnType<typeof tesseract.createWorker>> | null = null;
    let canvas: HTMLCanvasElement | null = null;
    try {
      const pdf = await task.promise;
      if (pdf.numPages > 25) throw new Error('Local OCR is limited to 25 pages. Use a smaller file or enter the relevant values manually.');
      setPasswordPrompt(false); pdfPasswordCallback.current = null;
      worker = await tesseract.createWorker('eng+hin', tesseract.OEM.LSTM_ONLY, {
        workerPath: '/ocr/worker.min.js', corePath: '/ocr/tesseract-core-lstm.wasm.js',
        langPath: `${window.location.origin}/ocr/`, workerBlobURL: false, gzip: true,
      });
      const pages: string[] = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        setMessage(`Running local OCR on tax document page ${pageNumber} of ${pdf.numPages}…`);
        const page = await pdf.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = Math.min(2.2, 2200 / Math.max(baseViewport.width, baseViewport.height));
        const viewport = page.getViewport({ scale });
        canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('This browser could not prepare a local OCR canvas. Enter the values manually.');
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        const recognized = await worker.recognize(canvas);
        pages.push(`[PAGE ${pageNumber}] ${recognized.data.text}`);
        canvas.width = 0; canvas.height = 0; canvas = null; page.cleanup();
      }
      return pages.join('\n');
    } finally {
      if (canvas) { canvas.width = 0; canvas.height = 0; }
      if (worker) await worker.terminate().catch(() => {});
      pdfPasswordCallback.current = null; setPassword(''); setPasswordPrompt(false);
      await task.destroy().catch(() => {});
    }
  }

  async function addDocument(event: React.FormEvent) {
    event.preventDefault(); setError(''); setMessage('');
    if (!selectedFile) { setError('Choose a document first.'); return; }
    setProcessing(true);
    try {
      const { text, method } = await readLocal(selectedFile);
      const fields = detectTaxFieldCandidates(text, method);
      const classification = classifyTaxDocument(text, selectedFile.name);
      setPendingExtraction({ fields, method, classification });
      setMetadataSuggestionConfirmed(false);
      setMessage('Extraction is complete in this browser. Review the suggestions and candidate values below; nothing has been saved yet.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not process this document.'); }
    finally { setProcessing(false); setPassword(''); }
  }

  async function saveDocumentForReview() {
    if (!selectedFile || !pendingExtraction) { setError('Extract the selected document before saving it for review.'); return; }
    if (taxYear && !/^(?:AY|TY)20\d{2}-\d{2}$/.test(taxYear)) { setError('Use a tax year such as AY2026-27 or TY2026-27.'); return; }
    const suggestedTypeMismatch = Boolean(pendingExtraction.classification.documentType && pendingExtraction.classification.documentType !== documentKind);
    const suggestedPeriodMismatch = Boolean(pendingExtraction.classification.taxPeriod && pendingExtraction.classification.taxPeriod !== taxYear);
    if ((suggestedTypeMismatch || suggestedPeriodMismatch) && !metadataSuggestionConfirmed) {
      setError('Review the document type and tax period suggestions. Confirm the selected metadata explicitly if it differs or you choose to leave the period blank.'); return;
    }
    setProcessing(true); setError(''); setMessage('');
    try {
      const fileHash = await sha256(selectedFile);
      const id = uuidv7();
      const metadata = await fetch('/api/backend/financial/documents', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ id, document_type: documentKind, display_name: safeDocumentName(selectedFile.name), tax_year: taxYear || null,
          assessment_year: taxYear.startsWith('AY') ? taxYear : null, issuer_name: issuer.trim() || null,
          mime_type: mimeFor(selectedFile.name), file_size_bytes: selectedFile.size, file_sha256: fileHash,
          retention_mode: 'metadata_only' }),
      });
      const metadataResult = await metadata.json() as { document?: TaxDocument; error?: string };
      if (!metadata.ok || !metadataResult.document) throw new Error(metadataResult.error || 'Could not save document metadata.');
      for (const field of pendingExtraction.fields) {
        const response = await fetch(`/api/backend/financial/documents/${id}/fields`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ field_key: field.key, field_value: { amount_paise: parseNonNegativeINRToPaise(field.value).toString(), currency: 'INR' }, source_page: field.page,
            source_location: field.location, extraction_method: pendingExtraction.method, confidence: field.confidence }),
        });
        if (!response.ok) throw new Error('Document metadata saved, but one or more extracted fields could not be saved. Delete this document and retry.');
      }
      setMessage(pendingExtraction.fields.length ? `${pendingExtraction.fields.length} candidate values saved from local extraction. Verify each value against the source before using it.` : 'Document metadata saved. No supported values were confidently identified; enter relevant amounts manually for review.');
      setSelectedFile(null); setPendingExtraction(null); setIssuer(''); setScannedPdfDetected(false); setAllowLocalOcr(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadDocuments();
    } catch (cause) { setError(sanitizeUserFacingError(cause, 'Could not process this document.')); }
    finally { setProcessing(false); setPassword(''); }
  }

  async function addManualField(document: TaxDocument, key: string) {
    const value = manualValues[`${document.id}:${key}`] || '';
    let amountPaise: string;
    try { amountPaise = parseNonNegativeINRToPaise(value).toString(); } catch { setError('Enter a valid INR amount with no more than two decimal places.'); return; }
    const response = await fetch(`/api/backend/financial/documents/${document.id}/fields`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ field_key: key, field_value: { amount_paise: amountPaise, currency: 'INR' }, source_page: null, source_location: 'Entered by the user from the source document', extraction_method: 'manual', confidence: 1 }),
    });
    if (!response.ok) { setError('Could not save the manual value.'); return; }
    setManualValues((current) => ({ ...current, [`${document.id}:${key}`]: '' })); await loadDocuments();
  }

  async function reviewField(document: TaxDocument, field: ExtractedField, status: ExtractedField['verification_status']) {
    const raw = reviewValues[field.id] ?? editableAmount(field.field_value);
    let amountPaise: string;
    try { amountPaise = parseNonNegativeINRToPaise(raw).toString(); } catch { setError('Enter a valid INR amount with no more than two decimal places.'); return; }
    const response = await fetch(`/api/backend/financial/documents/${document.id}/fields/${field.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ field_value: { amount_paise: amountPaise, currency: 'INR' }, verification_status: status }),
    });
    if (!response.ok) { setError('Could not save the field review.'); return; }
    await loadDocuments();
  }

  async function deleteDocument(document: TaxDocument) {
    if (!window.confirm(`Delete ${document.display_name} and its extracted values?`)) return;
    const response = await fetch(`/api/backend/financial/documents/${document.id}`, { method: 'DELETE' });
    if (!response.ok) { setError('Could not delete the document.'); return; }
    setDocuments((current) => current.filter((item) => item.id !== document.id));
  }

  const inputClass = 'mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15';
  return <section className="space-y-6 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4 shadow-sm sm:p-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-400">Document workspace</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">Tax documents</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">Organize tax evidence, review extracted values, and decide what becomes part of your financial record.</p></div>
      <span className="rounded-full border border-emerald-700/20 bg-emerald-700/5 px-3 py-1.5 text-xs font-medium text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/5 dark:text-emerald-300">Private by design</span>
    </header>
    <div className="grid gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] p-4 sm:grid-cols-3">
      <div><p className="text-xs font-semibold text-[var(--text-primary)]">1 · Process on this device</p><p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">PDF text, spreadsheets, optional OCR, and document passwords stay in this browser.</p></div>
      <div><p className="text-xs font-semibold text-[var(--text-primary)]">2 · Review before saving</p><p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">Extracted values stay unverified until you compare them with your source.</p></div>
      <div><p className="text-xs font-semibold text-[var(--text-primary)]">3 · Keep only useful records</p><p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">SpendSense saves selected values and provenance, not the original file. Delete a document to remove its saved values.</p></div>
    </div>
    <form onSubmit={(event) => void addDocument(event)} className="grid gap-4 rounded-xl border border-[var(--border-subtle)] p-4 sm:p-5 md:grid-cols-2">
      <label className="text-xs font-medium text-[var(--text-secondary)] min-w-0">Document type<select className={inputClass} value={documentKind} onChange={(event) => { setDocumentKind(event.target.value as DocumentKind); setMetadataSuggestionConfirmed(false); }}>{DOCUMENT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="text-xs font-medium text-[var(--text-secondary)] min-w-0">Tax year / assessment year<input className={inputClass} value={taxYear} onChange={(event) => { setTaxYear(event.target.value); setMetadataSuggestionConfirmed(false); }} placeholder="AY2026-27 or TY2026-27" /></label>
      <label className="text-xs font-medium text-[var(--text-secondary)] min-w-0">Issuer <span className="font-normal">(optional)</span><input className={inputClass} value={issuer} onChange={(event) => setIssuer(event.target.value)} maxLength={100} /></label>
      <label className="text-xs font-medium text-[var(--text-secondary)] min-w-0">Choose a source file<input ref={fileInputRef} className="mt-1 block w-full max-w-full overflow-hidden cursor-pointer rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-2.5 sm:p-3 text-xs file:mr-2.5 file:rounded-md file:border-0 file:bg-[var(--bg-surface-subtle)] file:px-2.5 file:py-1.5 file:text-xs file:font-medium" type="file" accept=".pdf,.csv,.xlsx,.xls" onChange={(event) => { setSelectedFile(event.target.files?.[0] || null); setPendingExtraction(null); setMetadataSuggestionConfirmed(false); setScannedPdfDetected(false); setAllowLocalOcr(false); }} /></label>
      {scannedPdfDetected && <label className="flex items-start gap-2 rounded-md border border-[var(--border-subtle)] p-3 text-xs md:col-span-2"><input type="checkbox" checked={allowLocalOcr} onChange={(event) => setAllowLocalOcr(event.target.checked)} /><span><strong>Run local OCR in this browser</strong><br />OCR uses bundled English/Hindi files on this device, processes up to 25 pages, and can misread amounts. The PDF is not uploaded. Extracted values will have low confidence and require review.</span></label>}
      <button className="w-full sm:w-fit rounded-lg bg-[var(--action-primary-bg)] px-4 py-2.5 text-sm font-medium text-[var(--action-primary-fg)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50" type="submit" disabled={processing || !selectedFile}>{processing ? 'Reading locally…' : pendingExtraction ? 'Extract again locally' : 'Read file on this device'}</button>
      {passwordPrompt && <label className="text-xs min-w-0 md:col-span-2">PDF document password<div className="mt-1 flex flex-wrap gap-2"><input className={`${inputClass} flex-1 min-w-[160px]`} type={showPassword ? 'text' : 'password'} autoComplete="off" value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" className="min-h-10 rounded-md border px-3 text-xs" onClick={() => setShowPassword((value) => !value)}>{showPassword ? 'Hide' : 'Show'}</button><button type="button" className="min-h-10 rounded-md border px-3 text-xs font-medium" onClick={() => { if (password && pdfPasswordCallback.current) { pdfPasswordCallback.current(password); setPassword(''); setError(''); } }}>Unlock locally</button></div></label>}
    </form>
    {pendingExtraction && <section className="space-y-3 rounded-lg border border-[var(--border-subtle)] p-4"><div><h3 className="font-medium">Review local extraction before saving</h3><p className="mt-1 text-xs text-[var(--text-secondary)]">Suggestions are based on document text and may be wrong. Confirm the selected type, year and issuer above. Extracted amounts remain unverified until you review them against the document.</p></div><div className="grid gap-2 text-xs sm:grid-cols-3"><p>Type suggestion: <strong>{pendingExtraction.classification.documentType ? DOCUMENT_TYPES.find(([kind]) => kind === pendingExtraction.classification.documentType)?.[1] : 'Not identified'}</strong> · {Math.round(pendingExtraction.classification.typeConfidence * 100)}% confidence</p><p>Period suggestion: <strong>{pendingExtraction.classification.taxPeriod || (pendingExtraction.classification.periodCandidates.length ? 'Conflicting periods' : 'Not identified')}</strong>{pendingExtraction.classification.periodCandidates.length > 1 && ` · ${pendingExtraction.classification.periodCandidates.join(', ')}`}</p><p>Issuer suggestion: <strong>{pendingExtraction.classification.issuer || 'Not identified'}</strong></p></div>{pendingExtraction.classification.documentType && pendingExtraction.classification.documentType !== documentKind && <p className="text-xs text-amber-700 dark:text-amber-300">The suggested type differs from the selected type. Change the selection above if the source document confirms the suggestion.</p>}{pendingExtraction.classification.taxPeriod && pendingExtraction.classification.taxPeriod !== taxYear && <p className="text-xs text-amber-700 dark:text-amber-300">The suggested period differs from the selected value (including a blank value). Change the year above or explicitly confirm the selection.</p>}{pendingExtraction.classification.issuer && !issuer && <button type="button" className="w-fit rounded border px-2 py-1 text-[11px]" onClick={() => setIssuer(pendingExtraction.classification.issuer || '')}>Use issuer suggestion</button>}{pendingExtraction.classification.taxPeriod && !taxYear && <button type="button" className="w-fit rounded border px-2 py-1 text-[11px]" onClick={() => { setTaxYear(pendingExtraction.classification.taxPeriod || ''); setMetadataSuggestionConfirmed(false); }}>Use period suggestion</button>}{(Boolean(pendingExtraction.classification.documentType && pendingExtraction.classification.documentType !== documentKind) || Boolean(pendingExtraction.classification.taxPeriod && pendingExtraction.classification.taxPeriod !== taxYear)) && <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={metadataSuggestionConfirmed} onChange={(event) => setMetadataSuggestionConfirmed(event.target.checked)} />I reviewed the suggestions and confirm the selected document type and tax period, even if they differ or I left the period blank.</label>}      {pendingExtraction.fields.length ? (
        <ul className="space-y-1.5 text-xs">
          {pendingExtraction.fields.map((field) => (
            <li key={`${field.key}-${field.page}`} className="flex flex-wrap items-center gap-1.5 rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-2">
              <strong>{FIELD_LABELS[field.key] || field.key}</strong>: <span className="font-mono font-medium">₹{field.value}</span>
              <span className="text-[var(--text-muted)]">· page {field.page} · {Math.round(field.confidence * 100)}% confidence · awaiting confirmation</span>
              {field.formSection && <span className="rounded bg-[var(--bg-subtle)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">{field.formSection}</span>}
              {field.crossCheckWarning && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">{field.crossCheckWarning}</span>}
            </li>
          ))}
        </ul>
      ) : <p className="text-xs text-[var(--text-muted)]">No supported fields were identified. You can still save the document metadata and add values manually later.</p>}<button type="button" disabled={processing} onClick={() => void saveDocumentForReview()} className="rounded-md border px-4 py-2 text-xs font-medium disabled:opacity-50">{processing ? 'Saving…' : 'Save selected metadata and fields for review'}</button></section>}
    {error && <p role="alert" className="rounded-md border border-red-300/50 bg-red-50/50 p-3 text-sm text-red-700 dark:text-red-300">{error}</p>}{message && <p role="status" className="text-sm text-[var(--text-secondary)]">{message}</p>}
    {documents.length === 0 ? <div className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] px-6 py-10 text-center"><p className="text-sm font-medium text-[var(--text-primary)]">Your document workspace is ready</p><p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-[var(--text-muted)]">Add a tax document to extract candidate values on this device. Nothing is saved until you review and confirm the details.</p></div> : <div className="space-y-4">{documents.map((document) => <article key={document.id} className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">{DOCUMENT_TYPES.find(([kind]) => kind === document.document_type)?.[1]} <span className="font-normal text-[var(--text-muted)]">· {document.tax_year || 'Tax year not identified'}</span></p><h3 className="mt-1 font-medium text-[var(--text-primary)]">{document.display_name}</h3><p className="mt-1 text-xs text-[var(--text-muted)]">{document.issuer_name || 'Issuer not supplied'} · Original file not stored</p></div><button type="button" className="rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition hover:border-red-400 hover:text-red-600" onClick={() => void deleteDocument(document)}>Delete record and values</button></div>
      {document.fields.length === 0 && <p className="mt-3 text-xs text-[var(--text-secondary)]">No values extracted. Add a value from the source document below.</p>}
      <div className="mt-3 space-y-3">{document.fields.map((field) => <div key={field.id} className="rounded-md border border-[var(--border-subtle)] p-3">
        <div className="grid gap-2 md:grid-cols-[1fr_180px_100px]"><label className="text-xs">{FIELD_LABELS[field.field_key] || field.field_key} (INR)<input className={inputClass} inputMode="decimal" value={reviewValues[field.id] ?? editableAmount(field.field_value)} onChange={(event) => setReviewValues((current) => ({ ...current, [field.id]: event.target.value }))} /></label><div className="text-xs text-[var(--text-secondary)]">{field.source_location || 'Manual entry'}{field.source_page ? ` · page ${field.source_page}` : ''}<p className="mt-1">{field.field_value.amount_paise ? formatPaiseToINR(BigInt(field.field_value.amount_paise)) : 'Legacy amount'} · {Math.round(field.confidence * 100)}% confidence · {field.extraction_method} · {field.verification_status}</p></div><div className="flex flex-col gap-1">{field.verification_status !== 'verified' && <button type="button" className="rounded-md border px-2 py-1 text-xs" onClick={() => void reviewField(document, field, 'verified')}>Verify value</button>}<button type="button" className="rounded-md border px-2 py-1 text-xs" onClick={() => void reviewField(document, field, 'manual_review')}>Needs review</button></div></div>
      </div>)}</div>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_180px_auto]">{Object.keys(FIELD_LABELS).map((key) => <div key={key} className="contents"><label className="sr-only" htmlFor={`${document.id}:${key}`}>{FIELD_LABELS[key]}</label><input id={`${document.id}:${key}`} className={inputClass} placeholder={`Manual ${FIELD_LABELS[key]} (₹)`} value={manualValues[`${document.id}:${key}`] || ''} onChange={(event) => setManualValues((current) => ({ ...current, [`${document.id}:${key}`]: event.target.value }))} /><span className="hidden sm:block" /><button type="button" className="rounded-md border px-3 py-1.5 text-xs" onClick={() => void addManualField(document, key)}>Add value</button></div>)}</div>
    </article>)}</div>}

    <section className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] p-4">
      <h3 className="font-medium">Tax calculation handoff</h3>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">This workspace prepares document evidence and keeps verified fields separate from extraction suggestions. Tax liability, deduction eligibility, regime comparison, and filing guidance are provided by a separate team-owned module when implemented.</p>
      <p className="mt-2 text-xs text-[var(--text-muted)]">Verified field values retain their document, page, source location, extraction method, confidence, and verification status for a future integration.</p>
    </section>  </section>;
}

function mimeFor(name: string) {
  const extension = name.toLowerCase().split('.').pop();
  if (extension === 'pdf') return 'application/pdf';
  if (extension === 'csv') return 'text/csv';
  if (extension === 'xls') return 'application/vnd.ms-excel';
  return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
}

function safeDocumentName(name: string) {
  return name.replace(/[A-Z]{5}\d{4}[A-Z]/gi, '[PAN]').replace(/\b\d{10,18}\b/g, '[identifier]').slice(0, 180);
}

async function sha256(file: File) {
  try {
    if (!globalThis.crypto?.subtle) return null;
    const hash = await globalThis.crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch { return null; }
}

function editableAmount(fieldValue: ExtractedField['field_value']) {
  if (typeof fieldValue.amount_paise === 'string' && /^\d{1,19}$/.test(fieldValue.amount_paise)) {
    try { return paiseToDecimal(BigInt(fieldValue.amount_paise)); } catch { return ''; }
  }
  if (typeof fieldValue.value === 'string') {
    try { return paiseToDecimal(parseNonNegativeINRToPaise(fieldValue.value)); } catch { return ''; }
  }
  return '';
}

