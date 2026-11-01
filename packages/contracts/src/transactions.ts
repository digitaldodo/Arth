import type { TransactionType } from './categories.js';

export type PaymentMethod = 'online' | 'cash';
export type NecessityClass = 'essential' | 'optional' | 'luxury';

export interface CreateTransactionRequest {
  id: string; // Client-generated UUID v7
  amount: string; // Exact decimal string in INR (e.g. "250.00", "150.5")
  type: TransactionType;
  category_id: string; // Category UUID belonging to caller and matching type
  transaction_date: string; // YYYY-MM-DD
  payment_method: PaymentMethod;
  necessity?: NecessityClass | null; // Required if type is 'expense'; strictly null/absent if 'income'
  description?: string | null;
  notes?: string | null;
  recorded_at?: string; // Client local recording timestamp (ISO 8601) preserved across offline sync
  created_at?: string; // Client recording timestamp (ISO 8601) preserved across offline sync
}

export interface TransactionDTO {
  id: string;
  amount_paise: number;
  amount_decimal: string;
  formatted_inr: string;
  type: TransactionType;
  category_id: string;
  category_name?: string;
  transaction_date: string; // YYYY-MM-DD
  payment_method: PaymentMethod;
  necessity: NecessityClass | null;
  description: string | null;
  notes: string | null;
  recorded_at: string; // Immutable local creation timestamp used for balance baseline snapshot boundary
  created_at: string; // Server upload/insertion timestamp
  updated_at: string;
}

export interface CreateTransactionResponse {
  transaction: TransactionDTO;
  idempotent_replay?: boolean;
}

export interface UpdateTransactionRequest {
  amount?: string; // Exact decimal string in INR (e.g. "250.00", "150.5")
  type?: TransactionType;
  category_id?: string; // Category UUID belonging to caller and matching type
  transaction_date?: string; // YYYY-MM-DD
  payment_method?: PaymentMethod;
  necessity?: NecessityClass | null; // Required if type is 'expense'; strictly null/absent if 'income'
  description?: string | null;
  notes?: string | null;
  recorded_at?: string; // Client local recording timestamp (ISO 8601) preserved across offline sync
  created_at?: string; // Client recording timestamp (ISO 8601) preserved across offline sync
}

export interface UpdateTransactionResponse {
  transaction: TransactionDTO;
}

export interface DeleteTransactionResponse {
  success: boolean;
  message: string;
  id: string;
}

export interface RestoreTransactionResponse {
  transaction: TransactionDTO;
}

export interface TransactionListQuery {
  page?: number;
  page_size?: number;
  type?: TransactionType;
  category_id?: string;
  necessity?: NecessityClass;
  start_date?: string; // YYYY-MM-DD
  end_date?: string; // YYYY-MM-DD
  sort_by?: 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';
}

export interface TransactionListResponse {
  items: TransactionDTO[];
  page: number;
  page_size: number;
  total_count: number;
  has_more: boolean;
}
