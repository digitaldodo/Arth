export const DOCUMENT_TYPES = new Set([
  'form16', 'form16a', 'form130', 'form131', 'form26as', 'ais', 'tis', 'payslip', 'investment_declaration',
  'epf', 'ppf', 'life_insurance', 'elss', 'nps', 'health_insurance', 'home_loan_interest', 'rent_receipt',
  'rental_agreement', 'tuition_fee', 'education_loan_interest', 'donation_receipt', 'fd_interest',
  'savings_interest', 'capital_gains', 'investment_statement', 'bank_statement', 'other_tax_document',
]);

export const DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
]);

export const DOCUMENT_FIELD_METHODS = new Set(['text_pdf', 'ocr_local', 'spreadsheet', 'manual']);
export const DOCUMENT_FIELD_STATUSES = new Set([
  'extracted', 'awaiting_confirmation', 'verified', 'conflicting', 'evidence_required', 'not_applicable', 'manual_review',
]);

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const TAX_PERIOD = /^(?:AY|TY)20\d{2}-\d{2}$/;
const MAX_FILE_SIZE_BYTES = 30 * 1024 * 1024;

export interface CreateDocumentInput {
  id: string;
  document_type: string;
  display_name: string;
  tax_year: string | null;
  assessment_year: string | null;
  issuer_name: string | null;
  mime_type: string;
  file_size_bytes: number | null;
  file_sha256: string | null;
}

export interface CreateDocumentFieldInput {
  field_key: string;
  field_value: { amount_paise: string; currency: 'INR' };
  source_page: number | null;
  source_location: string | null;
  extraction_method: string;
  confidence: number;
}

export interface UpdateDocumentFieldInput {
  field_value: { amount_paise: string; currency: 'INR' };
  verification_status: string;
}

export function validateCreateDocumentInput(value: unknown): CreateDocumentInput | null {
  if (!isRecord(value)) return null;
  const displayName = safeText(value.display_name, 180);
  const mimeType = typeof value.mime_type === 'string' ? value.mime_type : '';
  const documentType = typeof value.document_type === 'string' ? value.document_type : '';
  const size = value.file_size_bytes;
  const hash = value.file_sha256;
  const taxYear = nullableText(value.tax_year, 20);
  const assessmentYear = nullableText(value.assessment_year, 20);
  const issuer = nullableText(value.issuer_name, 100);

  if (!UUID_V7.test(String(value.id)) || !DOCUMENT_TYPES.has(documentType) || !displayName || !DOCUMENT_MIME_TYPES.has(mimeType)) return null;
  if (size !== null && (!Number.isInteger(size) || Number(size) < 0 || Number(size) > MAX_FILE_SIZE_BYTES)) return null;
  if (hash !== null && (typeof hash !== 'string' || !SHA256.test(hash))) return null;
  if (value.tax_year !== null && value.tax_year !== undefined && taxYear === null) return null;
  if (value.assessment_year !== null && value.assessment_year !== undefined && assessmentYear === null) return null;
  if (value.issuer_name !== null && value.issuer_name !== undefined && issuer === null) return null;
  if (taxYear && !TAX_PERIOD.test(taxYear)) return null;
  if (assessmentYear && !/^AY20\d{2}-\d{2}$/.test(assessmentYear)) return null;

  return {
    id: String(value.id).toLowerCase(), document_type: documentType, display_name: redactIdentifiers(displayName),
    tax_year: taxYear, assessment_year: assessmentYear, issuer_name: issuer ? redactIdentifiers(issuer) : null, mime_type: mimeType,
    file_size_bytes: size === null ? null : Number(size), file_sha256: typeof hash === 'string' ? hash.toLowerCase() : null,
  };
}

export function validateCreateDocumentFieldInput(value: unknown): CreateDocumentFieldInput | null {
  if (!isRecord(value) || !/^[a-z][a-z0-9_.-]{0,99}$/.test(String(value.field_key || ''))) return null;
  const fieldValue = normalizeFieldValue(value.field_value);
  if (!fieldValue || typeof value.confidence !== 'number' || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) return null;
  if (typeof value.extraction_method !== 'string' || !DOCUMENT_FIELD_METHODS.has(value.extraction_method)) return null;
  const sourcePage = value.source_page === null || value.source_page === undefined ? null : value.source_page;
  if (sourcePage !== null && (!Number.isInteger(sourcePage) || Number(sourcePage) < 1)) return null;
  const location = value.source_location === null || value.source_location === undefined ? null : safeText(value.source_location, 240);
  if (value.source_location !== null && value.source_location !== undefined && location === null) return null;
  return {
    field_key: String(value.field_key), field_value: fieldValue, source_page: sourcePage === null ? null : Number(sourcePage),
    source_location: location ? redactIdentifiers(location) : null, extraction_method: value.extraction_method,
    confidence: value.confidence,
  };
}

export function validateUpdateDocumentFieldInput(value: unknown): UpdateDocumentFieldInput | null {
  if (!isRecord(value) || typeof value.verification_status !== 'string' || !DOCUMENT_FIELD_STATUSES.has(value.verification_status)) return null;
  const fieldValue = normalizeFieldValue(value.field_value);
  if (!fieldValue) return null;
  return { field_value: fieldValue, verification_status: value.verification_status };
}

export function isDocumentId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength || /[\u0000-\u001f\u007f]/.test(trimmed)) return null;
  return trimmed;
}

function nullableText(value: unknown, maxLength: number): string | null {
  return value === null || value === undefined ? null : safeText(value, maxLength);
}

function redactIdentifiers(value: string): string {
  return value
    .replace(/\b[A-Z]{5}\d{4}[A-Z]\b/gi, '[PAN]')
    .replace(/\b[A-Z]{4}\d{5}[A-Z]\b/gi, '[TAN]')
    .replace(/\b\d{10,18}\b/g, '[identifier]');
}

function normalizeFieldValue(value: unknown): { amount_paise: string; currency: 'INR' } | null {
  if (!isRecord(value) || (value.currency !== undefined && value.currency !== 'INR')) return null;
  const paise = value.amount_paise;
  if (typeof paise === 'string' && /^\d{1,19}$/.test(paise)) {
    const amount = BigInt(paise);
    return amount <= 9_223_372_036_854_775_807n ? { amount_paise: amount.toString(), currency: 'INR' } : null;
  }
  // Accept legacy whole-rupee payloads and canonicalize them immediately.
  const legacy = value.value;
  if (typeof legacy !== 'string' || !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(legacy)) return null;
  const [whole, fraction = ''] = legacy.split('.');
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  return amount <= 9_223_372_036_854_775_807n ? { amount_paise: amount.toString(), currency: 'INR' } : null;
}
