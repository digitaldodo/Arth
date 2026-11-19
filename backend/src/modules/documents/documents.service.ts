import { createClient } from '@supabase/supabase-js';
import { v7 as uuidv7 } from 'uuid';
import type { AppConfig } from '../../config/index.js';
import type { CreateDocumentFieldInput, CreateDocumentInput, UpdateDocumentFieldInput } from './documents.validation.js';

export interface DocumentRecord {
  id: string;
  user_id: string;
  document_type: string;
  display_name: string;
  tax_year: string | null;
  assessment_year: string | null;
  issuer_name: string | null;
  retention_mode: 'metadata_only' | 'retain_until';
  retained_until: string | null;
  document_status: string;
  created_at: string;
  updated_at?: string;
}

export interface DocumentFieldRecord {
  id: string;
  user_id: string;
  document_id: string;
  field_key: string;
  field_value: { amount_paise: string; currency: 'INR' };
  currency: 'INR';
  source_page: number | null;
  source_location: string | null;
  extraction_method: string;
  confidence: number;
  verification_status: string;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface IDocumentsService {
  listDocuments(userId: string, token?: string): Promise<DocumentRecord[]>;
  createDocument(userId: string, input: CreateDocumentInput, token?: string): Promise<DocumentRecord>;
  deleteDocument(userId: string, id: string, token?: string): Promise<boolean>;
  listFields(userId: string, documentId: string, token?: string): Promise<DocumentFieldRecord[]>;
  createField(userId: string, documentId: string, input: CreateDocumentFieldInput, token?: string): Promise<DocumentFieldRecord>;
  updateField(userId: string, documentId: string, fieldId: string, input: UpdateDocumentFieldInput, token?: string): Promise<DocumentFieldRecord | null>;
}

export class SupabaseDocumentsService implements IDocumentsService {
  constructor(private readonly config: AppConfig) {}

  private client(token?: string) {
    if (!this.config.supabaseUrl || !this.config.supabaseAnonKey) throw new Error('DATABASE_NOT_CONFIGURED');
    return createClient(this.config.supabaseUrl, this.config.supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    });
  }

  async listDocuments(userId: string, token?: string): Promise<DocumentRecord[]> {
    const { data, error } = await this.client(token).from('financial_documents')
      .select('id,user_id,document_type,display_name,tax_year,assessment_year,issuer_name,retention_mode,retained_until,document_status,created_at,updated_at')
      .eq('user_id', userId).neq('document_status', 'deleted').order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as DocumentRecord[];
  }

  async createDocument(userId: string, input: CreateDocumentInput, token?: string): Promise<DocumentRecord> {
    const { data, error } = await this.client(token).from('financial_documents').insert({
      ...input,
      user_id: userId,
      retention_mode: 'metadata_only',
      storage_path: null,
      retained_until: null,
      document_status: 'awaiting_review',
    }).select('id,user_id,document_type,display_name,tax_year,assessment_year,issuer_name,retention_mode,retained_until,document_status,created_at,updated_at').single();
    if (error) throw error;
    return data as DocumentRecord;
  }

  async deleteDocument(userId: string, id: string, token?: string): Promise<boolean> {
    const client = this.client(token);
    const { data: document, error: getError } = await client.from('financial_documents')
      .select('id,storage_path').eq('id', id).eq('user_id', userId).maybeSingle();
    if (getError) throw getError;
    if (!document) return false;
    if (document.storage_path) {
      const { error: storageError } = await client.storage.from('arth-private-documents').remove([document.storage_path]);
      if (storageError) throw storageError;
    }
    const { data, error } = await client.from('financial_documents').delete().eq('id', id).eq('user_id', userId).select('id').maybeSingle();
    if (error) throw error;
    return Boolean(data);
  }

  async listFields(userId: string, documentId: string, token?: string): Promise<DocumentFieldRecord[]> {
    const { data, error } = await this.client(token).from('tax_extracted_fields').select('*')
      .eq('user_id', userId).eq('document_id', documentId).order('created_at');
    if (error) throw error;
    return (data || []) as DocumentFieldRecord[];
  }

  async createField(userId: string, documentId: string, input: CreateDocumentFieldInput, token?: string): Promise<DocumentFieldRecord> {
    const { data, error } = await this.client(token).from('tax_extracted_fields').insert({
      id: uuidv7(), user_id: userId, document_id: documentId, ...input, currency: 'INR',
      verification_status: 'awaiting_confirmation', verified_at: null,
    }).select('*').single();
    if (error) throw error;
    return data as DocumentFieldRecord;
  }

  async updateField(userId: string, documentId: string, fieldId: string, input: UpdateDocumentFieldInput, token?: string): Promise<DocumentFieldRecord | null> {
    const { data, error } = await this.client(token).from('tax_extracted_fields').update({
      field_value: input.field_value,
      verification_status: input.verification_status,
      verified_at: input.verification_status === 'verified' ? new Date().toISOString() : null,
    }).eq('id', fieldId).eq('document_id', documentId).eq('user_id', userId).select('*').maybeSingle();
    if (error) throw error;
    return data as DocumentFieldRecord | null;
  }
}
