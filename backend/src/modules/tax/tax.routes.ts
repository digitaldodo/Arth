import { createClient } from '@supabase/supabase-js';
import { v7 as uuidv7 } from 'uuid';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { AppConfig } from '../../config/index.js';
import { compareTax, serializeTaxComparison, type TaxEstimateInput } from './tax-engine.js';
import { isValidSkippedRows } from './statement-batch.validation.js';
import type { DeductionClaims } from './tax-deductions.js';

export interface TaxRoutesOptions { config: AppConfig }
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const YEAR = /^(?:AY|TY)20\d{2}-\d{2}$/;
const DOCUMENT_TYPES = new Set([
  'form16', 'form16a', 'form130', 'form131', 'form26as', 'ais', 'tis', 'payslip', 'investment_declaration',
  'epf', 'ppf', 'life_insurance', 'elss', 'nps', 'health_insurance', 'home_loan_interest', 'rent_receipt',
  'rental_agreement', 'tuition_fee', 'education_loan_interest', 'donation_receipt', 'fd_interest',
  'savings_interest', 'capital_gains', 'investment_statement', 'bank_statement', 'other_tax_document',
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function objectBody(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function safeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const result = value.trim();
  return result.length > 0 && result.length <= maxLength ? result : null;
}
function calendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function amount(value: unknown): bigint | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value);
  if (!/^\d{1,15}$/.test(text)) return null;
  return BigInt(text);
}
function signedPaise(value: unknown): string | null {
  if (typeof value !== 'string' || !/^-?\d{1,19}$/.test(value)) return null;
  try {
    const parsed = BigInt(value);
    return parsed >= -9_223_372_036_854_775_808n && parsed <= 9_223_372_036_854_775_807n ? parsed.toString() : null;
  } catch { return null; }
}
function taxInput(body: Record<string, unknown>): TaxEstimateInput | null {
  const framework = body.framework;
  const period = body.period;
  const ruleset = `${period}`;
  if (!YEAR.test(ruleset) || (framework !== 'income_tax_act_1961' && framework !== 'income_tax_act_2025')) return null;
  if ((ruleset.startsWith('AY') && framework !== 'income_tax_act_1961') || (ruleset.startsWith('TY') && framework !== 'income_tax_act_2025')) return null;
  const fields = ['salaryRupees', 'oldRegimeSalaryExemptionsRupees', 'newRegimeSalaryExemptionsRupees', 'housePropertyRupees', 'businessProfessionalRupees', 'otherNormalIncomeRupees', 'specialRateIncomeRupees', 'taxCreditsRupees'] as const;
  const parsed = Object.fromEntries(fields.map((field) => [field, amount(body[field])])) as Record<typeof fields[number], bigint | null>;
  if (Object.values(parsed).some((value) => value === null)) return null;
  const claimBody = objectBody(body.deductionClaims);
  if (!claimBody) return null;
  const claimFields = ['section123Rupees', 'additionalNpsRupees', 'healthSelfRupees', 'healthParentsRupees', 'savingsInterestRupees', 'selfOccupiedHomeInterestRupees', 'educationLoanInterestRupees', 'employerNpsRupees', 'employerNpsBaseSalaryRupees'] as const;
  const parsedClaims = Object.fromEntries(claimFields.map((field) => [field, amount(claimBody[field])])) as Record<typeof claimFields[number], bigint | null>;
  if (Object.values(parsedClaims).some((value) => value === null)) return null;
  if (!['government', 'other'].includes(String(claimBody.employerCategory)) || typeof claimBody.selfFamilySeniorCitizen !== 'boolean' || typeof claimBody.parentSeniorCitizen !== 'boolean' ||
      !Number.isInteger(claimBody.educationLoanYearsRemaining) || Number(claimBody.educationLoanYearsRemaining) < 0 || Number(claimBody.educationLoanYearsRemaining) > 8 ||
      typeof claimBody.educationLoanEligibilityConfirmed !== 'boolean' || typeof claimBody.selfOccupiedHomeInterestLargeLimitEligible !== 'boolean') return null;
  const deductionClaims: DeductionClaims = {
    ...parsedClaims as Record<typeof claimFields[number], bigint>,
    employerCategory: claimBody.employerCategory as DeductionClaims['employerCategory'],
    selfFamilySeniorCitizen: claimBody.selfFamilySeniorCitizen,
    parentSeniorCitizen: claimBody.parentSeniorCitizen,
    educationLoanYearsRemaining: Number(claimBody.educationLoanYearsRemaining),
    educationLoanEligibilityConfirmed: claimBody.educationLoanEligibilityConfirmed,
    selfOccupiedHomeInterestLargeLimitEligible: claimBody.selfOccupiedHomeInterestLargeLimitEligible,
  };
  const age = body.age;
  if (!Number.isInteger(age) || Number(age) < 18 || Number(age) > 120) return null;
  if (!['resident', 'non_resident'].includes(String(body.residentialStatus))) return null;
  if (!['individual', 'huf', 'other'].includes(String(body.taxpayerCategory))) return null;
  if (typeof body.allInputsVerified !== 'boolean') return null;
  return {
    ruleset,
    taxpayerCategory: body.taxpayerCategory as TaxEstimateInput['taxpayerCategory'], age: Number(age),
    residentialStatus: body.residentialStatus as TaxEstimateInput['residentialStatus'],
    ...parsed as Record<typeof fields[number], bigint>, deductionClaims,
    allInputsVerified: body.allInputsVerified,
  };
}

export const taxRoutes: FastifyPluginAsync<TaxRoutesOptions> = async (app: FastifyInstance, { config }) => {
  const db = (token?: string) => {
    if (!config.supabaseUrl || !config.supabaseAnonKey) throw new Error('DATABASE_NOT_CONFIGURED');
    return createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    });
  };

  app.post('/api/v1/tax/estimate', { preHandler: [app.verifyAuth] }, async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: 'Unauthorized' });
    const body = objectBody(request.body);
    const input = body && taxInput(body);
    if (!input) return reply.code(400).send({ error: 'Invalid tax estimate input. Provide a supported Act/year and non-negative whole-rupee amounts.' });
    return reply.code(200).send(serializeTaxComparison(compareTax(input)));
  });

  app.get('/api/v1/financial/accounts', { preHandler: [app.verifyAuth] }, async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: 'Unauthorized' });
    try {
      const client = db(request.token);
      const [{ data, error }, { data: balances, error: balanceError }] = await Promise.all([
        client.from('financial_accounts').select('*').eq('user_id', request.user.userId).order('created_at', { ascending: false }),
        client.rpc('fn_financial_account_balances'),
      ]);
      if (error) throw error;
      if (balanceError) throw balanceError;
      const currentByAccount = new Map(((balances || []) as Array<{ account_id: string; current_balance_paise: string }>).map((balance) => [balance.account_id, balance.current_balance_paise]));
      return reply.send({ accounts: (data || []).map((account) => ({
        ...account, current_balance_paise: currentByAccount.get(account.id) ?? String(account.opening_balance_paise),
      })) });
    } catch (error) { return sendFailure(reply, error, config); }
  });

  app.post('/api/v1/financial/accounts', { preHandler: [app.verifyAuth] }, async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: 'Unauthorized' });
    const body = objectBody(request.body);
    const name = body && safeText(body.name, 80), institution = body && safeText(body.institution, 100);
    const accountType = body?.account_type;
    const tail = body?.account_number_last4;
    const opening = body?.opening_balance_paise;
    const openingDate = body?.opening_balance_date;
    if (!body || !name || !institution || !['bank', 'credit_card', 'cash', 'wallet', 'investment', 'loan'].includes(String(accountType)) || (tail !== null && tail !== undefined && !/^\d{4}$/.test(String(tail))) || (opening !== undefined && (typeof opening !== 'string' || !/^-?\d{1,15}$/.test(opening))) || (openingDate !== undefined && openingDate !== null && !calendarDate(openingDate)) || ((opening !== undefined && opening !== '0') && !openingDate)) return reply.code(400).send({ error: 'Invalid account details. Only the last four account digits may be stored; non-zero opening balances require a valid as-of date.' });
    try {
      const { data, error } = await db(request.token).from('financial_accounts').insert({
        id: uuidv7(), user_id: request.user.userId, name, institution, account_type: accountType,
        account_number_last4: tail || null, currency: 'INR', opening_balance_paise: opening || '0', opening_balance_date: openingDate || null,
      }).select('*').single();
      if (error) throw error;
      return reply.code(201).send({ account: { ...data, current_balance_paise: String(data.opening_balance_paise) } });
    } catch (error) { return sendFailure(reply, error, config); }
  });

  app.get('/api/v1/financial/transaction-links', { preHandler: [app.verifyAuth] }, async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: 'Unauthorized' });
    try {
      const client = db(request.token);
      const links: Array<Record<string, unknown>> = [];
      let truncated = false;
      for (let page = 0; page < 10; page++) {
        const { data, error } = await client.from('transaction_links')
          .select('id,user_id,source_transaction_id,target_transaction_id,relationship,confidence,explanation,status,created_by_user,created_at')
          .eq('user_id', request.user.userId).in('status', ['confirmed', 'rejected'])
          .order('created_at', { ascending: false }).range(page * 1000, page * 1000 + 999);
        if (error) throw error;
        links.push(...(data || []));
        if ((data || []).length < 1000) break;
        if (page === 9) truncated = true;
      }
      return reply.send({ links, truncated });
    } catch (error) { return sendFailure(reply, error, config); }
  });

  app.post('/api/v1/financial/transaction-links', { preHandler: [app.verifyAuth] }, async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: 'Unauthorized' });
    const body = objectBody(request.body);
    if (!body || !UUID_V7.test(String(body.id)) || !UUID_V7.test(String(body.movement_id)) || !UUID_V7.test(String(body.source_transaction_id))
      || !UUID_V7.test(String(body.target_transaction_id)) || !['transfer_pair', 'card_settlement'].includes(String(body.relationship))) {
      return reply.code(400).send({ error: 'Choose two ledger transactions and a supported reconciliation relationship.' });
    }
    try {
      const { data, error } = await db(request.token).rpc('confirm_transaction_reconciliation', {
        p_link_id: body.id, p_movement_id: body.movement_id, p_source_transaction_id: body.source_transaction_id,
        p_target_transaction_id: body.target_transaction_id, p_relationship: body.relationship,
      });
      if (error) {
        if (error.code === 'P0002') return reply.code(404).send({ error: 'One or both transactions are unavailable.' });
        if (error.code === '23505') return reply.code(409).send({ error: 'One of these transactions is already paired. Refresh reconciliation and try again.' });
        if (error.code === '22000') return reply.code(422).send({ error: error.message });
        throw error;
      }
      return reply.code(201).send({ link: data });
    } catch (error) { return sendFailure(reply, error, config); }
  });

  app.post('/api/v1/financial/transaction-links/:id/reject', { preHandler: [app.verifyAuth] }, async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: 'Unauthorized' });
    const id = (request.params as { id: string }).id;
    if (!UUID_V7.test(id)) return reply.code(400).send({ error: 'Invalid reconciliation identifier.' });
    try {
      const { data, error } = await db(request.token).rpc('reject_transaction_reconciliation', { p_link_id: id });
      if (error) throw error;
      if (!data) return reply.code(404).send({ error: 'Confirmed reconciliation was not found.' });
      return reply.send({ success: true, id });
    } catch (error) { return sendFailure(reply, error, config); }
  });

  app.get('/api/v1/financial/import-batches', { preHandler: [app.verifyAuth] }, async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: 'Unauthorized' });
    try {
      const client = db(request.token);
      const { data, error } = await client.from('statement_import_batches').select('*').eq('user_id', request.user.userId).order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      const ids = (data || []).map((batch) => batch.id);
      const transactionIds = new Map<string, string[]>();
      if (ids.length) {
        const { data: linked, error: linkError } = await client.from('transactions').select('id,import_batch_id').eq('user_id', request.user.userId).in('import_batch_id', ids).is('deleted_at', null);
        if (linkError) throw linkError;
        for (const row of linked || []) {
          const list = transactionIds.get(row.import_batch_id) || [];
          list.push(row.id); transactionIds.set(row.import_batch_id, list);
        }
      }
      return reply.send({ batches: (data || []).map((batch) => ({ ...batch, transaction_ids: transactionIds.get(batch.id) || [] })) });
    } catch (error) { return sendFailure(reply, error, config); }
  });

  app.post('/api/v1/financial/import-batches', { preHandler: [app.verifyAuth] }, async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: 'Unauthorized' });
    const body = objectBody(request.body);
    if (!body || !UUID_V7.test(String(body.id)) || !safeText(body.source_name, 180) || !['pdf', 'csv', 'xlsx', 'xls'].includes(String(body.source_format))) return reply.code(400).send({ error: 'Invalid statement import batch metadata.' });
    const allowedStatuses = new Set(['processing', 'completed', 'partial', 'failed', 'undone']);
    const optionalCount = (key: string) => Number.isInteger(body[key]) && Number(body[key]) >= 0 ? Number(body[key]) : 0;
    const openingBalance = body.opening_balance_paise === undefined || body.opening_balance_paise === null ? null : signedPaise(body.opening_balance_paise);
    const closingBalance = body.closing_balance_paise === undefined || body.closing_balance_paise === null ? null : signedPaise(body.closing_balance_paise);
    const skippedRows = body.skipped_rows === undefined ? [] : body.skipped_rows;
    if (!isValidSkippedRows(skippedRows)) return reply.code(400).send({ error: 'Skipped rows must contain only a valid date, positive integer paise, parser state and generic reason.' });
    if (body.account_id !== undefined && body.account_id !== null && !UUID.test(String(body.account_id))) return reply.code(400).send({ error: 'Invalid destination account.' });
    if (body.status !== undefined && !allowedStatuses.has(String(body.status))) return reply.code(400).send({ error: 'Invalid statement import status.' });
    if ((body.opening_balance_paise !== undefined && body.opening_balance_paise !== null && openingBalance === null) || (body.closing_balance_paise !== undefined && body.closing_balance_paise !== null && closingBalance === null)) return reply.code(400).send({ error: 'Statement balances must be signed integer paise within PostgreSQL BIGINT limits.' });
    const record = {
      id: body.id, user_id: request.user.userId,
      account_id: body.account_id || null,
      source_name: safeText(body.source_name, 180), source_format: body.source_format,
      parser_id: safeText(body.parser_id, 80) || 'generic', parser_version: safeText(body.parser_version, 40) || '1',
      statement_start: typeof body.statement_start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.statement_start) ? body.statement_start : null,
      statement_end: typeof body.statement_end === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.statement_end) ? body.statement_end : null,
      opening_balance_paise: openingBalance, closing_balance_paise: closingBalance,
      status: allowedStatuses.has(String(body.status)) ? body.status : 'processing',
      detected_count: optionalCount('detected_count'), imported_count: optionalCount('imported_count'),
      skipped_count: optionalCount('skipped_count'), duplicate_count: optionalCount('duplicate_count'),
      discrepancy_count: optionalCount('discrepancy_count'),
      skipped_rows: skippedRows,
      source_sha256: typeof body.source_sha256 === 'string' && /^[0-9a-f]{64}$/i.test(body.source_sha256) ? body.source_sha256.toLowerCase() : null,
    };
    try {
      const { data, error } = await db(request.token).from('statement_import_batches').upsert(record, { onConflict: 'id' }).select('*').single();
      if (error) throw error;
      return reply.code(201).send({ batch: data });
    } catch (error) { return sendFailure(reply, error, config); }
  });

  app.post('/api/v1/financial/import-batches/:id/undo', { preHandler: [app.verifyAuth] }, async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: 'Unauthorized' });
    const batchId = (request.params as { id: string }).id;
    if (!UUID_V7.test(batchId)) return reply.code(400).send({ error: 'Invalid statement import batch ID.' });
    try {
      const { data, error } = await db(request.token).rpc('undo_statement_import_batch', { p_batch_id: batchId });
      if (error) {
        if (error.code === 'P0002') return reply.code(404).send({ error: 'Statement import batch not found.' });
        if (error.code === 'P0001') return reply.code(409).send({ error: error.message });
        if (error.code === '42501') return reply.code(403).send({ error: 'Authentication is required to undo an import.' });
        throw error;
      }
      return reply.send({ success: true, batch_id: batchId, removed_count: Number(data || 0) });
    } catch (error) { return sendFailure(reply, error, config); }
  });

  app.get('/api/v1/financial/documents', { preHandler: [app.verifyAuth] }, async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: 'Unauthorized' });
    try {
      const { data, error } = await db(request.token).from('financial_documents').select('id,user_id,document_type,display_name,tax_year,assessment_year,issuer_name,retention_mode,retained_until,document_status,created_at,updated_at').eq('user_id', request.user.userId).neq('document_status', 'deleted').order('created_at', { ascending: false });
      if (error) throw error;
      return reply.send({ documents: data || [] });
    } catch (error) { return sendFailure(reply, error, config); }
  });

  app.post('/api/v1/financial/documents', { preHandler: [app.verifyAuth] }, async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: 'Unauthorized' });
    const body = objectBody(request.body);
    if (!body || !UUID_V7.test(String(body.id)) || !DOCUMENT_TYPES.has(String(body.document_type)) || !safeText(body.display_name, 180) || !['application/pdf', 'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'].includes(String(body.mime_type))) return reply.code(400).send({ error: 'Invalid document metadata.' });
    const record = { id: body.id, user_id: request.user.userId, document_type: body.document_type, display_name: body.display_name,
      tax_year: safeText(body.tax_year, 20), assessment_year: safeText(body.assessment_year, 20), issuer_name: safeText(body.issuer_name, 100),
      mime_type: body.mime_type,
      file_size_bytes: Number.isInteger(body.file_size_bytes) && Number(body.file_size_bytes) >= 0 && Number(body.file_size_bytes) <= 30 * 1024 * 1024 ? body.file_size_bytes : null,
      file_sha256: typeof body.file_sha256 === 'string' && /^[0-9a-f]{64}$/i.test(body.file_sha256) ? body.file_sha256.toLowerCase() : null,
      retention_mode: body.retention_mode === 'retain_until' ? 'retain_until' : 'metadata_only',
      retained_until: body.retention_mode === 'retain_until' && typeof body.retained_until === 'string' && Number.isFinite(Date.parse(body.retained_until)) ? body.retained_until : null,
      storage_path: body.retention_mode === 'retain_until' && typeof body.storage_path === 'string' && body.storage_path.startsWith(`${request.user.userId}/`) ? body.storage_path : null,
    };
    if (record.retention_mode === 'retain_until' && (!record.retained_until || !record.storage_path)) return reply.code(400).send({ error: 'Retained documents require a private user-scoped storage path and expiry.' });
    try {
      const { data, error } = await db(request.token).from('financial_documents').insert(record).select('id,user_id,document_type,display_name,tax_year,assessment_year,issuer_name,retention_mode,retained_until,document_status,created_at').single();
      if (error) throw error;
      return reply.code(201).send({ document: data });
    } catch (error) { return sendFailure(reply, error, config); }
  });

  app.delete('/api/v1/financial/documents/:id', { preHandler: [app.verifyAuth] }, async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: 'Unauthorized' });
    const id = (request.params as { id: string }).id;
    if (!UUID.test(id)) return reply.code(400).send({ error: 'Invalid document identifier.' });
    try {
      const client = db(request.token);
      const { data: document, error: getError } = await client.from('financial_documents').select('id,storage_path').eq('id', id).eq('user_id', request.user.userId).maybeSingle();
      if (getError) throw getError;
      if (!document) return reply.code(404).send({ error: 'Document not found.' });
      if (document.storage_path) {
        const { error: storageError } = await client.storage.from('arth-private-documents').remove([document.storage_path]);
        if (storageError) throw storageError;
      }
      const { error } = await client.from('financial_documents').delete().eq('id', id).eq('user_id', request.user.userId);
      if (error) throw error;
      return reply.send({ success: true, id });
    } catch (error) { return sendFailure(reply, error, config); }
  });

  app.get('/api/v1/financial/documents/:id/fields', { preHandler: [app.verifyAuth] }, async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: 'Unauthorized' });
    const documentId = (request.params as { id: string }).id;
    if (!UUID.test(documentId)) return reply.code(400).send({ error: 'Invalid document identifier.' });
    try {
      const { data, error } = await db(request.token).from('tax_extracted_fields').select('*').eq('user_id', request.user.userId).eq('document_id', documentId).order('created_at');
      if (error) throw error;
      return reply.send({ fields: data || [] });
    } catch (error) { return sendFailure(reply, error, config); }
  });

  app.post('/api/v1/financial/documents/:id/fields', { preHandler: [app.verifyAuth] }, async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: 'Unauthorized' });
    const documentId = (request.params as { id: string }).id;
    const body = objectBody(request.body);
    if (!UUID.test(documentId) || !body || !safeText(body.field_key, 100) || !body.field_value || typeof body.field_value !== 'object' || typeof body.confidence !== 'number' || body.confidence < 0 || body.confidence > 1 || !['text_pdf', 'ocr_local', 'spreadsheet', 'manual'].includes(String(body.extraction_method))) return reply.code(400).send({ error: 'Invalid extracted field.' });
    try {
      const { data, error } = await db(request.token).from('tax_extracted_fields').insert({
        id: uuidv7(), user_id: request.user.userId, document_id: documentId, field_key: body.field_key,
        field_value: body.field_value, source_page: body.source_page || null, source_location: safeText(body.source_location, 240),
        extraction_method: body.extraction_method, confidence: body.confidence,
        verification_status: 'awaiting_confirmation',
      }).select('*').single();
      if (error) throw error;
      return reply.code(201).send({ field: data });
    } catch (error) { return sendFailure(reply, error, config); }
  });

  app.patch('/api/v1/financial/documents/:documentId/fields/:fieldId', { preHandler: [app.verifyAuth] }, async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: 'Unauthorized' });
    const { documentId, fieldId } = request.params as { documentId: string; fieldId: string };
    const body = objectBody(request.body);
    if (!UUID.test(documentId) || !UUID.test(fieldId) || !body || !['verified', 'awaiting_confirmation', 'conflicting', 'evidence_required', 'not_applicable', 'manual_review'].includes(String(body.verification_status))) return reply.code(400).send({ error: 'Invalid field review update.' });
    try {
      const { data, error } = await db(request.token).from('tax_extracted_fields').update({
        field_value: body.field_value, verification_status: body.verification_status,
        verified_at: body.verification_status === 'verified' ? new Date().toISOString() : null,
      }).eq('id', fieldId).eq('document_id', documentId).eq('user_id', request.user.userId).select('*').maybeSingle();
      if (error) throw error;
      if (!data) return reply.code(404).send({ error: 'Extracted field not found.' });
      return reply.send({ field: data });
    } catch (error) { return sendFailure(reply, error, config); }
  });

  app.get('/api/v1/tax/profiles', { preHandler: [app.verifyAuth] }, async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: 'Unauthorized' });
    try {
      const { data, error } = await db(request.token).from('tax_profiles').select('*').eq('user_id', request.user.userId).order('tax_year', { ascending: false });
      if (error) throw error;
      return reply.send({ profiles: data || [] });
    } catch (error) { return sendFailure(reply, error, config); }
  });

  app.put('/api/v1/tax/profiles', { preHandler: [app.verifyAuth] }, async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: 'Unauthorized' });
    const body = objectBody(request.body);
    if (!body || !YEAR.test(String(body.tax_year)) || !['income_tax_act_1961', 'income_tax_act_2025'].includes(String(body.framework)) || !['individual', 'huf', 'other'].includes(String(body.taxpayer_category)) || !body.profile_data || typeof body.profile_data !== 'object') return reply.code(400).send({ error: 'Invalid tax profile.' });
    try {
      const { data, error } = await db(request.token).from('tax_profiles').upsert({
        id: UUID_V7.test(String(body.id)) ? body.id : uuidv7(), user_id: request.user.userId,
        framework: body.framework, tax_year: body.tax_year, ruleset_id: safeText(body.ruleset_id, 80) || String(body.tax_year),
        taxpayer_category: body.taxpayer_category, profile_data: body.profile_data,
        selected_regime: ['old', 'new'].includes(String(body.selected_regime)) ? body.selected_regime : null,
        calculation_status: ['incomplete', 'estimated', 'ready_for_review', 'unsupported'].includes(String(body.calculation_status)) ? body.calculation_status : 'incomplete',
      }, { onConflict: 'user_id,framework,tax_year' }).select('*').single();
      if (error) throw error;
      return reply.send({ profile: data });
    } catch (error) { return sendFailure(reply, error, config); }
  });
};

function sendFailure(reply: { code: (status: number) => { send: (body: unknown) => unknown } }, error: unknown, config: AppConfig): unknown {
  if (error instanceof Error && error.message === 'DATABASE_NOT_CONFIGURED') return reply.code(503).send({ error: 'Financial records storage is not configured.' });
  if (config.env !== 'test' && error instanceof Error) console.error('[FinancialRecords] Request failed:', error.name);
  return reply.code(500).send({ error: 'The financial record could not be saved. Review the request and try again.' });
}
