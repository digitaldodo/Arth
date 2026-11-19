import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import type { IDocumentsService, DocumentFieldRecord, DocumentRecord } from '../src/modules/documents/documents.service.js';
import type { CreateDocumentFieldInput, CreateDocumentInput, UpdateDocumentFieldInput } from '../src/modules/documents/documents.validation.js';

const userA = { userId: '11111111-1111-7111-8111-111111111111', email: 'a@example.com', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 };
const userB = { userId: '22222222-2222-7222-8222-222222222222', email: 'b@example.com', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 };
const documentId = '0190f3d0-7c00-7000-8000-000000000001';
const fieldId = '0190f3d0-7c00-7000-8000-000000000002';

class MemoryDocumentsService implements IDocumentsService {
  readonly documents = new Map<string, DocumentRecord>();
  readonly fields = new Map<string, DocumentFieldRecord>();
  lastUserId: string | null = null;

  async listDocuments(userId: string) {
    this.lastUserId = userId;
    return [...this.documents.values()].filter((document) => document.user_id === userId);
  }
  async createDocument(userId: string, input: CreateDocumentInput) {
    this.lastUserId = userId;
    const document: DocumentRecord = {
      ...input, user_id: userId, retention_mode: 'metadata_only', retained_until: null,
      document_status: 'awaiting_review', created_at: new Date().toISOString(),
    };
    this.documents.set(document.id, document);
    return document;
  }
  async deleteDocument(userId: string, id: string) {
    this.lastUserId = userId;
    const document = this.documents.get(id);
    if (!document || document.user_id !== userId) return false;
    this.documents.delete(id);
    for (const [key, field] of this.fields) if (field.document_id === id && field.user_id === userId) this.fields.delete(key);
    return true;
  }
  async listFields(userId: string, id: string) {
    this.lastUserId = userId;
    return [...this.fields.values()].filter((field) => field.user_id === userId && field.document_id === id);
  }
  async createField(userId: string, id: string, input: CreateDocumentFieldInput) {
    this.lastUserId = userId;
    if (this.documents.get(id)?.user_id !== userId) throw new Error('document missing');
    const field: DocumentFieldRecord = {
      ...input, id: fieldId, user_id: userId, document_id: id, currency: 'INR',
      verification_status: 'awaiting_confirmation', verified_at: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    this.fields.set(field.id, field);
    return field;
  }
  async updateField(userId: string, id: string, targetFieldId: string, input: UpdateDocumentFieldInput) {
    this.lastUserId = userId;
    const existing = this.fields.get(targetFieldId);
    if (!existing || existing.user_id !== userId || existing.document_id !== id) return null;
    const field = { ...existing, ...input, verified_at: input.verification_status === 'verified' ? new Date().toISOString() : null };
    this.fields.set(targetFieldId, field);
    return field;
  }
}

describe('Financial document intake API', () => {
  let app: FastifyInstance;
  let service: MemoryDocumentsService;
  before(async () => {
    service = new MemoryDocumentsService();
    app = await buildApp(
      { env: 'test' },
      async (token) => token === 'a' ? userA : token === 'b' ? userB : Promise.reject(new Error('invalid token')),
      undefined, undefined, undefined, undefined, undefined, service,
    );
    await app.ready();
  });

  test('requires authentication and keeps document lists scoped to the authenticated account', async () => {
    assert.equal((await app.inject({ method: 'GET', url: '/api/v1/financial/documents' })).statusCode, 401);
    service.documents.set(documentId, {
      id: documentId, user_id: userA.userId, document_type: 'form16', display_name: 'Form 16.pdf',
      tax_year: 'AY2026-27', assessment_year: 'AY2026-27', issuer_name: null, retention_mode: 'metadata_only',
      retained_until: null, document_status: 'awaiting_review', created_at: new Date().toISOString(),
    });
    const response = await app.inject({ method: 'GET', url: '/api/v1/financial/documents', headers: { authorization: 'Bearer b' } });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json().documents, []);
    assert.equal(service.lastUserId, userB.userId);
  });

  test('validates metadata, masks identifiers, and stores only metadata for local-first processing', async () => {
    const headers = { authorization: 'Bearer a' };
    const invalid = await app.inject({ method: 'POST', url: '/api/v1/financial/documents', headers, payload: {
      id: documentId, document_type: 'form16', display_name: 'salary.exe', tax_year: 'AY2026-27',
      assessment_year: null, issuer_name: null, mime_type: 'application/x-msdownload', file_size_bytes: 10, file_sha256: null,
    } });
    assert.equal(invalid.statusCode, 400);

    const response = await app.inject({ method: 'POST', url: '/api/v1/financial/documents', headers, payload: {
      id: documentId, document_type: 'form16', display_name: 'Form 16 ABCDE1234F.pdf', tax_year: 'AY2026-27',
      assessment_year: 'AY2026-27', issuer_name: null, mime_type: 'application/pdf', file_size_bytes: 1200,
      file_sha256: 'a'.repeat(64), retention_mode: 'retain_until', storage_path: 'unsafe/path',
    } });
    assert.equal(response.statusCode, 201);
    assert.equal(response.json().document.display_name, 'Form 16 [PAN].pdf');
    assert.equal(response.json().document.retention_mode, 'metadata_only');
    assert.equal(response.json().document.storage_path, undefined);
  });

  test('creates provenance-aware fields unverified, redacts source identifiers, and verifies only the owner field', async () => {
    const headers = { authorization: 'Bearer a' };
    const response = await app.inject({ method: 'POST', url: `/api/v1/financial/documents/${documentId}/fields`, headers, payload: {
      field_key: 'salary.gross', field_value: { value: '1200000', currency: 'INR' }, source_page: 2,
      source_location: 'PAN ABCDE1234F gross salary 1200000', extraction_method: 'text_pdf', confidence: 0.78,
    } });
    assert.equal(response.statusCode, 201);
    assert.equal(response.json().field.verification_status, 'awaiting_confirmation');
    assert.equal(response.json().field.source_location, 'PAN [PAN] gross salary 1200000');
    assert.equal(response.json().field.currency, 'INR');
    assert.deepEqual(response.json().field.field_value, { amount_paise: '120000000', currency: 'INR' });

    const foreign = await app.inject({ method: 'PATCH', url: `/api/v1/financial/documents/${documentId}/fields/${fieldId}`, headers: { authorization: 'Bearer b' }, payload: {
      field_value: { value: '1' }, verification_status: 'verified',
    } });
    assert.equal(foreign.statusCode, 404);
    const verified = await app.inject({ method: 'PATCH', url: `/api/v1/financial/documents/${documentId}/fields/${fieldId}`, headers, payload: {
      field_value: { value: '1200000' }, verification_status: 'verified',
    } });
    assert.equal(verified.statusCode, 200);
    assert.ok(verified.json().field.verified_at);
  });

  test('stores decimal rupee facts as exact integer paise without floating-point conversion', async () => {
    const response = await app.inject({ method: 'POST', url: `/api/v1/financial/documents/${documentId}/fields`, headers: { authorization: 'Bearer a' }, payload: {
      field_key: 'salary.gross', field_value: { amount_paise: '12000050', currency: 'INR' }, source_page: null,
      source_location: null, extraction_method: 'manual', confidence: 1,
    } });
    assert.equal(response.statusCode, 201);
    assert.deepEqual(response.json().field.field_value, { amount_paise: '12000050', currency: 'INR' });
  });

  test('deleting a document deletes only that user’s document and dependent facts', async () => {
    const headers = { authorization: 'Bearer a' };
    const response = await app.inject({ method: 'DELETE', url: `/api/v1/financial/documents/${documentId}`, headers });
    assert.equal(response.statusCode, 200);
    assert.equal(service.documents.has(documentId), false);
    assert.equal(service.fields.has(fieldId), false);
    const foreign = await app.inject({ method: 'DELETE', url: `/api/v1/financial/documents/${documentId}`, headers: { authorization: 'Bearer b' } });
    assert.equal(foreign.statusCode, 404);
  });
});
